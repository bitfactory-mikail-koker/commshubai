import "server-only";
import { addDays, endOfMonth, format, setHours, startOfMonth } from "date-fns";
import { nl } from "date-fns/locale";
import { validateBrand } from "@/lib/agents/brand-validation";
import { AgentRuntime, withRun } from "@/lib/agents/runtime";
import type { InterviewBrief, SocialVariant, SourceMaterial, TranscriptEntry } from "@/lib/ai/types";
import { upsertCalendarEntry } from "@/lib/calendar";
import { CONTENT_TYPE_LABELS } from "@/lib/constants";
import { stripHtml } from "@/lib/html-text";
import { fromJson, toJson } from "@/lib/json";
import { loadRedactieSettings } from "@/lib/redactie/bot";
import { removeQuote } from "@/lib/redactie/quotes";
import { sanitizeHtml } from "@/lib/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AgentKind,
  Article,
  BrandIssue,
  Classification,
  Confidentiality,
  ContentType,
  ExternalPermission,
  Interview,
  InterviewKind,
  InterviewQuestion,
  InterviewSummary,
  SignalAudience,
  SignalCategory,
  SignalEntities,
  SourceRef,
  Stakeholder,
} from "@/lib/types";
import { mapConcurrent } from "@/lib/concurrency";

type Trigger = "manual" | "schedule" | "event" | "demo";
type BaseOptions = { organizationId: string; trigger: Trigger; triggeredBy?: string | null };

const SOURCE_LABELS: Record<string, string> = {
  slack: "Slack",
  jira: "Jira",
  teamleader: "Teamleader Orbit",
  email: "E-mail",
  manual: "Handmatig aangeleverd",
};

function toSourceRefs(sources: SourceMaterial[]): SourceRef[] {
  return sources.map((s) => ({
    source_message_id: s.id,
    source: s.source,
    label: `${SOURCE_LABELS[s.source] ?? s.source}${s.channel ? ` ${s.channel}` : ""}${s.author ? ` - ${s.author}` : ""}`,
    url: s.url ?? null,
    occurred_at: s.occurredAt,
  }));
}

function defaultChannel(type: ContentType, classification: Classification): string {
  if (classification === "external") return type === "social_post" ? "linkedin" : "website";
  if (type === "management_update") return "email";
  if (type === "employee_introduction") return "internal_newsletter";
  return "intranet";
}

async function agentKindOf(rt: { db: AgentRuntime["db"] }, agentId: string | null, fallback: Classification): Promise<AgentKind> {
  if (agentId) {
    const { data } = await rt.db.from("agents").select("kind").eq("id", agentId).maybeSingle();
    if (data) return data.kind;
  }
  return fallback === "external" ? "external" : "internal";
}

// =============================================================================
// 1. Story evaluation → content opportunity (+ referral internal → external)
// =============================================================================
export async function evaluateSignal(
  options: BaseOptions & { signalId: string; agentKind?: AgentKind; onlyIfRelevant?: boolean },
): Promise<{ opportunityId: string | null; externalOpportunityId: string | null; referred: boolean; skippedReason?: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: signal, error } = await db
    .from("content_signals")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.signalId)
    .single();
  if (error || !signal) throw new Error("Signaal niet gevonden.");
  const agentKind = options.agentKind ?? signal.suggested_agent;

  // The pause button: the bot makes no new proposals on its own. An editor can still ask for one.
  if (options.trigger !== "manual" && options.trigger !== "demo" && (await loadRedactieSettings(db, options.organizationId)).botPaused) {
    return { opportunityId: null, externalOpportunityId: null, referred: false, skippedReason: "paused" };
  }

  // Where the signal came from decides how careful the bureau has to be with it.
  let internalOnly = agentKind === "internal" && (signal.confidentiality === "internal_only" || signal.confidentiality === "confidential");
  let proposedInterviewees: string[] = [];
  if (signal.primary_source_id) {
    const { data: source } = await db
      .from("source_messages")
      .select("author_profile_id, channel_id")
      .eq("id", signal.primary_source_id)
      .maybeSingle();
    if (source?.author_profile_id) proposedInterviewees = [source.author_profile_id];
    if (source?.channel_id) {
      const { data: channel } = await db.from("channels").select("confidentiality").eq("id", source.channel_id).maybeSingle();
      if (channel?.confidentiality === "internal_only") internalOnly = true;
    }
  }

  const result = await withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "story_evaluation",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { signal_id: signal.id },
    },
    async (rt) => {
      const minScore = Number(fromJson<Record<string, unknown>>(rt.agent!.config, {}).min_relevance_score ?? 50);
      if (options.onlyIfRelevant && signal.relevance_score < minScore) {
        rt.step("threshold", "Onder de relevantiedrempel", `Score ${signal.relevance_score} < ${minScore}`, "evaluate_story", "skipped");
        return { opportunityId: null, externalOpportunityId: null, referred: false, referralMessageId: null, skippedReason: "below_threshold" };
      }
      if (agentKind === "external" && signal.confidentiality === "confidential") {
        rt.step("confidential", "Vertrouwelijk signaal overgeslagen", "De externe agent verwerkt geen vertrouwelijke informatie.", "evaluate_story", "skipped");
        return { opportunityId: null, externalOpportunityId: null, referred: false, referralMessageId: null, skippedReason: "confidential" };
      }

      const { data: existing } = await rt.db
        .from("content_opportunities")
        .select("id")
        .eq("organization_id", rt.orgId)
        .eq("signal_id", signal.id)
        .eq("assigned_agent_id", rt.agent!.id)
        .maybeSingle();
      if (existing) {
        rt.step("exists", "Kans bestond al", undefined, "evaluate_story", "skipped");
        return { opportunityId: existing.id, externalOpportunityId: null, referred: false, referralMessageId: null };
      }

      rt.use("evaluate_story");
      const sources = await rt.readSignalSources(signal.id);
      rt.step("context", "Context geladen", `${sources.length} bron(nen) uit toegestane systemen`, "read_sources");

      const { data: people } = await rt.db
        .from("profiles")
        .select("id, full_name, job_title, department")
        .eq("organization_id", rt.orgId)
        .eq("is_active", true);

      const evaluation = await rt.ai.evaluateStory({
        agentKind,
        organizationName: rt.organization.name,
        signal: {
          title: signal.title,
          summary: signal.summary,
          category: signal.category as SignalCategory,
          audience: signal.audience as SignalAudience,
          relevanceScore: signal.relevance_score,
          entities: fromJson<SignalEntities>(signal.entities, {}),
          confidentiality: signal.confidentiality as Confidentiality,
          missingInformation: fromJson<string[]>(signal.missing_information, []),
        },
        sources,
        people: (people ?? []).map((p) => ({ id: p.id, name: p.full_name, jobTitle: p.job_title, department: p.department })),
      });
      rt.step("evaluate", "Verhaal beoordeeld", `${CONTENT_TYPE_LABELS[evaluation.contentType]} - prioriteit ${evaluation.priority}`, "evaluate_story");

      const stakeholders: Stakeholder[] = evaluation.stakeholders.map((s) => ({
        ...s,
        profile_id: (people ?? []).find((p) => p.full_name === s.name)?.id ?? null,
      }));

      rt.use("create_opportunity");
      if (agentKind === "external") rt.use("check_external_permission");
      const { data: opportunity, error: oppError } = await rt.db
        .from("content_opportunities")
        .insert({
          organization_id: rt.orgId,
          signal_id: signal.id,
          title: evaluation.title,
          angle: evaluation.angle,
          suggested_content_type: evaluation.contentType,
          classification: evaluation.classification,
          assigned_agent_id: rt.agent!.id,
          priority: evaluation.priority,
          stakeholders: toJson(stakeholders),
          external_permission: evaluation.externalPermission,
          is_demo: signal.is_demo,
          origin: signal.origin === "interview" ? "listen" : signal.origin,
          project_id: signal.project_id,
          // Internal stays internal: only an editor can release this topic for external use.
          internal_only: internalOnly,
          proposed_interviewee_ids: proposedInterviewees,
        })
        .select("id")
        .single();
      if (oppError || !opportunity) throw new Error(oppError?.message ?? "Kans kon niet worden opgeslagen.");
      rt.step("opportunity", "Contentkans aangemaakt", evaluation.title, "create_opportunity");

      await rt.log({
        action: "opportunity.created",
        category: "discovered",
        entityType: "opportunity",
        entityId: opportunity.id,
        summary: `Contentkans voorgesteld: “${evaluation.title}” (${CONTENT_TYPE_LABELS[evaluation.contentType]}).${
          evaluation.externalPermission === "unknown" ? " Toestemming voor externe publicatie is nog niet geverifieerd." : ""
        }`,
        metadata: { signal_id: signal.id, sources_used: sources.map((s) => s.id), stakeholders: stakeholders.map((s) => s.name) },
        requiresApproval: evaluation.externalPermission === "unknown",
      });

      // Internal agent: refer externally interesting stories to the external agent.
      let referralMessageId: string | null = null;
      if (agentKind === "internal" && evaluation.alsoInterestingExternally && rt.canUse("refer_to_external_agent")) {
        const { data: externalAgent } = await rt.db
          .from("agents")
          .select("id, name")
          .eq("organization_id", rt.orgId)
          .eq("kind", "external")
          .single();
        if (externalAgent) {
          rt.use("refer_to_external_agent");
          const { data: message } = await rt.db
            .from("agent_messages")
            .insert({
              organization_id: rt.orgId,
              from_agent_id: rt.agent!.id,
              to_agent_id: externalAgent.id,
              type: "opportunity_referral",
              subject: `Mogelijk extern verhaal: ${signal.title}`,
              body: evaluation.externalPitch || `Dit interne verhaal kan ook extern interessant zijn: ${signal.summary}`,
              signal_id: signal.id,
              opportunity_id: opportunity.id,
              payload: toJson({ confidentiality: signal.confidentiality }),
            })
            .select("id")
            .single();
          referralMessageId = message?.id ?? null;
          rt.step("referral", "Doorverwezen naar externe agent", evaluation.externalPitch, "refer_to_external_agent");
          await rt.log({
            action: "agent.referral",
            category: "handoff",
            entityType: "signal",
            entityId: signal.id,
            summary: `Verhaal aangedragen bij de ${externalAgent.name}: “${signal.title}”.`,
            metadata: { message_id: referralMessageId },
          });
        }
      }

      await rt.db.from("content_signals").update({ status: signal.status === "needs_info" ? "needs_info" : "in_progress" }).eq("id", signal.id);
      return { opportunityId: opportunity.id, externalOpportunityId: null, referred: Boolean(referralMessageId), referralMessageId };
    },
  );

  // The external agent picks up the referral in its own run.
  let externalOpportunityId: string | null = null;
  if (result.referralMessageId) {
    try {
      const handled = await handleReferral({ ...options, messageId: result.referralMessageId as string });
      externalOpportunityId = handled.opportunityId;
    } catch (e) {
      console.error("[agents] referral could not be handled", e);
    }
  }
  return { ...result, externalOpportunityId };
}

