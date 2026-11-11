import "server-only";
import { logSystemAction } from "@/lib/audit";
import { fromJson } from "@/lib/json";
import { appLink, loadRedactieSettings, sendBotMessage } from "@/lib/redactie/bot";
import { attributeQuotes, type Speaker } from "@/lib/redactie/quotes";
import { addWorkingDays, workingDaysBetween } from "@/lib/redactie/workdays";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Approval, ApprovalEntity, ApprovalKind, Classification, InterviewSummary, RuleStep } from "@/lib/types";
import { mapConcurrent } from "@/lib/concurrency";

/**
 * Rule-based approval.
 *
 * Who has to approve depends on the kind of content (approval_rules). A round
 * for one version runs in ordered steps:
 *   step 0   personal consent: each quote by the person quoted, each passage of
 *            an MD-update by the MD who said it. Nobody else can give this.
 *   step 1+  the steps of the rule, in order (interviewees, project roles,
 *            functional roles, named persons, the editors).
 * When the last step is approved the item becomes "approved": ready for
 * publication. The decisions themselves are recorded by the deciding person
 * through their own session; this module only opens steps and moves the item.
 */

export const REMINDER_AFTER_WORKING_DAYS = 2;

export type EntityRef = { organizationId: string; entityType: ApprovalEntity; entityId: string };

type PlannedRecord = {
  kind: ApprovalKind;
  eligible: string[];
  label: string;
  quoteText?: string | null;
  itemId?: string | null;
};
type PlannedStep = { step: number; label: string; records: PlannedRecord[] };

type Context = {
  ref: EntityRef;
  title: string;
  version: number;
  classification: Classification;
  contentKey: string;
  previewPath: string;
  personal: PlannedRecord[];
  intervieweeIds: string[];
  projectId: string | null;
  /** Extra steps that follow from the item itself rather than from the rule. */
  before: RuleStep[];
  after: RuleStep[];
};

const DEFAULT_STEPS: RuleStep[] = [{ who: "editors", min: 1, label: "Redactie" }];

export function contentKeyForNewsletter(kind: string, editionType: string): string {
  if (editionType === "md_update") return "md_update";
  return kind === "external" ? "newsletter_external" : "newsletter_internal";
}

