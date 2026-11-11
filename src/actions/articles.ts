"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createChannelVariant,
  generateDraft,
  generateSocialPosts,
  requestInternalInfo,
  revalidateArticle,
} from "@/lib/agents/pipelines";
import { decideApproval, requestApproval, withdrawApprovals } from "@/lib/approvals";
import { logUserAction } from "@/lib/audit";
import { can, requireActionSession } from "@/lib/auth";
import { removeCalendarEntry, upsertCalendarEntry } from "@/lib/calendar";
import { CONTENT_STATUS_META, CONTENT_TYPES } from "@/lib/constants";
import { formatDateTime, parseDateInput } from "@/lib/format";
import { publishArticle } from "@/lib/publication";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { sanitizeHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus } from "@/lib/types";
import { canTransition, isLocked } from "@/lib/workflow";

const refresh = () => revalidatePath("/", "layout");

const contentTypeSchema = z.enum(CONTENT_TYPES as [string, ...string[]]);
const classificationSchema = z.enum(["internal", "external"]);
const permissionSchema = z.enum(["not_required", "unknown", "requested", "granted", "denied"]);

// --- Create ------------------------------------------------------------------
const createSchema = z.object({
  title: z.string().trim().min(3, "Geef een titel van minimaal 3 tekens.").max(200),
  contentType: contentTypeSchema,
  classification: classificationSchema,
  channel: z.string().trim().max(60).optional(),
  targetAudience: z.string().trim().max(120).optional(),
  signalId: z.uuid().optional(),
});

export async function createArticle(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const data = createSchema.parse(input);
    const db = await createClient();

    const { data: agent } = await db
      .from("agents")
      .select("id")
      .eq("kind", data.classification === "external" ? "external" : "internal")
      .maybeSingle();

    const article = unwrap(
      await db
        .from("articles")
        .insert({
          organization_id: session.organization.id,
          title: data.title,
          content_type: data.contentType as never,
          classification: data.classification,
          channel: data.channel || (data.classification === "external" ? "website" : "intranet"),
          target_audience: data.targetAudience || (data.classification === "external" ? "Klanten en relaties" : "Alle medewerkers"),
          status: data.signalId ? "new_signal" : "draft",
          author_profile_id: session.userId,
          agent_id: agent?.id ?? null,
          external_permission: data.classification === "external" ? "unknown" : "not_required",
          created_by: session.userId,
        })
        .select("id")
        .single(),
    );

    if (data.signalId) {
      check(
        await db.from("article_signals").insert({
          article_id: article.id,
          signal_id: data.signalId,
          organization_id: session.organization.id,
        }),
      );
      await db.from("content_signals").update({ status: "converted" }).eq("id", data.signalId);
    }

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.created",
      entityType: "article",
      entityId: article.id,
      summary: `Contentitem aangemaakt: “${data.title}”.`,
    });
    refresh();
    return ok("Contentitem aangemaakt.", { id: article.id });
  });
}

// --- Save content (creates a new version) -------------------------------------
const saveSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(3, "Geef een titel van minimaal 3 tekens.").max(200),
  subtitle: z.string().trim().max(300).nullable(),
  bodyHtml: z.string().max(200_000),
  changeSummary: z.string().trim().max(200).optional(),
});