/** External agent accepts (or declines) a referral from the internal agent. */
export async function handleReferral(
  options: BaseOptions & { messageId: string },
): Promise<{ opportunityId: string | null; [k: string]: unknown }> {
  return withRun(
    {
      organizationId: options.organizationId,
      agentKind: "external",
      pipeline: "handle_referral",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { message_id: options.messageId },
    },
    async (rt) => {
      const { data: message } = await rt.db
        .from("agent_messages")
        .select("*")
        .eq("organization_id", rt.orgId)
        .eq("id", options.messageId)
        .single();
      if (!message || !message.signal_id) throw new Error("Doorverwijzing niet gevonden.");
      const { data: signal } = await rt.db.from("content_signals").select("*").eq("id", message.signal_id).single();
      if (!signal) throw new Error("Signaal niet gevonden.");

      if (signal.confidentiality === "confidential") {
        await rt.db
          .from("agent_messages")
          .update({ status: "declined", response: "Afgewezen: het signaal is als vertrouwelijk gemarkeerd.", responded_at: new Date().toISOString() })
          .eq("id", message.id);
        rt.step("declined", "Doorverwijzing afgewezen", "Vertrouwelijke informatie wordt niet extern verwerkt.", "evaluate_story", "skipped");
        return { opportunityId: null };
      }

      rt.use("evaluate_story");
      const sources = await rt.readSignalSources(signal.id);
      const { data: people } = await rt.db
        .from("profiles")
        .select("id, full_name, job_title, department")
        .eq("organization_id", rt.orgId)
        .eq("is_active", true);
      const evaluation = await rt.ai.evaluateStory({
        agentKind: "external",
        organizationName: rt.organization.name,
        signal: {
          title: signal.title,
          summary: signal.summary,
          category: signal.category as SignalCategory,
          audience: signal.audience as SignalAudience,
          relevanceScore: signal.relevance_score,
          entities: fromJson<SignalEntities>(signal.entities, {}),
          confidentiality: signal.confidentiality as Confidentiality,
          missingInformation: fromJson<string[]>(signal.missing_information, []),
        },
        sources,
        people: (people ?? []).map((p) => ({ id: p.id, name: p.full_name, jobTitle: p.job_title, department: p.department })),
      });

      rt.use("create_opportunity");
      rt.use("check_external_permission");
      const { data: opportunity, error } = await rt.db
        .from("content_opportunities")
        .insert({
          organization_id: rt.orgId,
          signal_id: signal.id,
          title: evaluation.title,
          angle: evaluation.angle,
          suggested_content_type: evaluation.contentType,
          classification: "external",
          assigned_agent_id: rt.agent!.id,
          referred_by_agent_id: message.from_agent_id,
          priority: evaluation.priority,
          stakeholders: toJson(
            evaluation.stakeholders.map((s) => ({ ...s, profile_id: (people ?? []).find((p) => p.full_name === s.name)?.id ?? null })),
          ),
          // Referred internal information always needs explicit permission.
          external_permission: evaluation.externalPermission === "granted" ? "granted" : "unknown",
          is_demo: signal.is_demo,
          origin: "referral",
          project_id: signal.project_id,
        })
        .select("id")
        .single();
      if (error || !opportunity) throw new Error(error?.message ?? "Kans kon niet worden opgeslagen.");

      await rt.db
        .from("agent_messages")
        .update({
          status: "accepted",
          response: `Opgepakt als externe contentkans: “${evaluation.title}”. Externe publicatie vereist nog expliciete toestemming.`,
          responded_at: new Date().toISOString(),
        })
        .eq("id", message.id);
      rt.step("accepted", "Doorverwijzing opgepakt", evaluation.title, "create_opportunity");
      await rt.log({
        action: "agent.referral_accepted",
        category: "handoff",
        entityType: "opportunity",
        entityId: opportunity.id,
        summary: `Doorverwijzing van de interne agent opgepakt als externe kans: “${evaluation.title}”. Toestemming voor externe publicatie moet nog worden bevestigd.`,
        metadata: { message_id: message.id, signal_id: signal.id },
        requiresApproval: true,
      });
      return { opportunityId: opportunity.id };
    },
  );
}

// =============================================================================
// 2. Accept an opportunity → content item in "research"
// =============================================================================
export async function acceptOpportunity(
  options: BaseOptions & { opportunityId: string },
): Promise<{ articleId: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: opportunity } = await db
    .from("content_opportunities")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.opportunityId)
    .single();
  if (!opportunity) throw new Error("Contentkans niet gevonden.");
  if (opportunity.article_id) return { articleId: opportunity.article_id };
  const agentKind = await agentKindOf({ db }, opportunity.assigned_agent_id, opportunity.classification);

  return withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "accept_opportunity",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { opportunity_id: opportunity.id },
    },
    async (rt) => {
      rt.use("enrich_context");
      const sources = opportunity.signal_id ? await rt.readSignalSources(opportunity.signal_id) : [];
      rt.step("research", "Bronnen verzameld", `${sources.length} bron(nen) gekoppeld aan het contentitem`, "enrich_context");

      const { data: article, error } = await rt.db
        .from("articles")
        .insert({
          organization_id: rt.orgId,
          title: opportunity.title,
          subtitle: null,
          excerpt: opportunity.angle,
          content_type: opportunity.suggested_content_type,
          classification: opportunity.classification,
          target_audience: opportunity.classification === "external" ? "Klanten en relaties" : "Alle medewerkers",
          channel: defaultChannel(opportunity.suggested_content_type, opportunity.classification),
          status: "research",
          source_refs: toJson(toSourceRefs(sources)),
          agent_id: rt.agent!.id,
          opportunity_id: opportunity.id,
          external_permission: opportunity.external_permission,
          is_demo: opportunity.is_demo,
          created_by: options.triggeredBy ?? null,
        })
        .select("id")
        .single();
      if (error || !article) throw new Error(error?.message ?? "Contentitem kon niet worden aangemaakt.");

      if (opportunity.signal_id) {
        await rt.db.from("article_signals").insert({ article_id: article.id, signal_id: opportunity.signal_id, organization_id: rt.orgId });
        await rt.db.from("content_signals").update({ status: "converted" }).eq("id", opportunity.signal_id);
      }
      await rt.db.from("content_opportunities").update({ status: "in_progress", article_id: article.id }).eq("id", opportunity.id);

      rt.step("article", "Contentitem aangemaakt", `Status: Onderzoek`, "create_opportunity");
      await rt.log({
        action: "article.created",
        category: "performed",
        entityType: "article",
        entityId: article.id,
        summary: `Contentitem gestart vanuit kans “${opportunity.title}” (status: Onderzoek).`,
        metadata: { opportunity_id: opportunity.id, sources_used: sources.map((s) => s.id) },
      });
      return { articleId: article.id };
    },
  );
}

// =============================================================================
// 3. Interviews
// =============================================================================
export type CreateInterviewInput = BaseOptions & {
  agentKind: AgentKind;
  title: string;
  purpose: string;
  kind: InterviewKind;
  classification: Classification;
  intervieweeProfileId?: string | null;
  intervieweeName: string;
  intervieweeRole?: string | null;
  articleId?: string | null;
  opportunityId?: string | null;
  scheduledAt?: string | null;
  context?: string;
  customer?: string | null;
  project?: string | null;
  questionCount?: number;
  metadata?: Record<string, unknown>;
  isDemo?: boolean;
  /** False when the interview is held by an editor in person: no invitation by the bot. */
  invite?: boolean;
};