async function loadContext(db: AdminClient, ref: EntityRef): Promise<Context> {
  if (ref.entityType === "article") {
    const { data: article } = await db
      .from("articles")
      .select("id, title, current_version, classification, content_type, body_html, opportunity_id, interview_id")
      .eq("organization_id", ref.organizationId)
      .eq("id", ref.entityId)
      .single();
    if (!article) throw new Error("Contentitem niet gevonden.");

    let projectId: string | null = null;
    if (article.opportunity_id) {
      const { data: opportunity } = await db.from("content_opportunities").select("project_id").eq("id", article.opportunity_id).maybeSingle();
      projectId = opportunity?.project_id ?? null;
    }

    const { data: interviews } = await db
      .from("interviews")
      .select("id, interviewee_profile_id, interviewee_name, summary, status")
      .eq("organization_id", ref.organizationId)
      .or(`article_id.eq.${article.id}${article.interview_id ? `,id.eq.${article.interview_id}` : ""}`);
    const interviewIds = (interviews ?? []).map((i) => i.id);
    const { data: messages } = interviewIds.length
      ? await db.from("interview_messages").select("interview_id, content").eq("role", "interviewee").in("interview_id", interviewIds)
      : { data: [] as { interview_id: string; content: string }[] };

    const speakers: Speaker[] = (interviews ?? []).map((i) => ({
      interviewId: i.id,
      profileId: i.interviewee_profile_id,
      name: i.interviewee_name,
      summaryQuotes: (fromJson<InterviewSummary | null>(i.summary, null)?.quotes ?? []).map((q) => q.text),
      answers: (messages ?? []).filter((m) => m.interview_id === i.id).map((m) => m.content),
    }));
    const quotes = attributeQuotes(article.body_html, speakers);

    return {
      ref,
      title: article.title,
      version: article.current_version,
      classification: article.classification,
      contentKey: article.content_type,
      previewPath: `/preview/article/${article.id}`,
      personal: quotes.map((q) => ({
        kind: "quote" as const,
        eligible: q.profileId ? [q.profileId] : [],
        label: `Citaat van ${q.speaker}`,
        quoteText: q.text,
      })),
      intervieweeIds: Array.from(new Set(speakers.map((s) => s.profileId).filter((id): id is string => Boolean(id)))),
      projectId,
      before: [],
      after: [],
    };
  }

  if (ref.entityType === "newsletter") {
    const { data: newsletter } = await db
      .from("newsletters")
      .select("id, title, current_version, kind, edition_type")
      .eq("organization_id", ref.organizationId)
      .eq("id", ref.entityId)
      .single();
    if (!newsletter) throw new Error("Editie niet gevonden.");
    const personal: PlannedRecord[] = [];
    if (newsletter.edition_type === "md_update") {
      const { data: items } = await db
        .from("newsletter_items")
        .select("id, custom_title, contributor_profile_id, included")
        .eq("newsletter_id", newsletter.id)
        .eq("included", true)
        .not("contributor_profile_id", "is", null)
        .order("position", { ascending: true });
      for (const item of items ?? []) {
        personal.push({
          kind: "passage",
          eligible: [item.contributor_profile_id as string],
          label: `Passage: ${item.custom_title ?? "zonder titel"}`,
          itemId: item.id,
        });
      }
    }
    return {
      ref,
      title: newsletter.title,
      version: newsletter.current_version,
      classification: newsletter.kind === "external" ? "external" : "internal",
      contentKey: contentKeyForNewsletter(newsletter.kind, newsletter.edition_type),
      previewPath: `/preview/newsletter/${newsletter.id}`,
      personal,
      intervieweeIds: [],
      projectId: null,
      before: [],
      after: [],
    };
  }

  const { data: post } = await db
    .from("social_posts")
    .select("id, platform, current_version, article_id, written_for_profile_id")
    .eq("organization_id", ref.organizationId)
    .eq("id", ref.entityId)
    .single();
  if (!post) throw new Error("Social post niet gevonden.");
  let projectId: string | null = null;
  let title = `Social post (${post.platform})`;
  const after: RuleStep[] = [];
  if (post.article_id) {
    const { data: article } = await db.from("articles").select("title, content_type, opportunity_id").eq("id", post.article_id).maybeSingle();
    if (article) {
      title = `Social post bij “${article.title}”`;
      if (article.opportunity_id) {
        const { data: opportunity } = await db.from("content_opportunities").select("project_id").eq("id", article.opportunity_id).maybeSingle();
        projectId = opportunity?.project_id ?? null;
      }
      // A post about a customer case also needs the DM or Strateeg of the project.
      if (article.content_type === "customer_case" && projectId) {
        after.push({ who: "project_roles", roles: ["dm", "strateeg"], min: 1, label: "DM of Strateeg van het project" });
      }
    }
  }
  return {
    ref,
    title,
    version: post.current_version,
    classification: "external",
    contentKey: "social_post",
    previewPath: `/preview/social_post/${post.id}`,
    personal: [],
    intervieweeIds: [],
    projectId,
    // A post written in a colleague's name is theirs to approve (and to post).
    before: post.written_for_profile_id
      ? [{ who: "persons", profile_ids: [post.written_for_profile_id], min: 1, label: "De collega op wiens naam de post staat" }]
      : [],
    after,
  };
}

async function loadRule(db: AdminClient, organizationId: string, contentKey: string) {
  const { data } = await db
    .from("approval_rules")
    .select("steps, quotes_by_interviewee, deadline_days")
    .eq("organization_id", organizationId)
    .eq("content_key", contentKey)
    .maybeSingle();
  const steps = fromJson<RuleStep[]>(data?.steps, []);
  return {
    steps: steps.length > 0 ? steps : DEFAULT_STEPS,
    quotesByInterviewee: data?.quotes_by_interviewee ?? true,
    deadlineDays: data?.deadline_days ?? 5,
  };
}

