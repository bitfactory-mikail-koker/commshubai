"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revalidateArticle, reviseArticle } from "@/lib/agents/pipelines";
import { decideOwnApproval } from "@/lib/approvals";
import { logUserAction } from "@/lib/audit";
import { can, requireActionSession, type SessionContext } from "@/lib/auth";
import { startApprovalRound, type EntityRef } from "@/lib/redactie/approval-flow";
import { needsFinalCheck } from "@/lib/redactie/topics";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { sanitizeHtml } from "@/lib/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Approval, ApprovalEntity } from "@/lib/types";

/**
 * Goedkeuren, by the person a request was put to. Three choices on the
 * preview page: akkoord, zelf aanpassen, or ask for a change in plain words.
 * Every decision is written through the person's own session; the database
 * decides whether it is theirs to take.
 */

const refresh = () => revalidatePath("/", "layout");

const refOf = (session: SessionContext, approval: Pick<Approval, "entity_type" | "entity_id">): EntityRef => ({
  organizationId: session.organization.id,
  entityType: approval.entity_type as ApprovalEntity,
  entityId: approval.entity_id,
});

const stateMessage = (state: string, label?: string) =>
  state === "approved"
    ? "Akkoord vastgelegd. Alle akkoorden zijn binnen: het stuk is klaar voor publicatie."
    : state === "next_step"
      ? `Akkoord vastgelegd. Het stuk gaat nu naar: ${label}.`
      : "Akkoord vastgelegd. Dank je.";

export async function approveMine(input: { approvalId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const db = await createClient();
    const { approval, result } = await decideOwnApproval(db, session, z.uuid().parse(input.approvalId), "approved", null);
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: `${approval.entity_type}.approved`,
      category: "approval",
      entityType: approval.entity_type,
      entityId: approval.entity_id,
      summary: `${session.profile.full_name} gaf akkoord (${approval.step_label ?? "goedkeuring"}, versie ${approval.version}).`,
      metadata: { approval_id: approval.id, kind: approval.kind, version: approval.version },
    });
    refresh();
    return ok(stateMessage(result.state, result.label));
  });
}

/** Approves everything that is waiting for this person on one item (all own quotes at once). */
export async function approveAllMine(input: { entityType: string; entityId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const entityType = z.enum(["article", "newsletter", "social_post"]).parse(input.entityType);
    const entityId = z.uuid().parse(input.entityId);
    const db = await createClient();
    const { data: mine } = await db
      .from("approvals")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("decision", "pending")
      .contains("eligible_profile_ids", [session.userId]);
    if (!mine?.length) return fail("Er wacht hier niets op jouw akkoord.");

    let last = { state: "waiting", label: undefined as string | undefined };
    for (const row of mine) {
      const { result } = await decideOwnApproval(db, session, row.id, "approved", null);
      last = { state: result.state, label: result.label };
    }
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: `${entityType}.approved`,
      category: "approval",
      entityType,
      entityId,
      summary: `${session.profile.full_name} gaf akkoord op ${mine.length} verzoek(en).`,
    });
    refresh();
    return ok(stateMessage(last.state, last.label));
  });
}

async function returnToEditors(ref: EntityRef, note: string): Promise<void> {
  // The round stops; the editors pick it up from "Wijzigingen gevraagd".
  const admin = createAdminClient();
  const table = ref.entityType === "article" ? "articles" : ref.entityType === "newsletter" ? "newsletters" : "social_posts";
  await admin.from(table).update({ status: "changes_requested" }).eq("id", ref.entityId).eq("organization_id", ref.organizationId);
  const { error } = await admin
    .from("approvals")
    .update({ decision: "withdrawn" })
    .eq("entity_type", ref.entityType)
    .eq("entity_id", ref.entityId)
    .eq("decision", "pending");
  if (error) throw new Error(error.message);
  void note;
}

/**
 * "Aanpassing vragen": the person says in their own words what should change.
 * For an article the bot rewrites the text and everyone who already looked
 * gets the changes to confirm. When the bot cannot do it, the request goes to
 * the editors.
 */
export async function requestChange(input: { approvalId: string; note: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const note = z.string().trim().min(5, "Beschrijf in een zin wat er anders moet.").max(2000).parse(input.note);
    const db = await createClient();
    const { approval } = await decideOwnApproval(db, session, z.uuid().parse(input.approvalId), "changes_requested", note);
    const ref = refOf(session, approval);

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: `${approval.entity_type}.changes_requested`,
      category: "approval",
      entityType: approval.entity_type,
      entityId: approval.entity_id,
      summary: `${session.profile.full_name} vroeg om een aanpassing (versie ${approval.version}): ${note}`,
      metadata: { approval_id: approval.id, kind: approval.kind },
    });

    if (approval.entity_type !== "article") {
      // Editions and posts are adjusted by the editors themselves.
      await createAdminClient().from("comments").insert({
        organization_id: session.organization.id,
        entity_type: approval.entity_type,
        entity_id: approval.entity_id,
        author_profile_id: session.userId,
        body: `Aanpassing gevraagd${approval.step_label ? ` (${approval.step_label})` : ""}: ${note}`,
      });
      if (approval.kind !== "passage") await returnToEditors(ref, note);
      refresh();
      return ok("Je verzoek ligt bij de redactie. Je krijgt de aangepaste tekst opnieuw te zien.");
    }

    const revised = await reviseArticle({
      organizationId: session.organization.id,
      articleId: approval.entity_id,
      instruction: note,
      requestedByName: session.profile.full_name,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    if (revised.applied) {
      await startApprovalRound(ref, { requestedBy: approval.requested_by_profile_id });
      refresh();
      return ok(`De tekst is aangepast. ${revised.note} Kijk of het zo klopt en geef dan akkoord.`);
    }
    await returnToEditors(ref, note);
    refresh();
    return ok(`Je verzoek ligt bij de redactie. ${revised.note}`);
  });
}

