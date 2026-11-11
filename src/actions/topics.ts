"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateSocialPosts } from "@/lib/agents/pipelines";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { CONTENT_TYPES } from "@/lib/constants";
import { parseDateInput } from "@/lib/format";
import { composeMdUpdate, runOutreachRound, runRhythm, startMdUpdate } from "@/lib/redactie/rhythms";
import { TopicError, assignTopic, createFollowUps, pickUpTopic, releaseTopic, snoozeTopic } from "@/lib/redactie/topics";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContentType, RhythmKey } from "@/lib/types";

/** Beoordelen: the editors' decisions about proposals, and the work they start by hand. */

const refresh = () => revalidatePath("/", "layout");

async function guarded<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TopicError) return fail(error.message);
    throw error;
  }
}

export async function pickUpTopicAction(input: { id: string; intervieweeIds?: string[] }): Promise<ActionResult<{ articleId: string }>> {
  return runAction<{ articleId: string }>(() =>
    guarded(async () => {
      const session = await requireActionSession("content.create");
      const id = z.uuid().parse(input.id);
      const intervieweeIds = z.array(z.uuid()).max(3, "Kies maximaal drie mensen.").optional().parse(input.intervieweeIds);
      const db = await createClient();
      const topic = unwrap(await db.from("content_opportunities").select("title").eq("id", id).single());
      const result = await pickUpTopic({
        organizationId: session.organization.id,
        opportunityId: id,
        by: session.userId,
        intervieweeIds,
        trigger: "manual",
      });
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "opportunity.accepted",
        entityType: "opportunity",
        entityId: id,
        summary: `Voorstel “${topic.title}” opgepakt door ${session.profile.full_name}${result.interviewIds.length ? `; ${result.interviewIds.length} interview(s) aangevraagd` : ""}.`,
      });
      refresh();
      const note = result.skippedInterviews.length ? ` Niet gelukt: ${result.skippedInterviews.join("; ")}` : "";
      return ok(
        `Opgepakt.${result.interviewIds.length ? ` ${result.interviewIds.length === 1 ? "Er is één interview" : `Er zijn ${result.interviewIds.length} interviews`} aangevraagd.` : ""}${note}`,
        { articleId: result.articleId },
      );
    }),
  );
}

export async function snoozeTopicAction(input: { id: string; until: string }): Promise<ActionResult> {
  return runAction(() =>
    guarded(async () => {
      const session = await requireActionSession("content.create");
      const id = z.uuid().parse(input.id);
      const until = parseDateInput(input.until);
      if (!until || until.getTime() < Date.now()) return fail("Kies een datum in de toekomst.");
      const db = await createClient();
      const topic = unwrap(await db.from("content_opportunities").select("title").eq("id", id).single());
      await snoozeTopic(createAdminClient(), session.organization.id, id, until);
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "opportunity.snoozed",
        entityType: "opportunity",
        entityId: id,
        summary: `Voorstel “${topic.title}” op later gezet.`,
        metadata: { until: until.toISOString() },
      });
      refresh();
      return ok("Op later gezet. Het voorstel komt vanzelf terug in de inbox.");
    }),
  );
}

export async function reopenTopicAction(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const topic = unwrap(await db.from("content_opportunities").select("status, article_id").eq("id", id).single());
    if (!["declined", "snoozed"].includes(topic.status) || topic.article_id) return fail("Dit voorstel staat al in de inbox of is opgepakt.");
    check(await db.from("content_opportunities").update({ status: "proposed", snoozed_until: null, decline_reason: null }).eq("id", id));
    refresh();
    return ok("Voorstel teruggezet in de inbox.");
  });
}

/** Intern → extern: only someone who may approve content can release an internal topic. */
export async function releaseTopicAction(input: { id: string; reason: string }): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(() =>
    guarded(async () => {
      const session = await requireActionSession("content.approve");
      const id = z.uuid().parse(input.id);
      const reason = z.string().trim().min(10, "Leg in een zin uit waarom dit naar buiten mag.").max(1000).parse(input.reason);
      const db = await createClient();
      const topic = unwrap(await db.from("content_opportunities").select("title").eq("id", id).single());
      const result = await releaseTopic({ organizationId: session.organization.id, opportunityId: id, reason, by: session.userId });
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "opportunity.released",
        category: "approval",
        entityType: "opportunity",
        entityId: result.externalOpportunityId,
        summary: `${session.profile.full_name} gaf het interne onderwerp “${topic.title}” vrij voor extern gebruik. Reden: ${reason}`,
        metadata: { internal_topic: id, reason },
        requiresApproval: true,
      });
      refresh();
      return ok(
        "Vrijgegeven. Het externe bureau heeft nu een eigen voorstel. De tekst wordt opnieuw geschreven, iedereen die geciteerd wordt keurt opnieuw goed en er volgt een eindcontrole.",
        { id: result.externalOpportunityId },
      );
    }),
  );
}

/** The final, sentence-by-sentence check of a piece that came from a released internal topic. */
export async function recordFinalCheck(input: { articleId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.approve");
    const articleId = z.uuid().parse(input.articleId);
    const db = await createClient();
    const article = unwrap(await db.from("articles").select("title, opportunity_id").eq("id", articleId).single());
    if (!article.opportunity_id) return fail("Dit stuk hoort niet bij een vrijgegeven onderwerp.");
    const topic = unwrap(
      await db.from("content_opportunities").select("released_external_at, released_external_by").eq("id", article.opportunity_id).single(),
    );
    if (!topic.released_external_at) return fail("Dit stuk hoort niet bij een vrijgegeven onderwerp.");
    check(
      await createAdminClient()
        .from("content_opportunities")
        .update({ final_check_by: session.userId, final_check_at: new Date().toISOString() })
        .eq("id", article.opportunity_id)
        .eq("organization_id", session.organization.id),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "article.final_check",
      category: "approval",
      entityType: "article",
      entityId: articleId,
      summary: `${session.profile.full_name} deed de eindcontrole op “${article.title}” (intern onderwerp, vrijgegeven voor extern gebruik).`,
      metadata: { released_by: topic.released_external_by },
    });
    refresh();
    return ok("Eindcontrole vastgelegd.");
  });
}