export async function saveArticleContent(input: z.input<typeof saveSchema>): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit", "content.create");
    const parsed = saveSchema.parse(input);
    const data = { ...parsed, bodyHtml: sanitizeHtml(parsed.bodyHtml) };
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("*").eq("id", data.id).single());

    if (isLocked(article.status)) return fail("Goedgekeurde content is vergrendeld. Heropen het item als concept om te bewerken.");
    if (article.status === "in_review") return fail("Dit item ligt ter review. Trek het in of wacht op het besluit voordat je het bewerkt.");

    const changed =
      article.title !== data.title || (article.subtitle ?? null) !== (data.subtitle || null) || article.body_html !== data.bodyHtml;
    if (!changed) return ok("Geen wijzigingen om op te slaan.", { version: article.current_version });

    const version = article.current_version + 1;
    check(
      await db.from("content_versions").insert({
        organization_id: session.organization.id,
        article_id: article.id,
        version,
        title: data.title,
        subtitle: data.subtitle || null,
        body_html: data.bodyHtml,
        change_summary: data.changeSummary || "Handmatig bewerkt",
        created_by_profile_id: session.userId,
      }),
    );

    // Early-stage items become a draft as soon as someone writes the text.
    const nextStatus: ContentStatus =
      ["new_signal", "research", "interview_requested", "interview_completed", "changes_requested"].includes(article.status) &&
      data.bodyHtml.replace(/<[^>]+>/g, "").trim().length > 0
        ? "draft"
        : article.status;

    check(
      await db
        .from("articles")
        .update({
          title: data.title,
          subtitle: data.subtitle || null,
          body_html: data.bodyHtml,
          current_version: version,
          status: nextStatus,
          author_profile_id: article.author_profile_id ?? session.userId,
        })
        .eq("id", article.id),
    );

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.saved",
      entityType: "article",
      entityId: article.id,
      summary: `Versie ${version} opgeslagen van “${data.title}”.`,
      metadata: { version },
    });
    refresh();
    return ok(`Versie ${version} opgeslagen.`, { version });
  });
}

// --- Metadata ----------------------------------------------------------------
const metaSchema = z.object({
  id: z.uuid(),
  contentType: contentTypeSchema,
  classification: classificationSchema,
  channel: z.string().trim().max(60).nullable(),
  targetAudience: z.string().trim().max(120).nullable(),
  excerpt: z.string().trim().max(500).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  reviewerId: z.uuid().nullable(),
});

export async function updateArticleMeta(input: z.input<typeof metaSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit", "content.create");
    const data = metaSchema.parse(input);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("classification, external_permission, status").eq("id", data.id).single());

    // Switching to external always resets permission to "unknown".
    let externalPermission = article.external_permission;
    if (data.classification !== article.classification) {
      if (isLocked(article.status)) return fail("De classificatie van goedgekeurde content kan niet worden gewijzigd.");
      externalPermission = data.classification === "external" ? "unknown" : "not_required";
    }

    check(
      await db
        .from("articles")
        .update({
          content_type: data.contentType as never,
          classification: data.classification,
          channel: data.channel,
          target_audience: data.targetAudience,
          excerpt: data.excerpt,
          tags: data.tags,
          reviewer_id: data.reviewerId,
          external_permission: externalPermission,
        })
        .eq("id", data.id),
    );
    refresh();
    return ok("Eigenschappen opgeslagen.");
  });
}

/** A human confirms (or revokes) permission for external publication. */
export async function setExternalPermission(input: {
  id: string;
  permission: string;
  note?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.approve", "content.publish");
    const id = z.uuid().parse(input.id);
    const permission = permissionSchema.parse(input.permission);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("title, classification, status").eq("id", id).single());
    if (article.classification !== "external") return fail("Toestemming is alleen van toepassing op externe content.");
    if (["scheduled", "published"].includes(article.status) && permission !== "granted") {
      return fail("Dit item is al ingepland of gepubliceerd. Heropen het eerst als concept.");
    }

    check(await db.from("articles").update({ external_permission: permission }).eq("id", id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.external_permission",
      category: "approval",
      entityType: "article",
      entityId: id,
      summary: `Toestemming voor externe publicatie van “${article.title}” gezet op: ${permission}.${input.note ? ` Toelichting: ${input.note}` : ""}`,
      metadata: { permission, note: input.note ?? null },
    });
    refresh();
    return ok("Toestemming voor externe publicatie bijgewerkt.");
  });
}

// --- Workflow ----------------------------------------------------------------
export async function submitForReview(input: { id: string; reviewerId?: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit", "content.create");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("*").eq("id", id).single());
    if (!canTransition(article.status, "in_review")) {
      return fail(`Vanuit de status “${CONTENT_STATUS_META[article.status].label}” kan dit item niet ter review worden ingediend.`);
    }
    if (article.body_html.replace(/<[^>]+>/g, "").trim().length < 20) {
      return fail("Het item heeft nog geen tekst om te beoordelen.");
    }

    await requestApproval(db, session, "article", id);
    check(
      await db
        .from("articles")
        .update({ status: "in_review", reviewer_id: input.reviewerId ?? article.reviewer_id })
        .eq("id", id),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.submitted",
      category: "approval",
      entityType: "article",
      entityId: id,
      summary: `“${article.title}” (versie ${article.current_version}) ingediend ter review.`,
      requiresApproval: true,
    });
    refresh();
    return ok("Ingediend ter review.");
  });
}

const decisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  note: z.string().trim().max(2000).optional(),
});

export async function decideArticle(input: z.input<typeof decisionSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const data = decisionSchema.parse(input);
    const session = await requireActionSession(
      ...(data.decision === "changes_requested" ? (["content.review", "content.approve"] as const) : (["content.approve"] as const)),
    );
    if (data.decision !== "approved" && !data.note) {
      return fail("Geef een toelichting zodat de auteur weet wat er moet veranderen.", { note: "Toelichting is verplicht." });
    }
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("*").eq("id", data.id).single());
    if (article.status !== "in_review") return fail("Dit item ligt niet ter review.");

    const result = await decideApproval(db, session, "article", article.id, article.current_version, data.decision, data.note ?? null);
    check(
      await db.from("reviews").insert({
        organization_id: session.organization.id,
        article_id: article.id,
        version: article.current_version,
        reviewer_id: session.userId,
        recommendation: data.decision === "approved" ? "approve" : "changes_requested",
        notes: data.note ?? null,
      }),
    );

    // An approval moves the item on by itself once every step of the rule is done.
    // A refusal ends the round: the other open requests are withdrawn.
    if (data.decision !== "approved") {
      const status: ContentStatus = data.decision === "rejected" ? "archived" : "changes_requested";
      check(await db.from("articles").update({ status }).eq("id", article.id));
      await withdrawApprovals(db, "article", article.id);
    }

    const label =
      data.decision === "approved"
        ? result.state === "approved"
          ? "goedgekeurd. Het is klaar voor publicatie"
          : result.state === "next_step"
            ? `akkoord bevonden; volgende stap: ${result.label}`
            : "akkoord bevonden; wacht nog op andere akkoorden"
        : data.decision === "changes_requested"
          ? "teruggestuurd met wijzigingsverzoek"
          : "afgewezen";
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: `article.${data.decision}`,
      category: "approval",
      entityType: "article",
      entityId: article.id,
      summary: `“${article.title}” (versie ${article.current_version}) ${label}.${data.note ? ` Toelichting: ${data.note}` : ""}`,
      metadata: { version: article.current_version, decision: data.decision, state: result.state },
    });
    refresh();
    return ok(`Item ${label}.`);
  });
}

/** Reviewers record advice without taking the final decision. */
export async function addReview(input: { id: string; recommendation: string; notes: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.review", "content.approve");
    const id = z.uuid().parse(input.id);
    const recommendation = z.enum(["approve", "changes_requested", "comment"]).parse(input.recommendation);
    const notes = z.string().trim().min(3, "Schrijf een korte toelichting.").max(2000).parse(input.notes);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("title, current_version").eq("id", id).single());
    check(
      await db.from("reviews").insert({
        organization_id: session.organization.id,
        article_id: id,
        version: article.current_version,
        reviewer_id: session.userId,
        recommendation,
        notes,
      }),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.reviewed",
      category: "approval",
      entityType: "article",
      entityId: id,
      summary: `Reviewadvies gegeven op “${article.title}”: ${recommendation === "approve" ? "akkoord" : recommendation === "changes_requested" ? "wijzigingen nodig" : "opmerking"}.`,
    });
    refresh();
    return ok("Reviewadvies opgeslagen.");
  });
}