/** The person quoted does not want this quote used. It is taken out of the text. */
export async function refuseQuote(input: { approvalId: string; note?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const note = z.string().trim().max(1000).optional().parse(input.note) || "Citaat geweigerd";
    const db = await createClient();
    const { approval } = await decideOwnApproval(db, session, z.uuid().parse(input.approvalId), "rejected", note);
    if (approval.kind !== "quote" || !approval.quote_text) return fail("Dit verzoek gaat niet over een citaat.");
    const ref = refOf(session, approval);

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "quote.refused",
      category: "approval",
      entityType: approval.entity_type,
      entityId: approval.entity_id,
      summary: `${session.profile.full_name} weigerde een citaat (versie ${approval.version}). Het citaat gaat uit de tekst.`,
      metadata: { approval_id: approval.id },
    });

    const revised = await reviseArticle({
      organizationId: session.organization.id,
      articleId: approval.entity_id,
      instruction: `Verwijder het citaat: “${approval.quote_text}”`,
      removeQuoteText: approval.quote_text,
      requestedByName: session.profile.full_name,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    if (revised.applied) {
      await startApprovalRound(ref, { requestedBy: approval.requested_by_profile_id });
      refresh();
      return ok("Je citaat is uit de tekst gehaald. De anderen zien alleen deze wijziging.");
    }
    await returnToEditors(ref, note);
    refresh();
    return ok("Je weigering is vastgelegd. De redactie haalt het citaat uit de tekst; het stuk kan niet verder zolang het erin staat.");
  });
}

const editSchema = z.object({
  approvalId: z.uuid(),
  title: z.string().trim().min(3, "Geef een titel van minimaal 3 tekens.").max(200),
  bodyHtml: z.string().max(200_000),
});

/**
 * "Zelf aanpassen": the approver edits the text. That makes a new version in
 * their name; they approve it by saving, and everyone else who already looked
 * gets only the changes to confirm.
 */
export async function editAndApprove(input: z.input<typeof editSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const data = editSchema.parse(input);
    const bodyHtml = sanitizeHtml(data.bodyHtml);
    const db = await createClient();
    const approval = unwrap(await db.from("approvals").select("*").eq("id", data.approvalId).single());
    if (approval.decision !== "pending") return fail("Op dit verzoek is al beslist.");
    if (approval.entity_type !== "article") return fail("Zelf aanpassen kan alleen bij een stuk.");
    const assigned = approval.eligible_profile_ids.includes(session.userId);
    if (!assigned && !(approval.eligible_profile_ids.length === 0 && can(session, "content.approve", "content.edit"))) {
      return fail("Dit verzoek is niet aan jou gericht.");
    }

    const admin = createAdminClient();
    const article = unwrap(
      await admin.from("articles").select("*").eq("organization_id", session.organization.id).eq("id", approval.entity_id).single(),
    );
    if (article.status !== "in_review" || article.current_version !== approval.version) {
      return fail("Dit stuk is intussen gewijzigd. Open het opnieuw.");
    }
    if (article.title === data.title && article.body_html === bodyHtml) return fail("Je hebt niets gewijzigd. Kies “Akkoord” als de tekst klopt.");
    if (bodyHtml.replace(/<[^>]+>/g, "").trim().length < 20) return fail("De tekst is te kort.");

    const version = article.current_version + 1;
    check(
      await admin.from("content_versions").insert({
        organization_id: session.organization.id,
        article_id: article.id,
        version,
        title: data.title,
        subtitle: article.subtitle,
        body_html: bodyHtml,
        change_summary: `Aangepast door ${session.profile.full_name} bij de goedkeuring`,
        created_by_profile_id: session.userId,
      }),
    );
    check(await admin.from("articles").update({ title: data.title, body_html: bodyHtml, current_version: version }).eq("id", article.id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.edited_in_review",
      category: "approval",
      entityType: "article",
      entityId: article.id,
      summary: `${session.profile.full_name} paste “${data.title}” zelf aan bij de goedkeuring (versie ${version}).`,
      metadata: { version, approval_id: approval.id },
    });

    const ref = refOf(session, approval);
    await startApprovalRound(ref, { requestedBy: approval.requested_by_profile_id });
    try {
      await revalidateArticle(session.organization.id, article.id);
    } catch (error) {
      console.error("[approvals] brand check after edit failed", error);
    }

    // Saving is approving: decide the requests that are now open for this person.
    const { data: mine } = await db
      .from("approvals")
      .select("id, eligible_profile_ids")
      .eq("entity_type", "article")
      .eq("entity_id", article.id)
      .eq("version", version)
      .eq("decision", "pending");
    const own = (mine ?? []).filter((a) => a.eligible_profile_ids.includes(session.userId));
    let message = "Je aanpassing is opgeslagen. Je akkoord wordt gevraagd zodra het stuk weer bij jouw stap is.";
    for (const row of own) {
      const { result } = await decideOwnApproval(db, session, row.id, "approved", "Zelf aangepast");
      message = `Je aanpassing is opgeslagen en geldt als jouw akkoord. ${
        result.state === "approved" ? "Het stuk is klaar voor publicatie." : "De anderen zien alleen wat jij hebt gewijzigd."
      }`;
    }
    refresh();
    return ok(message);
  });
}

