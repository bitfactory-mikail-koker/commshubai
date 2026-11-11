import "server-only";
import { acceptOpportunity, createChannelVariant, createInterview, generateSocialPosts } from "@/lib/agents/pipelines";
import { logSystemAction } from "@/lib/audit";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { AgentKind, Classification, ContentType, InterviewKind, Opportunity } from "@/lib/types";

/**
 * Beoordelen: what the editors do with a proposal, and the work that follows
 * from picking it up. The bot starts nothing by itself; `pickUpTopic` runs
 * because an editor said so (or because the administrator allowed one emoji to
 * start directly).
 */

type Trigger = "manual" | "schedule" | "event" | "demo";

export class TopicError extends Error {}

const INTERVIEW_KIND: Partial<Record<ContentType, InterviewKind>> = {
  customer_case: "customer_case",
  employee_introduction: "employee_intro",
  management_update: "management",
  interview: "expert",
};

async function loadTopic(db: AdminClient, organizationId: string, opportunityId: string): Promise<Opportunity> {
  const { data } = await db.from("content_opportunities").select("*").eq("organization_id", organizationId).eq("id", opportunityId).single();
  if (!data) throw new TopicError("Onderwerp niet gevonden.");
  return data;
}

/** Who to interview: the people the proposal names, plus the DM and Strateeg of the project for a customer case. */
async function interviewees(db: AdminClient, topic: Opportunity, chosen?: string[] | null): Promise<{ id: string; full_name: string; job_title: string | null }[]> {
  const ids = new Set<string>(chosen ?? topic.proposed_interviewee_ids ?? []);
  if (!chosen && topic.suggested_content_type === "customer_case" && topic.project_id) {
    const { data: members } = await db
      .from("project_members")
      .select("profile_id, project_role")
      .eq("project_id", topic.project_id)
      .eq("confirmed", true);
    // The DM first, then one or two people from the team.
    const ordered = [...(members ?? [])].sort((a, b) => Number(b.project_role === "dm") - Number(a.project_role === "dm"));
    for (const member of ordered) {
      if (ids.size >= 3) break;
      if (member.project_role !== "developer") ids.add(member.profile_id);
    }
  }
  if (ids.size === 0) return [];
  const { data } = await db
    .from("profiles")
    .select("id, full_name, job_title")
    .eq("organization_id", topic.organization_id)
    .eq("is_active", true)
    .in("id", [...ids]);
  return (data ?? []).slice(0, 3);
}