export async function createInterview(input: CreateInterviewInput): Promise<{ interviewId: string; [k: string]: unknown }> {
  return withRun(
    {
      organizationId: input.organizationId,
      agentKind: input.agentKind,
      pipeline: "interview_request",
      trigger: input.trigger,
      triggeredBy: input.triggeredBy,
      input: { title: input.title, article_id: input.articleId ?? null },
    },
    async (rt) => {
      rt.use("generate_interview_questions");
      const brief: InterviewBrief = {
        title: input.title,
        purpose: input.purpose,
        kind: input.kind,
        intervieweeName: input.intervieweeName,
        intervieweeRole: input.intervieweeRole ?? null,
        context: input.context ?? "",
        customer: input.customer,
        project: input.project,
      };
      const questions = await rt.ai.generateInterviewQuestions({
        interview: brief,
        brand: await rt.brand(),
        // Three to five questions, asked one at a time; follow-ups come on top.
        count: Math.min(7, Math.max(3, input.questionCount ?? 5)),
      });
      rt.step("questions", "Interviewvragen opgesteld", `${questions.length} vragen`, "generate_interview_questions");

      const now = new Date().toISOString();
      const { data: interview, error } = await rt.db
        .from("interviews")
        .insert({
          organization_id: rt.orgId,
          title: input.title,
          purpose: input.purpose,
          kind: input.kind,
          classification: input.classification,
          interviewee_profile_id: input.intervieweeProfileId ?? null,
          interviewee_name: input.intervieweeName,
          interviewee_role: input.intervieweeRole ?? null,
          status: input.scheduledAt ? "scheduled" : "requested",
          agent_id: rt.agent!.id,
          opportunity_id: input.opportunityId ?? null,
          article_id: input.articleId ?? null,
          questions: toJson(questions),
          metadata: toJson({ ...(input.metadata ?? {}), context: input.context ?? "", customer: input.customer ?? null, project: input.project ?? null }),
          scheduled_at: input.scheduledAt ?? null,
          requested_at: now,
          is_demo: input.isDemo ?? false,
          created_by: input.triggeredBy ?? null,
        })
        .select("id")
        .single();
      if (error || !interview) throw new Error(error?.message ?? "Interview kon niet worden aangemaakt.");

      if (input.articleId) {
        const { data: article } = await rt.db.from("articles").select("status").eq("id", input.articleId).single();
        if (article && ["new_signal", "research"].includes(article.status)) {
          await rt.db.from("articles").update({ status: "interview_requested", interview_id: interview.id }).eq("id", input.articleId);
        } else {
          await rt.db.from("articles").update({ interview_id: interview.id }).eq("id", input.articleId);
        }
      }

      if (input.scheduledAt && rt.canUse("update_calendar")) {
        await upsertCalendarEntry(rt.db, {
          organizationId: rt.orgId,
          entityType: "interview",
          entityId: interview.id,
          entryType: "interview",
          title: `Interview: ${input.intervieweeName}`,
          startsAt: input.scheduledAt,
          classification: input.classification,
          createdBy: input.triggeredBy ?? null,
        });
      }

      rt.step("request", "Interview aangevraagd", `${input.intervieweeName}${input.intervieweeRole ? ` (${input.intervieweeRole})` : ""}`, "conduct_interview");
      await rt.log({
        action: "interview.requested",
        category: "requested",
        entityType: "interview",
        entityId: interview.id,
        summary: `Interview aangevraagd bij ${input.intervieweeName}${input.intervieweeRole ? ` (${input.intervieweeRole})` : ""}: “${input.title}” met ${questions.length} voorbereide vragen.`,
        metadata: { article_id: input.articleId ?? null, questions: questions.length },
      });
      return { interviewId: interview.id };
    },
  ).then(async (result) => {
    // The bot invites the interviewee itself. Whether the message goes out is decided by the bot's conduct rules.
    if (input.intervieweeProfileId && input.invite !== false) {
      try {
        const { inviteToInterview } = await import("@/lib/redactie/interview-flow");
        await inviteToInterview({ organizationId: input.organizationId, interviewId: result.interviewId });
      } catch (error) {
        console.error("[interviews] invitation could not be sent", error);
      }
    }
    return result;
  });
}

function briefOf(interview: Interview): InterviewBrief {
  const meta = fromJson<Record<string, unknown>>(interview.metadata, {});
  return {
    title: interview.title,
    purpose: interview.purpose,
    kind: interview.kind as InterviewKind,
    intervieweeName: interview.interviewee_name,
    intervieweeRole: interview.interviewee_role,
    context: typeof meta.context === "string" ? meta.context : "",
    customer: typeof meta.customer === "string" ? meta.customer : null,
    project: typeof meta.project === "string" ? meta.project : null,
  };
}

async function loadInterview(rt: AgentRuntime, interviewId: string) {
  const { data: interview } = await rt.db
    .from("interviews")
    .select("*")
    .eq("organization_id", rt.orgId)
    .eq("id", interviewId)
    .single();
  if (!interview) throw new Error("Interview niet gevonden.");
  const { data: messages } = await rt.db
    .from("interview_messages")
    .select("content, created_at, id, interview_id, question_id, role")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });
  const transcript: TranscriptEntry[] = (messages ?? []).map((m) => ({
    role: m.role as "agent" | "interviewee",
    content: m.content,
    questionId: m.question_id,
  }));
  return { interview, transcript, questions: fromJson<InterviewQuestion[]>(interview.questions, []) };
}

/**
 * Produces the agent's next message in the conversation. Called when the
 * interview starts and after each answer. Completes the interview (summary,
 * follow-ups, status) when all questions are covered.
 */
export async function advanceInterview(
  options: BaseOptions & { interviewId: string },
): Promise<{ done: boolean; message: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("interviews")
    .select("agent_id, classification")
    .eq("organization_id", options.organizationId)
    .eq("id", options.interviewId)
    .single();
  if (!row) throw new Error("Interview niet gevonden.");
  const agentKind = await agentKindOf({ db }, row.agent_id, row.classification);

  return withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "interview_turn",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { interview_id: options.interviewId },
    },
    async (rt) => {
      rt.use("conduct_interview");
      const { interview, transcript, questions } = await loadInterview(rt, options.interviewId);
      if (["completed", "cancelled", "awaiting_confirmation"].includes(interview.status)) {
        return { done: true, message: "" };
      }
      // Never speak twice in a row: wait for the interviewee's answer.
      const last = transcript[transcript.length - 1];
      if (last?.role === "agent") return { done: false, message: last.content };

      const turn = await rt.ai.nextInterviewTurn({ interview: briefOf(interview), questions, transcript });
      await rt.db.from("interview_messages").insert({
        organization_id: rt.orgId,
        interview_id: interview.id,
        role: "agent",
        content: turn.message,
        question_id: turn.questionId,
      });
      if (interview.status !== "in_progress") {
        await rt.db.from("interviews").update({ status: "in_progress" }).eq("id", interview.id);
      }
      rt.step("turn", turn.done ? "Interview afgesloten" : "Vraag gesteld", turn.message.slice(0, 120), "conduct_interview");

      if (turn.done) {
        await finalizeInterview(rt, interview.id, { confirm: true });
      }
      return { done: turn.done, message: turn.message };
    },
  );
}

/**
 * Summarizes the interview. With `confirm` the summary first goes back to the
 * interviewee ("Klopt dit?") and the interview only counts as completed once
 * they confirmed it; see confirmInterviewSummary.
 */
async function finalizeInterview(rt: AgentRuntime, interviewId: string, options: { confirm?: boolean } = {}): Promise<InterviewSummary> {
  rt.use("summarize_interview");
  const { interview, transcript, questions } = await loadInterview(rt, interviewId);
  const summary = await rt.ai.summarizeInterview({ interview: briefOf(interview), questions, transcript });
  // The bot always asks for an image; getting it is a follow-up for the editors.
  const followUps = [...summary.follow_ups];
  if (!followUps.some((f) => /beeld|foto|afbeelding/i.test(f))) {
    followUps.push(`Beeld bij dit verhaal opvragen of ophalen bij ${interview.interviewee_name}`);
  }
  const awaiting = Boolean(options.confirm);
  await rt.db
    .from("interviews")
    .update({
      status: awaiting ? "awaiting_confirmation" : "completed",
      summary: toJson(summary),
      follow_up_actions: toJson(followUps.map((text, i) => ({ id: `f${i + 1}`, text, done: false }))),
      completed_at: awaiting ? null : new Date().toISOString(),
    })
    .eq("id", interviewId);

  if (awaiting) {
    const closing = [
      "Dank je wel! Dit heb ik van je begrepen:",
      "",
      summary.summary,
      "",
      ...summary.key_points.map((point) => `• ${point}`),
      "",
      "Klopt dit? Zeg het ook als er iets ontbreekt of anders moet. Heb je een foto of ander beeld dat bij dit verhaal past, laat het dan weten.",
    ].join("\n");
    await rt.db.from("interview_messages").insert({
      organization_id: rt.orgId,
      interview_id: interviewId,
      role: "agent",
      content: closing,
      question_id: null,
    });
    rt.step("confirm", "Samenvatting voorgelegd", `“Klopt dit?” aan ${interview.interviewee_name}`, "summarize_interview");
    return summary;
  }

  if (interview.article_id) {
    const { data: article } = await rt.db.from("articles").select("status").eq("id", interview.article_id).single();
    if (article && ["research", "interview_requested", "new_signal"].includes(article.status)) {
      await rt.db.from("articles").update({ status: "interview_completed" }).eq("id", interview.article_id);
    }
  }
  await rt.db
    .from("content_calendar")
    .update({ status: "done" })
    .eq("entity_type", "interview")
    .eq("entity_id", interviewId);

  rt.step("summary", "Interview samengevat", `${summary.key_points.length} kernpunten, ${summary.quotes.length} quotes, ${summary.follow_ups.length} vervolgacties`, "summarize_interview");
  await rt.log({
    action: "interview.completed",
    category: "generated",
    entityType: "interview",
    entityId: interviewId,
    summary: `Interview met ${interview.interviewee_name} afgerond en samengevat (${summary.key_points.length} kernpunten, ${summary.quotes.length} quotes).`,
    metadata: { article_id: interview.article_id, follow_ups: summary.follow_ups },
  });
  return summary;
}