export async function scheduleArticle(input: { id: string; publishAt: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.publish");
    const id = z.uuid().parse(input.id);
    const publishAt = parseDateInput(input.publishAt);
    if (!publishAt) return fail("Kies een geldige datum en tijd.");
    if (publishAt.getTime() < Date.now() - 60_000) return fail("Kies een moment in de toekomst.");
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("*").eq("id", id).single());
    if (!["approved", "scheduled"].includes(article.status)) return fail("Alleen goedgekeurde content kan worden ingepland.");

    check(await db.from("articles").update({ status: "scheduled", publish_at: publishAt.toISOString() }).eq("id", id));
    await upsertCalendarEntry(db, {
      organizationId: session.organization.id,
      entityType: "article",
      entityId: id,
      entryType: "article",
      title: article.title,
      startsAt: publishAt.toISOString(),
      classification: article.classification,
      createdBy: session.userId,
    });
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.scheduled",
      entityType: "article",
      entityId: id,
      summary: `Publicatie van “${article.title}” ingepland op ${formatDateTime(publishAt)}.`,
      metadata: { publish_at: publishAt.toISOString() },
    });
    refresh();
    return ok("Publicatie ingepland.");
  });
}

export async function publishArticleNow(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.publish");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("*").eq("id", id).single());
    if (!["approved", "scheduled"].includes(article.status)) return fail("Alleen goedgekeurde content kan worden gepubliceerd.");

    const result = await publishArticle(db, article);
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.published",
      entityType: "article",
      entityId: id,
      summary: `“${article.title}” gepubliceerd. ${result.detail}`,
      metadata: { mode: result.mode },
    });
    refresh();
    return ok(result.mode === "cms" ? "Gepubliceerd via het CMS." : "Gepubliceerd (gesimuleerd - er is geen publicatiekanaal verbonden).");
  });
}

export async function changeArticleStatus(input: { id: string; status: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit", "content.create", "content.publish");
    const id = z.uuid().parse(input.id);
    const status = z.enum(["research", "draft", "approved", "archived", "interview_completed"]).parse(input.status);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("*").eq("id", id).single());
    if (!canTransition(article.status, status)) {
      return fail(
        `De overgang van “${CONTENT_STATUS_META[article.status].label}” naar “${CONTENT_STATUS_META[status].label}” is niet toegestaan.`,
      );
    }

    check(
      await db
        .from("articles")
        .update({ status, publish_at: status === "draft" || status === "approved" || status === "archived" ? null : article.publish_at })
        .eq("id", id),
    );
    // Pulling an item back from review withdraws the open approval request.
    if (article.status === "in_review") await withdrawApprovals(db, "article", id);
    if (["draft", "approved", "archived"].includes(status)) await removeCalendarEntry(db, "article", id, "article");

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.status_changed",
      entityType: "article",
      entityId: id,
      summary: `Status van “${article.title}” gewijzigd: ${CONTENT_STATUS_META[article.status].label} → ${CONTENT_STATUS_META[status].label}.`,
      metadata: { from: article.status, to: status },
    });
    refresh();
    return ok(`Status gewijzigd naar “${CONTENT_STATUS_META[status].label}”.`);
  });
}

export async function deleteArticle(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("title, status").eq("id", id).single());
    if (isLocked(article.status)) return fail("Goedgekeurde of gepubliceerde content kan niet worden verwijderd. Archiveer het item.");
    const { data: deleted, error } = await db.from("articles").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!deleted?.length) return fail("Je hebt geen rechten om dit item te verwijderen.");
    await removeCalendarEntry(db, "article", id);
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.deleted",
      entityType: "article",
      entityId: id,
      summary: `Contentitem “${article.title}” verwijderd.`,
    });
    refresh();
    return ok("Contentitem verwijderd.");
  });
}

export async function restoreVersion(input: { id: string; version: number }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const version = unwrap(
      await db.from("content_versions").select("*").eq("article_id", id).eq("version", input.version).single(),
    );
    const result = await saveArticleContent({
      id,
      title: version.title,
      subtitle: version.subtitle,
      bodyHtml: version.body_html,
      changeSummary: `Versie ${input.version} teruggezet`,
    });
    if (!result.ok) return result;
    return ok(`Versie ${input.version} is teruggezet als nieuwe versie.`);
  });
}

// --- Comments ----------------------------------------------------------------
const commentSchema = z.object({
  entityType: z.enum(["article", "newsletter", "signal", "interview"]),
  entityId: z.uuid(),
  body: z.string().trim().min(1, "Schrijf een opmerking.").max(4000),
  quote: z.string().trim().max(500).optional(),
  parentId: z.uuid().optional(),
});