export async function pickUpTopic(options: {
  organizationId: string;
  opportunityId: string;
  /** The editor who decided. Null when an emoji was allowed to start directly. */
  by: string | null;
  intervieweeIds?: string[] | null;
  trigger: Trigger;
}): Promise<{ articleId: string; interviewIds: string[]; skippedInterviews: string[] }> {
  const db = createAdminClient();
  const topic = await loadTopic(db, options.organizationId, options.opportunityId);
  if (topic.status === "declined") throw new TopicError("Dit onderwerp is afgewezen. Zet het eerst terug in de inbox.");
  if (topic.classification === "external" && topic.internal_only && !topic.released_external_at) {
    throw new TopicError(
      "Dit onderwerp komt uit een interne bron. Intern blijft intern: een redacteur moet het eerst vrijgeven voor extern gebruik.",
    );
  }

  const { articleId } = await acceptOpportunity({
    organizationId: options.organizationId,
    opportunityId: topic.id,
    trigger: options.trigger,
    triggeredBy: options.by,
  });
  await db.from("content_opportunities").update({ snoozed_until: null }).eq("id", topic.id);

  // A social post without interview goes straight to writing; everything else starts with an interview.
  const interviewIds: string[] = [];
  const skipped: string[] = [];
  if (topic.suggested_content_type !== "social_post") {
    const { data: existing } = await db.from("interviews").select("interviewee_profile_id").eq("article_id", articleId);
    const already = new Set((existing ?? []).map((i) => i.interviewee_profile_id));
    const agentKind: AgentKind = topic.classification === "external" ? "external" : "internal";
    let project: { name: string; client_name: string | null } | null = null;
    if (topic.project_id) {
      const { data } = await db.from("projects").select("name, client_name").eq("id", topic.project_id).maybeSingle();
      project = data;
    }
    for (const person of await interviewees(db, topic, options.intervieweeIds)) {
      if (already.has(person.id)) continue;
      try {
        const created = await createInterview({
          organizationId: options.organizationId,
          trigger: options.trigger,
          triggeredBy: options.by,
          agentKind,
          title: `${topic.title}: ${person.full_name}`,
          purpose: topic.briefing?.trim() || topic.angle,
          kind: INTERVIEW_KIND[topic.suggested_content_type] ?? "other",
          classification: topic.classification,
          intervieweeProfileId: person.id,
          intervieweeName: person.full_name,
          intervieweeRole: person.job_title,
          articleId,
          opportunityId: topic.id,
          context: topic.angle,
          customer: project?.client_name ?? null,
          project: project?.name ?? null,
          isDemo: topic.is_demo,
        });
        interviewIds.push(created.interviewId);
      } catch (error) {
        skipped.push(`${person.full_name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { articleId, interviewIds, skippedInterviews: skipped };
}

export async function snoozeTopic(db: AdminClient, organizationId: string, opportunityId: string, until: Date): Promise<void> {
  const topic = await loadTopic(db, organizationId, opportunityId);
  if (topic.article_id) throw new TopicError("Dit onderwerp is al opgepakt.");
  const { error } = await db
    .from("content_opportunities")
    .update({ status: "snoozed", snoozed_until: until.toISOString() })
    .eq("id", topic.id);
  if (error) throw new Error(error.message);
}

export async function declineTopic(db: AdminClient, organizationId: string, opportunityId: string, reason: string): Promise<Opportunity> {
  const topic = await loadTopic(db, organizationId, opportunityId);
  if (topic.article_id) throw new TopicError("Dit onderwerp is al opgepakt. Archiveer het stuk als het niet doorgaat.");
  const { error } = await db
    .from("content_opportunities")
    .update({ status: "declined", decline_reason: reason, snoozed_until: null })
    .eq("id", topic.id);
  if (error) throw new Error(error.message);
  if (topic.signal_id) {
    // The signal is only dismissed when no other bureau still has a proposal for it.
    const { count } = await db
      .from("content_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("signal_id", topic.signal_id)
      .neq("status", "declined");
    if (!count) await db.from("content_signals").update({ status: "dismissed" }).eq("id", topic.signal_id);
  }
  return topic;
}

/** Topics that were parked come back in the inbox when their date has passed. */
export async function wakeSnoozedTopics(organizationId: string, now = new Date()): Promise<number> {
  const db = createAdminClient();
  const { data } = await db
    .from("content_opportunities")
    .update({ status: "proposed", snoozed_until: null })
    .eq("organization_id", organizationId)
    .eq("status", "snoozed")
    .lte("snoozed_until", now.toISOString())
    .select("id");
  return data?.length ?? 0;
}

/**
 * Intern → extern. An editor releases an internal topic for external use and
 * says why. That does not make the internal text external: the external
 * bureau gets its own topic and writes a new text, everyone quoted approves
 * again for external use, and an editor records a final check before it can
 * be published.
 */
export async function releaseTopic(options: {
  organizationId: string;
  opportunityId: string;
  reason: string;
  by: string;
}): Promise<{ externalOpportunityId: string }> {
  const db = createAdminClient();
  const topic = await loadTopic(db, options.organizationId, options.opportunityId);
  const now = new Date().toISOString();
  const release = { released_external_at: now, released_external_by: options.by, release_reason: options.reason };

  // An external proposal that was waiting for this release.
  if (topic.classification === "external") {
    await db.from("content_opportunities").update(release).eq("id", topic.id);
    return { externalOpportunityId: topic.id };
  }

  const { data: externalAgent } = await db
    .from("agents")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("kind", "external")
    .single();
  if (!externalAgent) throw new TopicError("Het externe bureau is niet gevonden.");

  await db.from("content_opportunities").update(release).eq("id", topic.id);

  const existing = topic.signal_id
    ? (
        await db
          .from("content_opportunities")
          .select("id")
          .eq("organization_id", options.organizationId)
          .eq("signal_id", topic.signal_id)
          .eq("classification", "external")
          .neq("status", "declined")
          .maybeSingle()
      ).data
    : null;
  if (existing) {
    await db.from("content_opportunities").update({ ...release, internal_only: true }).eq("id", existing.id);
    return { externalOpportunityId: existing.id };
  }

  const externalType: ContentType = ["internal_update", "employee_introduction", "management_update"].includes(topic.suggested_content_type)
    ? "news_article"
    : topic.suggested_content_type;
  const { data: created, error } = await db
    .from("content_opportunities")
    .insert({
      organization_id: options.organizationId,
      signal_id: topic.signal_id,
      title: topic.title,
      angle: topic.angle,
      suggested_content_type: externalType,
      classification: "external" as Classification,
      assigned_agent_id: externalAgent.id,
      referred_by_agent_id: topic.assigned_agent_id,
      priority: topic.priority,
      stakeholders: topic.stakeholders,
      // Consent for internal use is not consent for external use.
      external_permission: "unknown",
      origin: "referral",
      project_id: topic.project_id,
      proposed_interviewee_ids: topic.proposed_interviewee_ids,
      internal_only: true,
      ...release,
      is_demo: topic.is_demo,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Het externe onderwerp kon niet worden aangemaakt.");
  return { externalOpportunityId: created.id };
}

/** True when a piece comes from a released internal topic and its final check has not been recorded. */
export async function needsFinalCheck(db: AdminClient, article: { opportunity_id: string | null; classification: string }): Promise<boolean> {
  if (article.classification !== "external" || !article.opportunity_id) return false;
  const { data } = await db
    .from("content_opportunities")
    .select("released_external_at, final_check_at")
    .eq("id", article.opportunity_id)
    .maybeSingle();
  return Boolean(data?.released_external_at && !data.final_check_at);
}

/** Opdracht geven: an editor creates a topic and tells the bot whom to interview. */
export async function assignTopic(options: {
  organizationId: string;
  by: string;
  title: string;
  briefing: string;
  classification: Classification;
  contentType: ContentType;
  intervieweeIds: string[];
  projectId: string | null;
}): Promise<{ opportunityId: string; articleId: string; interviewIds: string[]; skippedInterviews: string[] }> {
  const db = createAdminClient();
  const { data: agent } = await db
    .from("agents")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("kind", options.classification === "external" ? "external" : "internal")
    .single();
  if (!agent) throw new TopicError("Het bureau is niet gevonden.");

  const { data: topic, error } = await db
    .from("content_opportunities")
    .insert({
      organization_id: options.organizationId,
      title: options.title,
      angle: options.briefing,
      briefing: options.briefing,
      suggested_content_type: options.contentType,
      classification: options.classification,
      assigned_agent_id: agent.id,
      priority: 70,
      external_permission: options.classification === "external" ? "unknown" : "not_required",
      origin: "manual",
      project_id: options.projectId,
      proposed_interviewee_ids: options.intervieweeIds,
      status: "accepted",
    })
    .select("id")
    .single();
  if (error || !topic) throw new Error(error?.message ?? "De opdracht kon niet worden aangemaakt.");

  const picked = await pickUpTopic({
    organizationId: options.organizationId,
    opportunityId: topic.id,
    by: options.by,
    intervieweeIds: options.intervieweeIds,
    trigger: "manual",
  });
  return { opportunityId: topic.id, ...picked };
}

/**
 * What follows from an approved external piece: two or three social posts
 * and a short piece for the internal newsletter. All of it is a draft that
 * goes through its own approval.
 */
export async function createFollowUps(options: {
  organizationId: string;
  articleId: string;
  by: string;
}): Promise<{ socialPosts: number; internalArticleId: string | null; notes: string[] }> {
  const db = createAdminClient();
  const { data: article } = await db
    .from("articles")
    .select("id, title, classification, status")
    .eq("organization_id", options.organizationId)
    .eq("id", options.articleId)
    .single();
  if (!article) throw new TopicError("Stuk niet gevonden.");
  if (article.classification !== "external") throw new TopicError("Vervolgstukken horen bij een extern stuk.");
  const base = { organizationId: options.organizationId, trigger: "manual" as const, triggeredBy: options.by };
  const notes: string[] = [];

  let socialPosts = 0;
  const { count: existingPosts } = await db
    .from("social_posts")
    .select("id", { count: "exact", head: true })
    .eq("article_id", article.id)
    .is("written_for_profile_id", null);
  if (existingPosts) notes.push("Er waren al social posts bij dit stuk; die zijn niet opnieuw gemaakt.");
  else socialPosts = (await generateSocialPosts({ ...base, articleId: article.id, platforms: ["linkedin"] })).postIds.length;

  let internalArticleId: string | null = null;
  try {
    internalArticleId = (await createChannelVariant({ ...base, articleId: article.id, channel: "slack" })).articleId;
    await db.from("articles").update({ channel: "internal_newsletter", title: `Intern: ${article.title}` }).eq("id", internalArticleId);
  } catch (error) {
    notes.push(`Het interne stukje kon niet worden gemaakt: ${error instanceof Error ? error.message : String(error)}`);
  }

  await logSystemAction(db, {
    organizationId: options.organizationId,
    action: "article.follow_ups",
    category: "generated",
    entityType: "article",
    entityId: article.id,
    summary: `Vervolgstukken gemaakt bij “${article.title}”: ${socialPosts} social post(s)${internalArticleId ? " en een stukje voor de interne nieuwsbrief" : ""}. Elk stuk doorloopt zijn eigen goedkeuring.`,
    requiresApproval: true,
  });
  return { socialPosts, internalArticleId, notes };
}