/**
 * The interviewee answered "Klopt dit?". A confirmation completes the
 * interview; a correction is added to the transcript and the summary is made
 * again, once, after which the interview is completed with the correction in it.
 */
export async function confirmInterviewSummary(
  options: BaseOptions & { interviewId: string; correction?: string | null; confirmedBy?: string | null },
): Promise<{ interviewId: string; corrected: boolean; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("interviews")
    .select("agent_id, classification, status")
    .eq("organization_id", options.organizationId)
    .eq("id", options.interviewId)
    .single();
  if (!row) throw new Error("Interview niet gevonden.");
  if (row.status !== "awaiting_confirmation") throw new Error("Dit interview wacht niet op een bevestiging.");
  const agentKind = await agentKindOf({ db }, row.agent_id, row.classification);
  const correction = options.correction?.trim() || null;

  return withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "interview_confirmation",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { interview_id: options.interviewId, corrected: Boolean(correction) },
    },
    async (rt) => {
      if (correction) {
        await rt.db.from("interview_messages").insert({
          organization_id: rt.orgId,
          interview_id: options.interviewId,
          role: "interviewee",
          content: `Correctie op de samenvatting: ${correction}`,
          author_profile_id: options.confirmedBy ?? null,
        });
        await finalizeInterview(rt, options.interviewId);
      } else {
        const { interview } = await loadInterview(rt, options.interviewId);
        await rt.db.from("interviews").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", options.interviewId);
        if (interview.article_id) {
          const { data: article } = await rt.db.from("articles").select("status").eq("id", interview.article_id).single();
          if (article && ["research", "interview_requested", "new_signal"].includes(article.status)) {
            await rt.db.from("articles").update({ status: "interview_completed" }).eq("id", interview.article_id);
          }
        }
        await rt.db.from("content_calendar").update({ status: "done" }).eq("entity_type", "interview").eq("entity_id", options.interviewId);
        await rt.log({
          action: "interview.completed",
          category: "generated",
          entityType: "interview",
          entityId: options.interviewId,
          summary: `Interview met ${interview.interviewee_name} afgerond; de samenvatting is bevestigd.`,
          metadata: { article_id: interview.article_id },
        });
      }
      await rt.db.from("interviews").update({ summary_confirmed_at: new Date().toISOString() }).eq("id", options.interviewId);
      rt.step("confirmed", correction ? "Correctie verwerkt" : "Samenvatting bevestigd", undefined, "summarize_interview");
      return { interviewId: options.interviewId, corrected: Boolean(correction) };
    },
  );
}

/** Closes an interview early (manually) and summarizes what was answered. */
export async function completeInterview(
  options: BaseOptions & { interviewId: string },
): Promise<{ interviewId: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: row } = await db
    .from("interviews")
    .select("agent_id, classification")
    .eq("organization_id", options.organizationId)
    .eq("id", options.interviewId)
    .single();
  if (!row) throw new Error("Interview niet gevonden.");
  const agentKind = await agentKindOf({ db }, row.agent_id, row.classification);
  return withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "interview_summary",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { interview_id: options.interviewId },
    },
    async (rt) => {
      const { transcript } = await loadInterview(rt, options.interviewId);
      if (!transcript.some((t) => t.role === "interviewee")) {
        throw new Error("Er zijn nog geen antwoorden om samen te vatten.");
      }
      await finalizeInterview(rt, options.interviewId);
      return { interviewId: options.interviewId };
    },
  );
}

/** Pairs each prepared question with the interviewee's answer(s). */
export function pairQuestionsAndAnswers(
  questions: InterviewQuestion[],
  transcript: TranscriptEntry[],
): { question: string; topic?: string; answer: string }[] {
  const pairs: { question: string; topic?: string; answer: string }[] = [];
  let current: { question: string; topic?: string; answer: string } | null = null;
  for (const entry of transcript) {
    if (entry.role === "agent") {
      if (entry.questionId) {
        const q = questions.find((x) => x.id === entry.questionId);
        current = { question: q?.text ?? entry.content, topic: q?.topic, answer: "" };
        pairs.push(current);
      }
      // A follow-up (no questionId) keeps adding to the current pair.
    } else if (current) {
      current.answer = current.answer ? `${current.answer} ${entry.content}` : entry.content;
    }
  }
  return pairs.filter((p) => p.answer.trim().length > 0);
}

// =============================================================================
// 4. Draft generation + brand validation
// =============================================================================
async function collectArticleMaterial(rt: AgentRuntime, article: Article) {
  const { data: links } = await rt.db.from("article_signals").select("signal_id").eq("article_id", article.id);
  const signalIds = (links ?? []).map((l) => l.signal_id);
  const sourceIds = new Set<string>();
  if (signalIds.length > 0) {
    const { data: rows } = await rt.db.from("signal_sources").select("source_message_id").in("signal_id", signalIds);
    for (const r of rows ?? []) sourceIds.add(r.source_message_id);
  }
  for (const ref of fromJson<SourceRef[]>(article.source_refs, [])) {
    if (ref.source_message_id) sourceIds.add(ref.source_message_id);
  }
  const sources = await rt.readSources([...sourceIds]);

  let entities: SignalEntities = {};
  if (signalIds.length > 0) {
    const { data: signal } = await rt.db.from("content_signals").select("entities").eq("id", signalIds[0]).maybeSingle();
    entities = fromJson<SignalEntities>(signal?.entities, {});
  }

  // Interviews held for this item, plus the one it explicitly references
  // (channel variants reuse the interview of the original item).
  let interviewQuery = rt.db.from("interviews").select("article_id, classification, id, interviewee_name, interviewee_profile_id, interviewee_role, invite_choice, is_demo, organization_id, questions, redirect_to, reminded_at, status, summary, summary_confirmed_at, title").eq("organization_id", rt.orgId);
  interviewQuery = article.interview_id
    ? interviewQuery.or(`article_id.eq.${article.id},id.eq.${article.interview_id}`)
    : interviewQuery.eq("article_id", article.id);
  const { data: interviews } = await interviewQuery.order("created_at", { ascending: false });
  type InterviewMaterial = {
    id: string;
    intervieweeName: string;
    intervieweeRole: string | null;
    qa: { question: string; topic?: string; answer: string }[];
    summary: InterviewSummary | null;
  };
  // A piece can rest on several interviews (a customer case: the DM plus one or two team members).
  const completed = (interviews ?? []).filter((i) => i.status === "completed");
  const candidates = completed.length > 0 ? completed.reverse() : (interviews ?? []).slice(0, 1);
  const loaded = await mapConcurrent(candidates, async (interview) => {
    const { transcript, questions } = await loadInterview(rt, interview.id);
    return { interview, qa: pairQuestionsAndAnswers(questions, transcript) };
  });
  const materials: InterviewMaterial[] = loaded
    .filter(({ qa }) => qa.length > 0)
    .map(({ interview, qa }) => ({
      id: interview.id,
      intervieweeName: interview.interviewee_name,
      intervieweeRole: interview.interviewee_role,
      qa,
      summary: fromJson<InterviewSummary | null>(interview.summary, null),
    }));
  return { sources, entities, interview: materials[0] ?? null, moreInterviews: materials.slice(1) };
}

/**
 * What the writer has to be careful with for this piece: a customer that may
 * only appear anonymously, and source material from channels that are marked
 * internal only.
 */