export async function addComment(input: z.input<typeof commentSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.view");
    const data = commentSchema.parse(input);
    const db = await createClient();
    check(
      await db.from("comments").insert({
        organization_id: session.organization.id,
        entity_type: data.entityType,
        entity_id: data.entityId,
        author_profile_id: session.userId,
        body: data.body,
        quote: data.quote || null,
        parent_id: data.parentId ?? null,
      }),
    );
    refresh();
    return ok("Opmerking geplaatst.");
  });
}

export async function setCommentResolved(input: { id: string; resolved: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.view");
    const db = await createClient();
    const { data, error } = await db
      .from("comments")
      .update({ resolved: input.resolved })
      .eq("id", z.uuid().parse(input.id))
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return fail("Je kunt deze opmerking niet wijzigen.");
    refresh();
    return ok(input.resolved ? "Opmerking afgehandeld." : "Opmerking heropend.");
  });
}

export async function deleteComment(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.view");
    const db = await createClient();
    const { data, error } = await db.from("comments").delete().eq("id", z.uuid().parse(input.id)).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return fail("Je kunt alleen je eigen opmerkingen verwijderen.");
    refresh();
    return ok("Opmerking verwijderd.");
  });
}

// --- Agent actions on a content item ------------------------------------------
export async function generateDraftAction(input: { id: string; instructions?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create", "content.edit");
    const result = await generateDraft({
      organizationId: session.organization.id,
      articleId: z.uuid().parse(input.id),
      instructions: input.instructions?.trim() || null,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(
      `Concept geschreven (versie ${result.version}, merkscore ${result.brandScore}/100)${result.openQuestions.length ? ` met ${result.openQuestions.length} open punt(en)` : ""}.`,
    );
  });
}

export async function runBrandCheck(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.view");
    const result = await revalidateArticle(session.organization.id, z.uuid().parse(input.id));
    refresh();
    return ok(`Merkcontrole uitgevoerd: score ${result.score}/100, ${result.issues} aandachtspunt(en).`);
  });
}

export async function createSocialDrafts(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const result = await generateSocialPosts({
      organizationId: session.organization.id,
      articleId: z.uuid().parse(input.id),
      platforms: ["linkedin"],
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(`${result.postIds.length} LinkedIn-concept gemaakt. Je vindt het onder Extern bureau.`);
  });
}