/** An editor adjusted a passage after a request; the same person is asked again. */
export async function reRequestPassage(input: { approvalId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit", "content.create");
    const db = await createClient();
    const previous = unwrap(await db.from("approvals").select("*").eq("id", z.uuid().parse(input.approvalId)).single());
    if (!["changes_requested", "rejected"].includes(previous.decision) || previous.kind === "piece") {
      return fail("Dit verzoek kan niet opnieuw worden voorgelegd.");
    }
    check(
      await createAdminClient().from("approvals").insert({
        organization_id: session.organization.id,
        entity_type: previous.entity_type,
        entity_id: previous.entity_id,
        version: previous.version,
        decision: "pending",
        kind: previous.kind,
        step: previous.step,
        step_label: previous.step_label,
        eligible_profile_ids: previous.eligible_profile_ids,
        quote_text: previous.quote_text,
        item_id: previous.item_id,
        scope: previous.scope,
        due_at: previous.due_at,
        requested_by_profile_id: session.userId,
      }),
    );
    refresh();
    return ok("Opnieuw voorgelegd.");
  });
}

/**
 * Klaarzetten: a human published the piece somewhere and records where. The
 * system itself publishes nothing in the proof of concept.
 */
export async function markPublished(input: { type: string; id: string; url?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const type = z.enum(["article", "social_post"]).parse(input.type);
    const id = z.uuid().parse(input.id);
    const url = z
      .union([z.literal(""), z.url("Vul een volledige link in, bijvoorbeeld https://…")])
      .optional()
      .parse(input.url?.trim() ?? "");
    const db = await createClient();

    if (type === "article") {
      if (!can(session, "content.publish")) return fail("Je hebt geen rechten om dit als gepubliceerd te markeren.");
      const article = unwrap(await db.from("articles").select("id, title, status, classification, opportunity_id").eq("id", id).single());
      if (!["approved", "scheduled"].includes(article.status)) return fail("Alleen een goedgekeurd stuk kan als gepubliceerd worden gemarkeerd.");
      if (await needsFinalCheck(createAdminClient(), article)) {
        return fail("Dit stuk komt van een intern onderwerp dat is vrijgegeven. Leg eerst de eindcontrole vast.");
      }
      check(await db.from("articles").update({ status: "published", published_url: url || null, publication_mode: "manual" }).eq("id", id));
      await db.from("content_calendar").update({ status: "done" }).eq("entity_type", "article").eq("entity_id", id);
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "article.published",
        entityType: "article",
        entityId: id,
        summary: `“${article.title}” door ${session.profile.full_name} gemarkeerd als gepubliceerd${url ? `: ${url}` : ""}.`,
        metadata: { mode: "manual", url: url || null },
      });
    } else {
      const post = unwrap(await db.from("social_posts").select("id, platform, status, written_for_profile_id").eq("id", id).single());
      // A post in someone's own name is theirs to place.
      if (post.written_for_profile_id !== session.userId && !can(session, "content.publish")) {
        return fail("Je hebt geen rechten om dit als geplaatst te markeren.");
      }
      if (!["approved", "scheduled"].includes(post.status)) return fail("Alleen een goedgekeurde post kan als geplaatst worden gemarkeerd.");
      check(
        await createAdminClient()
          .from("social_posts")
          .update({ status: "published", published_url: url || null, publication_mode: "manual" })
          .eq("id", id)
          .eq("organization_id", session.organization.id),
      );
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "social.published",
        entityType: "social_post",
        entityId: id,
        summary: `Social post (${post.platform}) door ${session.profile.full_name} gemarkeerd als geplaatst${url ? `: ${url}` : ""}.`,
        metadata: { mode: "manual", url: url || null },
      });
    }
    refresh();
    return ok("Gemarkeerd als gepubliceerd.");
  });
}