async function sensitivityOf(rt: AgentRuntime, article: Article, sources: SourceMaterial[]) {
  const instructions: string[] = [];
  const forbiddenNames: string[] = [];
  const issues: BrandIssue[] = [];

  if (article.opportunity_id) {
    const { data: opportunity } = await rt.db.from("content_opportunities").select("project_id").eq("id", article.opportunity_id).maybeSingle();
    if (opportunity?.project_id) {
      const { data: project } = await rt.db
        .from("projects")
        .select("name, client_name, external_naming, anonymous_label")
        .eq("id", opportunity.project_id)
        .maybeSingle();
      if (project && article.classification === "external" && project.external_naming === "anonymous" && project.client_name) {
        const label = project.anonymous_label?.trim() || "de klant";
        instructions.push(
          `De klant mag niet bij naam worden genoemd. Schrijf “${label}” in plaats van “${project.client_name}” en laat details weg waaraan de klant te herkennen is.`,
        );
        forbiddenNames.push(project.client_name);
      }
      if (project && article.classification === "external" && project.external_naming === "unknown") {
        issues.push({
          severity: "warning",
          type: "confidential",
          message: `Nog niet bekend of “${project.client_name ?? project.name}” extern genoemd mag worden. De DM van het project moet dit bevestigen.`,
        });
      }
    }
  }

  if (article.classification === "external" && sources.length > 0) {
    const { data: rows } = await rt.db
      .from("source_messages")
      .select("id, channel, channel_id")
      .in(
        "id",
        sources.map((s) => s.id),
      )
      .not("channel_id", "is", null);
    const channelIds = Array.from(new Set((rows ?? []).map((r) => r.channel_id as string)));
    if (channelIds.length > 0) {
      const { data: channels } = await rt.db.from("channels").select("id, name, confidentiality").in("id", channelIds);
      for (const channel of channels ?? []) {
        if (channel.confidentiality !== "internal_only") continue;
        issues.push({
          severity: "error",
          type: "confidential",
          message: `Dit externe stuk gebruikt informatie uit #${channel.name}, een kanaal dat op “alleen intern” staat. Controleer per zin of dit naar buiten mag.`,
        });
      }
    }
  }
  return { instructions, forbiddenNames, issues };
}

export async function generateDraft(
  options: BaseOptions & { articleId: string; instructions?: string | null },
): Promise<{ articleId: string; version: number; openQuestions: string[]; brandScore: number; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: article } = await db
    .from("articles")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.articleId)
    .single();
  if (!article) throw new Error("Contentitem niet gevonden.");
  if (["in_review", "approved", "scheduled", "published", "archived"].includes(article.status)) {
    throw new Error("Dit contentitem kan in de huidige status niet opnieuw worden gegenereerd. Heropen het eerst als concept.");
  }
  const agentKind = await agentKindOf({ db }, article.agent_id, article.classification);

  return withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "content_generation",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { article_id: article.id },
    },
    async (rt) => {
      rt.use("generate_content");
      if (article.channel === "slack") rt.use("draft_slack_announcement");
      if (article.channel === "email") rt.use("draft_email");

      const material = await collectArticleMaterial(rt, article);
      rt.step(
        "material",
        "Materiaal verzameld",
        `${material.sources.length} bron(nen)${material.interview ? `, interview met ${material.interview.intervieweeName} (${material.interview.qa.length} antwoorden)` : ", geen interview"}`,
        "read_sources",
      );

      const brand = await rt.brand();
      const sensitivity = await sensitivityOf(rt, article, material.sources);
      const generated = await rt.ai.generateContent({
        contentType: article.content_type,
        classification: article.classification,
        channel: article.channel,
        audience: article.target_audience,
        brief: {
          title: article.title,
          angle: article.excerpt ?? article.subtitle ?? article.title,
          customer: material.entities.customer,
          project: material.entities.project,
        },
        sources: material.sources,
        interview: material.interview,
        moreInterviews: material.moreInterviews,
        brand,
        instructions: [options.instructions, ...sensitivity.instructions].filter(Boolean).join(" ") || null,
      });
      // AI output is untrusted markup: keep only the allowed formatting tags.
      const content = { ...generated, bodyHtml: sanitizeHtml(generated.bodyHtml) };
      rt.step("generate", "Concept geschreven", `${stripHtml(content.bodyHtml).split(/\s+/).length} woorden`, "generate_content");

      rt.use("validate_brand");
      const brandCheck = validateBrand({
        html: content.bodyHtml,
        title: content.title,
        wordsToAvoid: brand.wordsToAvoid,
        terminology: brand.terminology,
        classification: article.classification,
        sourceTexts: [
          ...material.sources.map((s) => `${s.title ?? ""} ${s.body}`),
          ...[material.interview, ...material.moreInterviews].flatMap((i) => i?.qa.map((q) => q.answer) ?? []),
          brand.boilerplate,
          article.title,
          article.excerpt ?? "",
        ],
        forbiddenNames: sensitivity.forbiddenNames,
        extraIssues: sensitivity.issues,
      });
      rt.step("brand", "Merkcontrole uitgevoerd", `Score ${brandCheck.score}/100, ${brandCheck.issues.length} aandachtspunt(en)`, "validate_brand");

      const version = article.current_version + 1;
      const isFirstDraft = article.current_version === 0 || !article.body_html;
      const title = isFirstDraft ? content.title : article.title;
      const sourceRefs: SourceRef[] = toSourceRefs(material.sources);
      for (const interview of [material.interview, ...material.moreInterviews]) {
        if (!interview) continue;
        sourceRefs.push({ interview_id: interview.id, source: "interview", label: `Interview met ${interview.intervieweeName}` });
      }

      const { error: versionError } = await rt.db.from("content_versions").insert({
        organization_id: rt.orgId,
        article_id: article.id,
        version,
        title,
        subtitle: content.subtitle,
        body_html: content.bodyHtml,
        change_summary: isFirstDraft ? "Eerste concept door agent" : "Nieuw concept door agent",
        created_by_agent_id: rt.agent!.id,
      });
      if (versionError) throw new Error(versionError.message);

      const { error: updateError } = await rt.db
        .from("articles")
        .update({
          title,
          subtitle: content.subtitle,
          body_html: content.bodyHtml,
          excerpt: content.excerpt,
          tags: Array.from(new Set([...(article.tags ?? []), ...content.tags])).slice(0, 8),
          status: "draft",
          current_version: version,
          brand_check: toJson(brandCheck),
          generation_provider: rt.ai.id,
          source_refs: toJson(sourceRefs),
          interview_id: material.interview?.id ?? article.interview_id,
        })
        .eq("id", article.id);
      if (updateError) throw new Error(updateError.message);

      if (content.openQuestions.length > 0) {
        await rt.db.from("comments").insert({
          organization_id: rt.orgId,
          entity_type: "article",
          entity_id: article.id,
          author_agent_id: rt.agent!.id,
          body: `Open punten bij dit concept (versie ${version}):\n${content.openQuestions.map((q) => `• ${q}`).join("\n")}`,
        });
      }

      await rt.log({
        action: "article.draft_generated",
        category: "generated",
        entityType: "article",
        entityId: article.id,
        summary: `Concept geschreven voor “${title}” (versie ${version}, merkscore ${brandCheck.score}/100). Wacht op review en menselijke goedkeuring.`,
        metadata: {
          version,
          sources_used: material.sources.map((s) => s.id),
          interview_id: material.interview?.id ?? null,
          open_questions: content.openQuestions,
          brand_issues: brandCheck.issues.length,
        },
        requiresApproval: true,
      });
      return { articleId: article.id, version, openQuestions: content.openQuestions, brandScore: brandCheck.score };
    },
  );
}

/** Re-runs the brand validation for the current text (after manual edits). */
export async function revalidateArticle(organizationId: string, articleId: string) {
  const db = createAdminClient();
  const { data: article } = await db.from("articles").select("*").eq("organization_id", organizationId).eq("id", articleId).single();
  if (!article) throw new Error("Contentitem niet gevonden.");
  const agentKind = await agentKindOf({ db }, article.agent_id, article.classification);
  return withRun(
    { organizationId, agentKind, pipeline: "brand_validation", trigger: "manual", input: { article_id: articleId } },
    async (rt) => {
      rt.use("validate_brand");
      const material = await collectArticleMaterial(rt, article);
      const brand = await rt.brand();
      const sensitivity = await sensitivityOf(rt, article, material.sources);
      const brandCheck = validateBrand({
        html: article.body_html,
        title: article.title,
        wordsToAvoid: brand.wordsToAvoid,
        terminology: brand.terminology,
        classification: article.classification,
        sourceTexts: [
          ...material.sources.map((s) => `${s.title ?? ""} ${s.body}`),
          ...[material.interview, ...material.moreInterviews].flatMap((i) => i?.qa.map((q) => q.answer) ?? []),
          brand.boilerplate,
        ],
        forbiddenNames: sensitivity.forbiddenNames,
        extraIssues: sensitivity.issues,
      });
      // brand_check is not part of the locked fields, so this is allowed in any status.
      await rt.db.from("articles").update({ brand_check: toJson(brandCheck) }).eq("id", articleId);
      rt.step("brand", "Merkcontrole uitgevoerd", `Score ${brandCheck.score}/100`, "validate_brand");
      return { score: brandCheck.score, issues: brandCheck.issues.length };
    },
  );
}

/**
 * Carries out a change an approver asked for in their own words, or removes a
 * quote its speaker refused. Produces a new version when the text changed;
 * the caller then starts a new approval round. When the request cannot be
 * carried out the text stays as it is and the request goes to the editors.
 */