async function activeProfiles(db: AdminClient, organizationId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await db.from("profiles").select("id").eq("organization_id", organizationId).eq("is_active", true).in("id", ids);
  const active = new Set((data ?? []).map((p) => p.id));
  return ids.filter((id) => active.has(id));
}

async function holdersOfRoles(db: AdminClient, organizationId: string, roleKeys: string[]): Promise<string[]> {
  if (roleKeys.length === 0) return [];
  const { data: roles } = await db.from("functional_roles").select("id").eq("organization_id", organizationId).in("key", roleKeys);
  const roleIds = (roles ?? []).map((r) => r.id);
  if (roleIds.length === 0) return [];
  const { data } = await db.from("profile_functional_roles").select("profile_id").in("functional_role_id", roleIds);
  return activeProfiles(db, organizationId, Array.from(new Set((data ?? []).map((r) => r.profile_id))));
}

/** Turns the rule into the concrete steps for this item. Steps nobody can take are dropped. */
async function planSteps(db: AdminClient, ctx: Context): Promise<PlannedStep[]> {
  const rule = await loadRule(db, ctx.ref.organizationId, ctx.contentKey);
  const ruleSteps = [...ctx.before, ...rule.steps, ...ctx.after];
  const planned: PlannedStep[] = [];

  // People who approve the whole piece themselves do not get a separate request for their quotes.
  const pieceInterviewees = ruleSteps.some((s) => s.who === "interviewees") ? new Set(ctx.intervieweeIds) : new Set<string>();
  const personal = ctx.personal.filter((record) => {
    if (record.kind === "passage") return true;
    if (!rule.quotesByInterviewee) return false;
    return !(record.eligible.length === 1 && pieceInterviewees.has(record.eligible[0]));
  });
  if (personal.length > 0) {
    planned.push({ step: 0, label: personal[0].kind === "passage" ? "Eigen passages" : "Eigen citaten", records: personal });
  }

  let number = 1;
  for (const step of ruleSteps) {
    const min = Math.max(1, Math.min(5, Math.round(step.min ?? 1)));
    let records: PlannedRecord[] = [];
    let label = step.label ?? "";

    if (step.who === "interviewees") {
      label ||= "De geïnterviewde";
      records = ctx.intervieweeIds.map((id) => ({ kind: "piece" as const, eligible: [id], label }));
      if (records.length === 0) continue; // nobody was interviewed: this step does not apply
    } else if (step.who === "editors") {
      label ||= "Redactie";
      records = Array.from({ length: min }, () => ({ kind: "piece" as const, eligible: [], label }));
    } else {
      let eligible: string[] = [];
      if (step.who === "persons") {
        eligible = await activeProfiles(db, ctx.ref.organizationId, step.profile_ids ?? []);
        label ||= "Aangewezen personen";
      } else if (step.who === "functional_roles") {
        eligible = await holdersOfRoles(db, ctx.ref.organizationId, step.roles ?? []);
        label ||= "Rol";
      } else if (step.who === "project_roles") {
        label ||= "Betrokkenen bij het project";
        if (ctx.projectId) {
          const { data: members } = await db
            .from("project_members")
            .select("profile_id, project_role, confirmed")
            .eq("project_id", ctx.projectId)
            .eq("confirmed", true);
          const wanted = new Set((step.roles ?? []).map((r) => r.toLowerCase()));
          eligible = await activeProfiles(
            db,
            ctx.ref.organizationId,
            (members ?? []).filter((m) => wanted.size === 0 || wanted.has(m.project_role.toLowerCase())).map((m) => m.profile_id),
          );
        }
      }
      // Nobody holds this role: the editors decide, and the label says why.
      if (eligible.length === 0) label = `${label} (niemand gekoppeld, de redactie beslist)`;
      const count = eligible.length === 0 ? 1 : Math.min(min, eligible.length);
      records = Array.from({ length: count }, () => ({ kind: "piece" as const, eligible, label }));
    }
    planned.push({ step: number++, label, records });
  }

  if (!planned.some((p) => p.records.some((r) => r.kind === "piece"))) {
    planned.push({ step: number, label: "Redactie", records: [{ kind: "piece", eligible: [], label: "Redactie" }] });
  }
  return planned;
}