export async function askInternalAgent(input: { id: string; question: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create", "content.edit");
    const question = z.string().trim().min(8, "Stel een concrete vraag van minimaal 8 tekens.").max(600).parse(input.question);
    const result = await requestInternalInfo({
      organizationId: session.organization.id,
      articleId: z.uuid().parse(input.id),
      question,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(
      result.found
        ? "De interne agent heeft geantwoord. Het antwoord staat bij de opmerkingen."
        : "De interne agent vond geen aanvullende informatie in de beschikbare bronnen.",
    );
  });
}

export async function createVariant(input: { id: string; channel: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const channel = z.enum(["slack", "email"]).parse(input.channel);
    const result = await createChannelVariant({
      organizationId: session.organization.id,
      articleId: z.uuid().parse(input.id),
      channel,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(channel === "slack" ? "Slack-aankondiging opgesteld als concept." : "E-mailconcept opgesteld.", { id: result.articleId });
  });
}

// --- Social posts ------------------------------------------------------------
export async function updateSocialPost(input: { id: string; body: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const body = z.string().trim().min(10, "De post is te kort.").max(3000).parse(input.body);
    const db = await createClient();
    const post = unwrap(await db.from("social_posts").select("status, current_version").eq("id", z.uuid().parse(input.id)).single());
    if (!["draft", "changes_requested"].includes(post.status)) return fail("Deze post is vergrendeld. Heropen hem als concept om te bewerken.");
    check(await db.from("social_posts").update({ body, current_version: post.current_version + 1 }).eq("id", input.id));
    refresh();
    return ok("Social post opgeslagen.");
  });
}

export async function socialPostWorkflow(input: {
  id: string;
  action: "submit" | "approve" | "request_changes" | "reopen" | "schedule" | "publish" | "delete";
  note?: string;
  publishAt?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.view");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const post = unwrap(await db.from("social_posts").select("*").eq("id", id).single());

    switch (input.action) {
      case "submit": {
        if (!can(session, "content.edit", "content.create")) return fail("Je hebt geen rechten voor deze actie.");
        if (!["draft", "changes_requested"].includes(post.status)) return fail("Deze post kan nu niet worden ingediend.");
        await requestApproval(db, session, "social_post", id);
        check(await db.from("social_posts").update({ status: "in_review" }).eq("id", id));
        refresh();
        return ok("Social post ingediend ter goedkeuring.");
      }
      case "approve":
      case "request_changes": {
        if (post.status !== "in_review") return fail("Deze post ligt niet ter review.");
        const decision = input.action === "approve" ? "approved" : "changes_requested";
        const result = await decideApproval(db, session, "social_post", id, post.current_version, decision, input.note ?? null);
        if (decision === "changes_requested") {
          check(await db.from("social_posts").update({ status: decision }).eq("id", id));
          await withdrawApprovals(db, "social_post", id);
        }
        await logUserAction(db, session.userId, {
          organizationId: session.organization.id,
          action: `social.${decision}`,
          category: "approval",
          entityType: "social_post",
          entityId: id,
          summary: `Social post (${post.platform}) ${decision === "approved" ? "goedgekeurd" : "teruggestuurd met wijzigingsverzoek"}.`,
        });
        refresh();
        return ok(
          decision !== "approved"
            ? "Wijzigingen gevraagd."
            : result.state === "approved"
              ? "Social post goedgekeurd."
              : `Akkoord vastgelegd. ${result.label ? `Volgende stap: ${result.label}.` : "De post wacht nog op andere akkoorden."}`,
        );
      }
      case "reopen": {
        if (!can(session, "content.edit")) return fail("Je hebt geen rechten voor deze actie.");
        check(await db.from("social_posts").update({ status: "draft", publish_at: null }).eq("id", id));
        if (post.status === "in_review") await withdrawApprovals(db, "social_post", id);
        await removeCalendarEntry(db, "social_post", id);
        refresh();
        return ok("Social post heropend als concept.");
      }
      case "schedule": {
        const publishAt = parseDateInput(input.publishAt);
        if (!publishAt || publishAt.getTime() < Date.now()) return fail("Kies een moment in de toekomst.");
        if (!["approved", "scheduled"].includes(post.status)) return fail("Alleen goedgekeurde posts kunnen worden ingepland.");
        check(await db.from("social_posts").update({ status: "scheduled", publish_at: publishAt.toISOString() }).eq("id", id));
        await upsertCalendarEntry(db, {
          organizationId: session.organization.id,
          entityType: "social_post",
          entityId: id,
          entryType: "social_post",
          title: `${post.platform === "linkedin" ? "LinkedIn" : post.platform}: ${post.body.split("\n")[0].slice(0, 60)}`,
          startsAt: publishAt.toISOString(),
          classification: "external",
          createdBy: session.userId,
        });
        refresh();
        return ok("Social post ingepland.");
      }
      case "publish": {
        if (!["approved", "scheduled"].includes(post.status)) return fail("Alleen goedgekeurde posts kunnen worden geplaatst.");
        check(await db.from("social_posts").update({ status: "published", publication_mode: "simulated" }).eq("id", id));
        await db.from("content_calendar").update({ status: "done" }).eq("entity_type", "social_post").eq("entity_id", id);
        await logUserAction(db, session.userId, {
          organizationId: session.organization.id,
          action: "social.published",
          entityType: "social_post",
          entityId: id,
          summary: `Social post (${post.platform}) gemarkeerd als geplaatst - gesimuleerd, er is geen LinkedIn-koppeling.`,
          metadata: { mode: "simulated" },
        });
        refresh();
        return ok("Gemarkeerd als geplaatst (gesimuleerd - plaats de tekst handmatig op LinkedIn).");
      }
      case "delete": {
        const { data, error } = await db.from("social_posts").delete().eq("id", id).select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) return fail("Deze post kan niet worden verwijderd.");
        refresh();
        return ok("Social post verwijderd.");
      }
    }
  });
}