export async function reviseArticle(
  options: BaseOptions & { articleId: string; instruction: string; requestedByName: string; removeQuoteText?: string | null },
): Promise<{ applied: boolean; version: number; note: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: article } = await db
    .from("articles")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.articleId)
    .single();
  if (!article) throw new Error("Contentitem niet gevonden.");
  if (["approved", "scheduled", "published", "archived"].includes(article.status)) {
    throw new Error("Dit stuk is al goedgekeurd of gepubliceerd. Heropen het eerst als concept.");
  }
  const agentKind = await agentKindOf({ db }, article.agent_id, article.classification);

  return withRun(
    {
      organizationId: options.organizationId,
      agentKind,
      pipeline: "revision",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { article_id: article.id },
    },
    async (rt) => {
      rt.use("generate_content");
      const brand = await rt.brand();
      let revision: { title: string; bodyHtml: string; applied: boolean; note: string };

      if (options.removeQuoteText) {
        // A refused quote is removed by rule, not by a model: nothing else may change.
        const without = removeQuote(article.body_html, options.removeQuoteText);
        revision = without
          ? { title: article.title, bodyHtml: without, applied: true, note: `Het citaat van ${options.requestedByName} is uit de tekst gehaald.` }
          : {
              title: article.title,
              bodyHtml: article.body_html,
              applied: false,
              note: `Het citaat van ${options.requestedByName} kon niet automatisch worden verwijderd. Een redacteur moet het uit de tekst halen.`,
            };
      } else {
        const out = await rt.ai.reviseContent({
          title: article.title,
          bodyHtml: article.body_html,
          instruction: options.instruction,
          requestedBy: options.requestedByName,
          classification: article.classification,
          brand,
        });
        revision = { ...out, bodyHtml: sanitizeHtml(out.bodyHtml) };
        if (revision.applied && revision.bodyHtml === article.body_html && revision.title === article.title) {
          revision = { ...revision, applied: false };
        }
      }

      if (!revision.applied) {
        await rt.db.from("comments").insert({
          organization_id: rt.orgId,
          entity_type: "article",
          entity_id: article.id,
          author_agent_id: rt.agent!.id,
          body: `${options.requestedByName} vroeg om een aanpassing: “${options.instruction}”\n\n${revision.note}`,
        });
        rt.step("revise", "Aanpassing niet uitgevoerd", revision.note, "generate_content", "skipped");
        return { applied: false, version: article.current_version, note: revision.note };
      }

      const version = article.current_version + 1;
      const { error: versionError } = await rt.db.from("content_versions").insert({
        organization_id: rt.orgId,
        article_id: article.id,
        version,
        title: revision.title,
        subtitle: article.subtitle,
        body_html: revision.bodyHtml,
        change_summary: `Aangepast op verzoek van ${options.requestedByName}: ${revision.note}`.slice(0, 200),
        created_by_agent_id: rt.agent!.id,
      });
      if (versionError) throw new Error(versionError.message);

      const material = await collectArticleMaterial(rt, article);
      const sensitivity = await sensitivityOf(rt, article, material.sources);
      const brandCheck = validateBrand({
        html: revision.bodyHtml,
        title: revision.title,
        wordsToAvoid: brand.wordsToAvoid,
        terminology: brand.terminology,
        classification: article.classification,
        sourceTexts: [
          ...material.sources.map((s) => `${s.title ?? ""} ${s.body}`),
          ...[material.interview, ...material.moreInterviews].flatMap((i) => i?.qa.map((q) => q.answer) ?? []),
          brand.boilerplate,
          // What the requester states about themselves counts as a source for this change.
          options.instruction,
        ],
        forbiddenNames: sensitivity.forbiddenNames,
        extraIssues: sensitivity.issues,
      });
      const { error: updateError } = await rt.db
        .from("articles")
        .update({ title: revision.title, body_html: revision.bodyHtml, current_version: version, brand_check: toJson(brandCheck) })
        .eq("id", article.id);
      if (updateError) throw new Error(updateError.message);

      rt.step("revise", "Tekst aangepast", revision.note, "generate_content");
      await rt.log({
        action: "article.revised",
        category: "generated",
        entityType: "article",
        entityId: article.id,
        summary: `“${article.title}” aangepast op verzoek van ${options.requestedByName} (versie ${version}). ${revision.note}`,
        metadata: { version, instruction: options.instruction },
        requiresApproval: true,
      });
      return { applied: true, version, note: revision.note };
    },
  );
}