async function openStep(
  db: AdminClient,
  ctx: Context,
  step: PlannedStep,
  options: { requestedBy: string | null; now: Date },
): Promise<void> {
  const rule = await loadRule(db, ctx.ref.organizationId, ctx.contentKey);
  const dueAt = addWorkingDays(options.now, rule.deadlineDays).toISOString();

  // People who already looked at an earlier version only need to see what changed.
  const approvedBefore = new Map<string, number>();
  if (ctx.version > 1) {
    const { data: earlier } = await db
      .from("approvals")
      .select("decided_by, version")
      .eq("entity_type", ctx.ref.entityType)
      .eq("entity_id", ctx.ref.entityId)
      .in("decision", ["approved", "changes_requested", "rejected"])
      .lt("version", ctx.version)
      .order("version", { ascending: true });
    for (const row of earlier ?? []) if (row.decided_by) approvedBefore.set(row.decided_by, row.version);
  }

  const rows = step.records.map((record) => {
    const baseVersions = record.eligible.map((id) => approvedBefore.get(id)).filter((v): v is number => v !== undefined);
    return {
      organization_id: ctx.ref.organizationId,
      entity_type: ctx.ref.entityType,
      entity_id: ctx.ref.entityId,
      version: ctx.version,
      decision: "pending",
      kind: record.kind,
      step: step.step,
      step_label: record.label,
      eligible_profile_ids: record.eligible,
      quote_text: record.quoteText ?? null,
      item_id: record.itemId ?? null,
      scope: ctx.classification,
      due_at: dueAt,
      // Someone in this step saw an earlier version: the preview shows each of them their own changes.
      base_version: baseVersions.length > 0 ? Math.max(...baseVersions) : null,
      requested_by_profile_id: options.requestedBy,
    };
  });
  const { error } = await db.from("approvals").insert(rows);
  if (error) throw new Error(error.message);

  // One message per person, however many quotes or passages are theirs.
  const settings = await loadRedactieSettings(db, ctx.ref.organizationId);
  const perPerson = new Map<string, PlannedRecord[]>();
  for (const record of step.records) {
    for (const id of record.eligible) perPerson.set(id, [...(perPerson.get(id) ?? []), record]);
  }
  for (const [profileId, records] of perPerson) {
    const again = approvedBefore.has(profileId);
    const what =
      records[0].kind === "quote"
        ? records.length === 1
          ? "staat een citaat van jou"
          : `staan ${records.length} citaten van jou`
        : records[0].kind === "passage"
          ? "staat een passage op basis van jouw antwoorden"
          : "ligt een concept dat jouw akkoord nodig heeft";
    const body = again
      ? `Het stuk “${ctx.title}” is aangepast sinds je het zag. Je ziet alleen wat er is veranderd. Wil je (opnieuw) bevestigen? ${appLink(ctx.previewPath)}`
      : `In “${ctx.title}” ${what}. Wil je het bekijken en laten weten of het klopt? Er gaat niets naar buiten zonder jouw akkoord. ${appLink(ctx.previewPath)}\n\nIk ben de ${settings.botName}, de bot van de redactie.`;
    await sendBotMessage({
      organizationId: ctx.ref.organizationId,
      kind: "approval_request",
      medium: "dm",
      recipientProfileId: profileId,
      body,
      entityType: ctx.ref.entityType,
      entityId: ctx.ref.entityId,
      now: options.now,
    });
  }
}