const assignSchema = z.object({
  title: z.string().trim().min(3, "Geef de opdracht een titel.").max(160),
  briefing: z.string().trim().min(10, "Beschrijf in een paar zinnen waar het stuk over moet gaan.").max(3000),
  classification: z.enum(["internal", "external"]),
  contentType: z.enum(CONTENT_TYPES as [string, ...string[]]),
  intervieweeIds: z.array(z.uuid()).max(3, "Kies maximaal drie mensen."),
  projectId: z.uuid().nullable().optional(),
});

/** Opdracht geven: "Schrijf een stuk over …, interview Sanne en Tom." */
export async function assignTopicAction(input: z.input<typeof assignSchema>): Promise<ActionResult<{ articleId: string }>> {
  return runAction<{ articleId: string }>(() =>
    guarded(async () => {
      const session = await requireActionSession("content.create");
      const data = assignSchema.parse(input);
      const db = await createClient();
      const result = await assignTopic({
        organizationId: session.organization.id,
        by: session.userId,
        title: data.title,
        briefing: data.briefing,
        classification: data.classification,
        contentType: data.contentType as ContentType,
        intervieweeIds: data.intervieweeIds,
        projectId: data.projectId ?? null,
      });
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "opportunity.assigned",
        entityType: "opportunity",
        entityId: result.opportunityId,
        summary: `${session.profile.full_name} gaf een opdracht: “${data.title}”${result.interviewIds.length ? `, met ${result.interviewIds.length} interview(s)` : ""}.`,
      });
      refresh();
      const note = result.skippedInterviews.length ? ` Niet gelukt: ${result.skippedInterviews.join("; ")}` : "";
      return ok(`Opdracht gegeven.${result.interviewIds.length ? ` ${result.interviewIds.length} interview(s) aangevraagd.` : ""}${note}`, {
        articleId: result.articleId,
      });
    }),
  );
}

export async function createFollowUpsAction(input: { articleId: string }): Promise<ActionResult> {
  return runAction(() =>
    guarded(async () => {
      const session = await requireActionSession("content.create");
      const articleId = z.uuid().parse(input.articleId);
      unwrap(await (await createClient()).from("articles").select("id").eq("id", articleId).single());
      const result = await createFollowUps({ organizationId: session.organization.id, articleId, by: session.userId });
      refresh();
      return ok(
        `${result.socialPosts} social post(s)${result.internalArticleId ? " en een stukje voor de interne nieuwsbrief" : ""} gemaakt als concept. ${result.notes.join(" ")}`.trim(),
      );
    }),
  );
}

/** A LinkedIn post in a colleague's own name. They approve it and post it themselves. */
export async function createPersonalPost(input: { articleId: string; profileId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const articleId = z.uuid().parse(input.articleId);
    const profileId = z.uuid().parse(input.profileId);
    unwrap(await (await createClient()).from("articles").select("id").eq("id", articleId).single());
    await generateSocialPosts({
      organizationId: session.organization.id,
      articleId,
      platforms: ["linkedin"],
      inNameOfProfileId: profileId,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok("Persoonlijke post gemaakt als concept. Dien hem in; de collega keurt hem zelf goed en plaatst hem zelf.");
  });
}

// --- Rhythms and rounds, started by hand ------------------------------------------
export async function runRhythmNow(input: { key: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage", "users.manage");
    const key = z.enum(["team_round", "md_update", "internal_newsletter", "external_newsletter", "weekly_overview"]).parse(input.key) as RhythmKey;
    const result = await runRhythm({ organizationId: session.organization.id, key, trigger: "manual", triggeredBy: session.userId });
    refresh();
    return ok(result.summary);
  });
}

export async function runGroupNow(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage", "users.manage");
    const result = await runOutreachRound({ organizationId: session.organization.id, groupId: z.uuid().parse(input.id) });
    refresh();
    return ok(
      `Inputronde: ${result.asked} verstuurd, ${result.held} vastgehouden, ${result.blocked.length} tegengehouden.${
        result.blocked.length ? ` (${result.blocked.map((b) => `${b.name}: ${b.reason}`).join(" ")})` : ""
      }`,
    );
  });
}

export async function startMdUpdateAction(): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const session = await requireActionSession("content.create");
    const result = await startMdUpdate({ organizationId: session.organization.id, trigger: "manual", triggeredBy: session.userId });
    refresh();
    return ok(
      result.created
        ? `MD-update gestart: ${result.interviews} MD('s) uitgenodigd.${result.skipped.length ? ` ${result.skipped.join(" ")}` : ""}`
        : "Voor vandaag bestaat er al een MD-update.",
      { id: result.newsletterId },
    );
  });
}

export async function composeMdUpdateAction(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create", "content.edit");
    const result = await composeMdUpdate({
      organizationId: session.organization.id,
      newsletterId: z.uuid().parse(input.id),
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(
      `Samengesteld: ${result.themes} thema('s), ${result.passages} passage(s) van ${result.contributors} MD('s).${
        result.missing.length ? ` Nog geen antwoord van: ${result.missing.join(", ")}.` : ""
      }`,
    );
  });
}