/** Creates a channel variant (Slack announcement / e-mail) of an article. */
export async function createChannelVariant(
  options: BaseOptions & { articleId: string; channel: "slack" | "email" },
): Promise<{ articleId: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: original } = await db
    .from("articles")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.articleId)
    .single();
  if (!original) throw new Error("Contentitem niet gevonden.");
  const { data: internalAgent } = await db
    .from("agents")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("kind", "internal")
    .single();
  if (!internalAgent) throw new Error("Interne agent niet gevonden.");

  const label = options.channel === "slack" ? "Slack-aankondiging" : "E-mail";
  const { data: variant, error } = await db
    .from("articles")
    .insert({
      organization_id: options.organizationId,
      title: `${label}: ${original.title}`,
      excerpt: original.excerpt,
      content_type: "internal_update",
      classification: "internal",
      target_audience: "Alle medewerkers",
      channel: options.channel,
      status: "research",
      source_refs: original.source_refs,
      agent_id: internalAgent.id,
      opportunity_id: original.opportunity_id,
      interview_id: original.interview_id,
      external_permission: "not_required",
      is_demo: original.is_demo,
      created_by: options.triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (error || !variant) throw new Error(error?.message ?? "Variant kon niet worden aangemaakt.");

  const { data: links } = await db.from("article_signals").select("signal_id").eq("article_id", original.id);
  if (links?.length) {
    await db.from("article_signals").insert(
      links.map((l) => ({ article_id: variant.id, signal_id: l.signal_id, organization_id: options.organizationId })),
    );
  }
  await generateDraft({ ...options, articleId: variant.id, instructions: `Schrijf dit als ${label.toLowerCase()} op basis van “${original.title}”.` });
  return { articleId: variant.id };
}

// =============================================================================
// 5. Social posts (external agent)
// =============================================================================
const SOCIAL_VARIANTS: { key: SocialVariant; label: string }[] = [
  { key: "short", label: "Kort" },
  { key: "quote", label: "Met citaat" },
  { key: "story", label: "Verhaal" },
];

export async function generateSocialPosts(
  options: BaseOptions & { articleId: string; platforms: string[]; inNameOfProfileId?: string | null },
): Promise<{ postIds: string[]; [k: string]: unknown }> {
  return withRun(
    {
      organizationId: options.organizationId,
      agentKind: "external",
      pipeline: "social_posts",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { article_id: options.articleId, platforms: options.platforms },
    },
    async (rt) => {
      rt.use("draft_social_post");
      const { data: article } = await rt.db
        .from("articles")
        .select("*")
        .eq("organization_id", rt.orgId)
        .eq("id", options.articleId)
        .single();
      if (!article) throw new Error("Contentitem niet gevonden.");
      if (article.classification !== "external") {
        throw new Error("Social posts kunnen alleen worden gemaakt bij externe content.");
      }
      if (!article.body_html) throw new Error("Dit contentitem heeft nog geen tekst.");

      const brand = await rt.brand();
      const postIds: string[] = [];

      // A personal post is written in one colleague's name; they approve it and post it themselves.
      let person: { id: string; full_name: string } | null = null;
      if (options.inNameOfProfileId) {
        const { data } = await rt.db
          .from("profiles")
          .select("id, full_name")
          .eq("organization_id", rt.orgId)
          .eq("id", options.inNameOfProfileId)
          .maybeSingle();
        if (!data) throw new Error("Deze collega is niet gevonden.");
        person = data;
      }
      const variants: { key: SocialVariant | undefined; label: string }[] = person
        ? [{ key: undefined, label: "Persoonlijk" }]
        : SOCIAL_VARIANTS;

      for (const platform of options.platforms) {
        const seen = new Set<string>();
        const generated = await mapConcurrent(variants, async (variant) => ({
          variant,
          post: await rt.ai.generateSocialPost({
            platform,
            article: {
              title: article.title,
              excerpt: article.excerpt ?? "",
              bodyText: stripHtml(article.body_html),
              tags: article.tags ?? [],
            },
            brand,
            variant: variant.key,
            inNameOf: person?.full_name ?? null,
          }),
        }));
        for (const { variant, post } of generated) {
          // Two variants that came out the same are one variant.
          if (seen.has(post.body)) continue;
          seen.add(post.body);
          const { data: row, error } = await rt.db
            .from("social_posts")
            .insert({
              organization_id: rt.orgId,
              article_id: article.id,
              platform,
              body: post.body,
              status: "draft",
              agent_id: rt.agent!.id,
              generation_provider: rt.ai.id,
              is_demo: article.is_demo,
              created_by: options.triggeredBy ?? null,
              variant: variant.label,
              written_for_profile_id: person?.id ?? null,
            })
            .select("id")
            .single();
          if (error || !row) throw new Error(error?.message ?? "Social post kon niet worden opgeslagen.");
          postIds.push(row.id);
          rt.step("social", `Concept voor ${platform} (${variant.label})`, post.body.slice(0, 100), "draft_social_post");
        }
      }
      await rt.log({
        action: "social.drafted",
        category: "generated",
        entityType: "article",
        entityId: article.id,
        summary: `${postIds.length} social-concept(en) gemaakt bij “${article.title}”. Plaatsen kan alleen na menselijke goedkeuring.`,
        metadata: { post_ids: postIds, platforms: options.platforms },
        requiresApproval: true,
      });
      return { postIds };
    },
  );
}

// =============================================================================
// 6. Newsletters
// =============================================================================
const EXTERNAL_SECTIONS: Partial<Record<ContentType, string>> = {
  customer_case: "Klantcases",
  news_article: "Nieuws",
  website_article: "Artikelen",
  interview: "Interviews",
};
const INTERNAL_SECTIONS: Partial<Record<ContentType, string>> = {
  employee_introduction: "Nieuwe collega's",
  management_update: "Van de directie",
  interview: "Interviews",
  internal_update: "Teamnieuws",
};

export function newsletterSection(kind: AgentKind, type: ContentType): string {
  return kind === "external"
    ? (EXTERNAL_SECTIONS[type] ?? "Ontwikkelingen")
    : (INTERNAL_SECTIONS[type] ?? "Organisatienieuws");
}

export async function prepareNewsletter(
  options: BaseOptions & { kind: AgentKind; month: Date },
): Promise<{ newsletterId: string; created: boolean; itemCount: number; [k: string]: unknown }> {
  return withRun(
    {
      organizationId: options.organizationId,
      agentKind: options.kind,
      pipeline: "newsletter_preparation",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { kind: options.kind, month: format(options.month, "yyyy-MM") },
    },
    async (rt) => {
      rt.use(options.kind === "external" ? "prepare_external_newsletter" : "prepare_internal_newsletter");
      const monthStart = startOfMonth(options.month);
      const monthEnd = endOfMonth(options.month);
      const periodMonth = format(monthStart, "yyyy-MM-dd");
      const monthLabel = format(monthStart, "MMMM yyyy", { locale: nl });

      const { data: existing } = await rt.db
        .from("newsletters")
        .select("id, status")
        .eq("organization_id", rt.orgId)
        .eq("kind", options.kind)
        .eq("edition_type", "newsletter")
        .eq("period_month", periodMonth)
        .maybeSingle();

      // Candidates: approved, scheduled or published content of this kind in this month.
      const { data: candidates } = await rt.db
        .from("articles")
        .select("id, title, excerpt, content_type, status, published_at, publish_at, updated_at")
        .eq("organization_id", rt.orgId)
        .eq("classification", options.kind)
        .in("status", ["approved", "scheduled", "published"])
        .not("content_type", "in", "(newsletter,social_post)")
        .not("channel", "in", "(slack,email)")
        .order("updated_at", { ascending: false });
      const inMonth = (candidates ?? []).filter((a) => {
        const date = new Date(a.published_at ?? a.publish_at ?? a.updated_at);
        return date >= monthStart && date <= monthEnd;
      });
      rt.step("select", "Content geselecteerd", `${inMonth.length} goedgekeurd(e) of gepubliceerd(e) item(s) in ${monthLabel}`, "read_sources");

      let newsletterId = existing?.id ?? null;
      let created = false;
      if (existing && existing.status !== "draft" && existing.status !== "changes_requested") {
        rt.step("exists", "Nieuwsbrief bestaat al", "De nieuwsbrief is al ingediend of goedgekeurd en wordt niet gewijzigd.", undefined, "skipped");
        return { newsletterId: existing.id, created: false, itemCount: 0 };
      }

      const items = inMonth.map((a) => ({
        title: a.title,
        summary: a.excerpt ?? "",
        section: newsletterSection(options.kind, a.content_type),
      }));
      const framing = await rt.ai.generateNewsletterFraming({
        kind: options.kind,
        monthLabel,
        items,
        brand: await rt.brand(),
      });

      if (!newsletterId) {
        const { data: row, error } = await rt.db
          .from("newsletters")
          .insert({
            organization_id: rt.orgId,
            kind: options.kind,
            title: `${options.kind === "external" ? "Externe" : "Interne"} nieuwsbrief ${monthLabel}`,
            subject: framing.subject,
            period_month: periodMonth,
            status: "draft",
            intro_html: sanitizeHtml(framing.introHtml),
            outro_html: sanitizeHtml(framing.outroHtml),
            agent_id: rt.agent!.id,
            generation_provider: rt.ai.id,
            created_by: options.triggeredBy ?? null,
          })
          .select("id")
          .single();
        if (error || !row) throw new Error(error?.message ?? "Nieuwsbrief kon niet worden aangemaakt.");
        newsletterId = row.id;
        created = true;
      } else {
        await rt.db
          .from("newsletters")
          .update({ subject: framing.subject, intro_html: sanitizeHtml(framing.introHtml), outro_html: sanitizeHtml(framing.outroHtml), generation_provider: rt.ai.id })
          .eq("id", newsletterId);
      }

      const { data: currentItems } = await rt.db.from("newsletter_items").select("article_id").eq("newsletter_id", newsletterId);
      const present = new Set((currentItems ?? []).map((i) => i.article_id));
      const toAdd = inMonth.filter((a) => !present.has(a.id));
      if (toAdd.length > 0) {
        await rt.db.from("newsletter_items").insert(
          toAdd.map((a, i) => ({
            organization_id: rt.orgId,
            newsletter_id: newsletterId!,
            article_id: a.id,
            section: newsletterSection(options.kind, a.content_type),
            position: present.size + i,
          })),
        );
      }

      // Fixed sections of the internal newsletter (new colleagues, anniversaries, vacancies, agenda):
      // small items colleagues tipped this month, taken along as they were told.
      if (options.kind === "internal") {
        const { data: tips } = await rt.db
          .from("content_signals")
          .select("id, title, summary, entities")
          .eq("organization_id", rt.orgId)
          .not("entities->>rubric", "is", null)
          .in("status", ["new", "needs_info", "in_progress"])
          .gte("detected_at", monthStart.toISOString())
          .lte("detected_at", monthEnd.toISOString());
        const { data: titled } = await rt.db.from("newsletter_items").select("custom_title").eq("newsletter_id", newsletterId);
        const titles = new Set((titled ?? []).map((i) => i.custom_title));
        const fresh = (tips ?? []).filter((tip) => !titles.has(tip.title));
        if (fresh.length > 0) {
          await rt.db.from("newsletter_items").insert(
            fresh.map((tip, i) => ({
              organization_id: rt.orgId,
              newsletter_id: newsletterId!,
              section: String((tip.entities as { rubric?: string }).rubric),
              custom_title: tip.title,
              custom_summary: tip.summary,
              position: present.size + toAdd.length + i,
            })),
          );
          await rt.db
            .from("content_signals")
            .update({ status: "converted" })
            .in(
              "id",
              fresh.map((tip) => tip.id),
            );
          rt.step("rubrics", "Vaste rubrieken gevuld", `${fresh.length} tip(s) van collega's`, "prepare_internal_newsletter");
        }
      }

      const day = Number(fromJson<Record<string, unknown>>(rt.agent!.config, {}).newsletter_day_of_month ?? 25);
      await upsertCalendarEntry(rt.db, {
        organizationId: rt.orgId,
        entityType: "newsletter",
        entityId: newsletterId,
        entryType: "newsletter",
        title: `${options.kind === "external" ? "Externe" : "Interne"} nieuwsbrief ${monthLabel}`,
        startsAt: setHours(addDays(monthStart, Math.min(day, 28) - 1), 9).toISOString(),
        classification: options.kind,
      });

      rt.step("framing", "Inleiding en afsluiting geschreven", framing.subject, options.kind === "external" ? "prepare_external_newsletter" : "prepare_internal_newsletter");
      await rt.log({
        action: "newsletter.prepared",
        category: "generated",
        entityType: "newsletter",
        entityId: newsletterId,
        summary: `${options.kind === "external" ? "Externe" : "Interne"} nieuwsbrief voor ${monthLabel} voorbereid met ${inMonth.length} item(s). Verzenden kan alleen na menselijke goedkeuring.`,
        metadata: { items: inMonth.map((a) => a.id) },
        requiresApproval: true,
      });
      return { newsletterId, created, itemCount: inMonth.length };
    },
  );
}

/** Rewrites intro/outro/subject for the current selection of items. */
export async function regenerateNewsletterFraming(
  options: BaseOptions & { newsletterId: string },
): Promise<{ newsletterId: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: newsletter } = await db
    .from("newsletters")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.newsletterId)
    .single();
  if (!newsletter) throw new Error("Nieuwsbrief niet gevonden.");
  if (!["draft", "changes_requested"].includes(newsletter.status)) {
    throw new Error("Deze nieuwsbrief is vergrendeld. Heropen hem als concept om de tekst te vernieuwen.");
  }
  return withRun(
    {
      organizationId: options.organizationId,
      agentKind: newsletter.kind,
      pipeline: "newsletter_framing",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { newsletter_id: newsletter.id },
    },
    async (rt) => {
      rt.use(newsletter.kind === "external" ? "prepare_external_newsletter" : "prepare_internal_newsletter");
      const { data: items } = await rt.db
        .from("newsletter_items")
        .select("section, custom_title, custom_summary, included, position, article:articles(title, excerpt)")
        .eq("newsletter_id", newsletter.id)
        .eq("included", true)
        .order("position");
      const framing = await rt.ai.generateNewsletterFraming({
        kind: newsletter.kind,
        monthLabel: format(new Date(newsletter.period_month), "MMMM yyyy", { locale: nl }),
        items: (items ?? []).map((i) => ({
          title: i.custom_title ?? i.article?.title ?? "",
          summary: i.custom_summary ?? i.article?.excerpt ?? "",
          section: i.section,
        })),
        brand: await rt.brand(),
      });
      await rt.db
        .from("newsletters")
        .update({ subject: framing.subject, intro_html: sanitizeHtml(framing.introHtml), outro_html: sanitizeHtml(framing.outroHtml), generation_provider: rt.ai.id })
        .eq("id", newsletter.id);
      rt.step("framing", "Inleiding en afsluiting vernieuwd", framing.subject);
      await rt.log({
        action: "newsletter.framing_regenerated",
        category: "generated",
        entityType: "newsletter",
        entityId: newsletter.id,
        summary: `Inleiding en afsluiting van “${newsletter.title}” opnieuw geschreven.`,
      });
      return { newsletterId: newsletter.id };
    },
  );
}