/** Starts a fresh approval round for the current version. Open requests of earlier rounds are withdrawn. */
export async function startApprovalRound(
  ref: EntityRef,
  options: { requestedBy: string | null; now?: Date },
): Promise<{ steps: number; firstStep: string }> {
  const db = createAdminClient();
  const now = options.now ?? new Date();
  const ctx = await loadContext(db, ref);

  const { error: withdrawError } = await db
    .from("approvals")
    .update({ decision: "withdrawn" })
    .eq("entity_type", ref.entityType)
    .eq("entity_id", ref.entityId)
    .eq("decision", "pending");
  if (withdrawError) throw new Error(withdrawError.message);

  const steps = await planSteps(db, ctx);
  await openStep(db, ctx, steps[0], { requestedBy: options.requestedBy, now });
  return { steps: steps.length, firstStep: steps[0].label };
}

export type AdvanceResult = { state: "waiting" | "next_step" | "approved"; label?: string };

/**
 * Called after a step may have been completed (a decision, or a withdrawn
 * request). Opens the next step, or marks the item approved after the last.
 */
export async function advanceApproval(ref: EntityRef, version: number, now = new Date()): Promise<AdvanceResult> {
  const db = createAdminClient();
  const { data: rows } = await db
    .from("approvals")
    .select("id, step, decision, kind, quote_text, item_id, requested_at, requested_by_profile_id")
    .eq("entity_type", ref.entityType)
    .eq("entity_id", ref.entityId)
    .eq("version", version);
  const live = (rows ?? []).filter((r) => r.decision !== "withdrawn");
  if (live.some((r) => r.decision === "pending")) return { state: "waiting" };

  // A refusal that was not followed by a later approval of the same thing stops the round.
  const refused = live.some(
    (r) =>
      ["changes_requested", "rejected"].includes(r.decision) &&
      !live.some(
        (o) =>
          o.decision === "approved" &&
          o.kind === r.kind &&
          o.step === r.step &&
          o.quote_text === r.quote_text &&
          o.item_id === r.item_id &&
          o.requested_at > r.requested_at,
      ),
  );
  if (refused) return { state: "waiting" };

  const ctx = await loadContext(db, ref);
  if (ctx.version !== version) return { state: "waiting" };
  const steps = await planSteps(db, ctx);
  const reached = live.reduce((max, r) => Math.max(max, r.step), -1);
  const next = steps.find((s) => s.step > reached);
  const requestedBy = live.find((r) => r.requested_by_profile_id)?.requested_by_profile_id ?? null;

  if (next) {
    await openStep(db, ctx, next, { requestedBy, now });
    return { state: "next_step", label: next.label };
  }

  // The database refuses this unless a human approved this version.
  const table = ref.entityType === "article" ? "articles" : ref.entityType === "newsletter" ? "newsletters" : "social_posts";
  const { error } = await db.from(table).update({ status: "approved" }).eq("id", ref.entityId).eq("organization_id", ref.organizationId);
  if (error) throw new Error(error.message);
  await logSystemAction(db, {
    organizationId: ref.organizationId,
    action: `${ref.entityType}.ready`,
    category: "approval",
    entityType: ref.entityType,
    entityId: ref.entityId,
    summary: `Alle akkoorden voor “${ctx.title}” (versie ${version}) zijn binnen. Het stuk is klaar voor publicatie.`,
    metadata: { version },
  });
  return { state: "approved" };
}

/** What the current round looks like, for display. */
export type RoundRecord = Pick<
  Approval,
  | "id"
  | "kind"
  | "step"
  | "step_label"
  | "decision"
  | "decision_note"
  | "eligible_profile_ids"
  | "decided_by"
  | "decided_at"
  | "due_at"
  | "quote_text"
  | "item_id"
  | "base_version"
  | "requested_at"
  | "version"
>;

/**
 * Reminders and deadlines for open approval requests.
 *   - one reminder after two working days;
 *   - at the deadline the editors are told. They can decide on a piece
 *     themselves, but never on someone's quote;
 *   - an MD who does not react to a passage of the MD-update is left out.
 */