// =============================================================================
// 7. Agent collaboration: external agent asks, internal agent answers
// =============================================================================
export async function requestInternalInfo(
  options: BaseOptions & { articleId: string; question: string },
): Promise<{ messageId: string; answer: string; found: boolean; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: agents } = await db.from("agents").select("id, kind, name").eq("organization_id", options.organizationId);
  const externalAgent = agents?.find((a) => a.kind === "external");
  const internalAgent = agents?.find((a) => a.kind === "internal");
  if (!externalAgent || !internalAgent) throw new Error("Agents niet gevonden.");

  const request = await withRun(
    {
      organizationId: options.organizationId,
      agentKind: "external",
      pipeline: "info_request",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { article_id: options.articleId, question: options.question },
    },
    async (rt) => {
      rt.use("request_internal_info");
      const { data: article } = await rt.db
        .from("articles")
        .select("id, title")
        .eq("organization_id", rt.orgId)
        .eq("id", options.articleId)
        .single();
      if (!article) throw new Error("Contentitem niet gevonden.");
      const { data: message, error } = await rt.db
        .from("agent_messages")
        .insert({
          organization_id: rt.orgId,
          from_agent_id: externalAgent.id,
          to_agent_id: internalAgent.id,
          type: "info_request",
          subject: `Aanvullende informatie voor “${article.title}”`,
          body: options.question,
          article_id: article.id,
        })
        .select("id")
        .single();
      if (error || !message) throw new Error(error?.message ?? "Verzoek kon niet worden opgeslagen.");
      rt.step("request", "Informatie opgevraagd bij interne agent", options.question, "request_internal_info");
      await rt.log({
        action: "agent.info_requested",
        category: "requested",
        entityType: "article",
        entityId: article.id,
        summary: `Aanvullende informatie gevraagd aan de ${internalAgent.name}: “${options.question}”`,
        metadata: { message_id: message.id },
      });
      return { messageId: message.id, articleTitle: article.title };
    },
  );

  const answer = await withRun(
    {
      organizationId: options.organizationId,
      agentKind: "internal",
      pipeline: "info_response",
      trigger: "event",
      triggeredBy: options.triggeredBy,
      input: { message_id: request.messageId },
    },
    async (rt) => {
      rt.use("answer_info_request");
      const { data: article } = await rt.db.from("articles").select("*").eq("id", options.articleId).single();
      if (!article) throw new Error("Contentitem niet gevonden.");
      const material = await collectArticleMaterial(rt, article);
      rt.step("sources", "Interne bronnen geraadpleegd", `${material.sources.length} bron(nen) binnen de toegestane systemen`, "read_sources");
      const response = await rt.ai.answerInfoRequest({
        question: options.question,
        sources: material.sources,
        organizationName: rt.organization.name,
      });
      await rt.db
        .from("agent_messages")
        .update({ status: "answered", response: response.answer, responded_at: new Date().toISOString() })
        .eq("id", request.messageId);
      await rt.db.from("comments").insert({
        organization_id: rt.orgId,
        entity_type: "article",
        entity_id: article.id,
        author_agent_id: rt.agent!.id,
        body: `Antwoord op informatieverzoek van de externe agent (“${options.question}”):\n${response.answer}`,
      });
      rt.step("answer", response.found ? "Verzoek beantwoord" : "Geen informatie gevonden", response.answer.slice(0, 140), "answer_info_request");
      await rt.log({
        action: "agent.info_answered",
        category: "handoff",
        entityType: "article",
        entityId: article.id,
        summary: response.found
          ? `Informatieverzoek van de ${externalAgent.name} beantwoord met ${material.sources.length} interne bron(nen).`
          : `Informatieverzoek van de ${externalAgent.name} kon niet worden beantwoord uit de beschikbare bronnen.`,
        metadata: { message_id: request.messageId, sources_used: material.sources.map((s) => s.id) },
      });
      return response;
    },
  );

  return { messageId: request.messageId as string, answer: answer.answer, found: answer.found };
}

// =============================================================================
// 8. Leadership interviews (internal agent, twice per month)
// =============================================================================
export async function scheduleLeadershipInterview(
  options: BaseOptions & { date?: Date },
): Promise<{ interviewId: string | null; created: boolean; reason?: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const date = options.date ?? new Date();
  const half = date.getDate() < 15 ? "eerste" : "tweede";
  const monthLabel = format(date, "MMMM yyyy", { locale: nl });
  const title = `Directie-update ${half} helft ${monthLabel}`;

  const { data: existing } = await db
    .from("interviews")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("kind", "management")
    .eq("title", title)
    .maybeSingle();
  if (existing) return { interviewId: existing.id, created: false, reason: "exists" };

  const { data: directors } = await db
    .from("profiles")
    .select("id, full_name, job_title")
    .eq("organization_id", options.organizationId)
    .eq("is_active", true)
    .ilike("job_title", "%directeur%")
    .order("created_at")
    .limit(1);
  const director = directors?.[0];
  if (!director) {
    return { interviewId: null, created: false, reason: "no_director" };
  }

  // Next working day at 10:00.
  let scheduled = setHours(addDays(date, 1), 10);
  scheduled.setMinutes(0, 0, 0);
  while (scheduled.getDay() === 0 || scheduled.getDay() === 6) scheduled = addDays(scheduled, 1);

  const { data: internalAgent } = await db
    .from("agents")
    .select("allowed_tools")
    .eq("organization_id", options.organizationId)
    .eq("kind", "internal")
    .single();
  if (!internalAgent?.allowed_tools.includes("schedule_leadership_interviews")) {
    throw new Error("De interne agent heeft geen toestemming om directie-interviews te plannen.");
  }

  const created = await createInterview({
    ...options,
    agentKind: "internal",
    title,
    purpose: "De belangrijkste ontwikkelingen van de afgelopen twee weken vertalen naar een update voor alle collega's",
    kind: "management",
    classification: "internal",
    intervieweeProfileId: director.id,
    intervieweeName: director.full_name,
    intervieweeRole: director.job_title,
    scheduledAt: scheduled.toISOString(),
    questionCount: 5,
  });
  return { interviewId: created.interviewId, created: true };
}

/** Turns a completed interview into a new content item with a first draft. */
export async function convertInterviewToDraft(
  options: BaseOptions & { interviewId: string; contentType: ContentType; channel?: string | null },
): Promise<{ articleId: string; [k: string]: unknown }> {
  const db = createAdminClient();
  const { data: interview } = await db
    .from("interviews")
    .select("*")
    .eq("organization_id", options.organizationId)
    .eq("id", options.interviewId)
    .single();
  if (!interview) throw new Error("Interview niet gevonden.");

  let articleId = interview.article_id;
  if (articleId) {
    const { data: linked } = await db.from("articles").select("status").eq("id", articleId).single();
    if (linked && ["in_review", "approved", "scheduled", "published", "archived"].includes(linked.status)) articleId = null;
  }

  if (!articleId) {
    const classification = interview.classification;
    const { data: article, error } = await db
      .from("articles")
      .insert({
        organization_id: options.organizationId,
        title:
          options.contentType === "employee_introduction"
            ? `Even voorstellen: ${interview.interviewee_name}`
            : options.contentType === "management_update"
              ? interview.title
              : `${CONTENT_TYPE_LABELS[options.contentType]}: ${interview.title}`,
        excerpt: interview.purpose,
        content_type: options.contentType,
        classification,
        target_audience: classification === "external" ? "Klanten en relaties" : "Alle medewerkers",
        channel: options.channel ?? defaultChannel(options.contentType, classification),
        status: "interview_completed",
        agent_id: interview.agent_id,
        opportunity_id: interview.opportunity_id,
        interview_id: interview.id,
        external_permission: (classification === "external" ? "unknown" : "not_required") satisfies ExternalPermission,
        is_demo: interview.is_demo,
        created_by: options.triggeredBy ?? null,
      })
      .select("id")
      .single();
    if (error || !article) throw new Error(error?.message ?? "Contentitem kon niet worden aangemaakt.");
    articleId = article.id;
    if (!interview.article_id) {
      await db.from("interviews").update({ article_id: articleId }).eq("id", interview.id);
    }
  }

  await generateDraft({ ...options, articleId });
  return { articleId };
}