export async function processApprovalDeadlines(organizationId: string, now = new Date()): Promise<{ reminded: number; escalated: number }> {
  const db = createAdminClient();
  const { data: open } = await db
    .from("approvals")
    .select("base_version, decision, due_at, eligible_profile_ids, entity_id, entity_type, escalated_at, id, item_id, kind, organization_id, quote_text, reminded_at, requested_at, requested_by_agent_id, requested_by_profile_id, scope, step, step_label, version")
    .eq("organization_id", organizationId)
    .eq("decision", "pending")
    .order("requested_at", { ascending: true })
    .limit(200);

  let reminded = 0;
  let escalated = 0;
  const toAdvance = new Map<string, { ref: EntityRef; version: number }>();

  for (const approval of open ?? []) {
    if (approval.eligible_profile_ids.length === 0) continue; // the editors' own queue
    const ref: EntityRef = { organizationId, entityType: approval.entity_type as ApprovalEntity, entityId: approval.entity_id };
    let ctx: Context;
    try {
      ctx = await loadContext(db, ref);
    } catch {
      continue;
    }

    if (approval.due_at && new Date(approval.due_at) <= now && !approval.escalated_at) {
      await db.from("approvals").update({ escalated_at: now.toISOString() }).eq("id", approval.id);
      escalated++;
      const { data: people } = await db.from("profiles").select("full_name").in("id", approval.eligible_profile_ids);
      const names = (people ?? []).map((p) => p.full_name).join(", ");

      if (approval.kind === "passage" && approval.item_id) {
        // Not reacting means not being part of this edition.
        const { error: withdrawError } = await db.from("approvals").update({ decision: "withdrawn" }).eq("id", approval.id);
        if (withdrawError) throw new Error(withdrawError.message);
        await db.from("newsletter_items").update({ included: false }).eq("id", approval.item_id);
        toAdvance.set(`${ref.entityId}:${approval.version}`, { ref, version: approval.version });
        await logSystemAction(db, {
          organizationId,
          action: "approval.left_out",
          category: "approval",
          entityType: ref.entityType,
          entityId: ref.entityId,
          summary: `${names} reageerde niet op tijd op het verzoek voor “${ctx.title}”. De passage is uit deze editie gehaald.`,
        });
      } else {
        await logSystemAction(db, {
          organizationId,
          action: "approval.overdue",
          category: "approval",
          entityType: ref.entityType,
          entityId: ref.entityId,
          summary:
            approval.kind === "quote"
              ? `${names} reageerde niet op het verzoek om een citaat in “${ctx.title}” goed te keuren. De redactie beslist of het citaat eruit gaat; alleen ${names} kan het goedkeuren.`
              : `${names} reageerde niet op het goedkeuringsverzoek voor “${ctx.title}”. De redactie beslist.`,
          requiresApproval: true,
        });
      }
      continue;
    }

    if (!approval.reminded_at && workingDaysBetween(new Date(approval.requested_at), now) >= REMINDER_AFTER_WORKING_DAYS) {
      await db.from("approvals").update({ reminded_at: now.toISOString() }).eq("id", approval.id);
      const results = await mapConcurrent(approval.eligible_profile_ids, (profileId) =>
        sendBotMessage({
          organizationId,
          kind: "reminder",
          medium: "dm",
          recipientProfileId: profileId,
          body: `Even een herinnering: “${ctx.title}” wacht nog op jouw akkoord. ${appLink(ctx.previewPath)} Dit is de enige herinnering die ik stuur.`,
          entityType: ref.entityType,
          entityId: ref.entityId,
          now,
        }),
      );
      reminded += results.filter((result) => result.status !== "blocked").length;
    }
  }

  for (const { ref, version } of toAdvance.values()) {
    try {
      await advanceApproval(ref, version, now);
    } catch (error) {
      console.error("[approvals] could not advance after a deadline", error);
    }
  }
  return { reminded, escalated };
}
