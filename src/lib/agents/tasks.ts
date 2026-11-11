import "server-only";
import { format } from "date-fns";
import {
  evaluateSignal,
  generateDraft,
  generateSocialPosts,
  prepareNewsletter,
  scheduleLeadershipInterview,
} from "@/lib/agents/pipelines";
import { AgentPausedError } from "@/lib/agents/runtime";
import { logSystemAction } from "@/lib/audit";
import { syncIntegration } from "@/lib/integrations/service";
import { processSourceMessages } from "@/lib/intelligence/pipeline";
import { fromJson, toJson } from "@/lib/json";
import { publishArticle } from "@/lib/publication";
import { processApprovalDeadlines } from "@/lib/redactie/approval-flow";
import { deliverScheduledMessages } from "@/lib/redactie/bot";
import { processInterviewReminders } from "@/lib/redactie/interview-flow";
import { runDueRhythms } from "@/lib/redactie/rhythms";
import { redactieSettings } from "@/lib/redactie/settings";
import { wakeSnoozedTopics } from "@/lib/redactie/topics";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentKind, AgentTask, IntegrationProvider } from "@/lib/types";

/**
 * Background jobs.
 *
 * agent_tasks is the queue. `runDueJobs` is called by /api/jobs/tick (cron)
 * and by "Nu uitvoeren" in the UI. It:
 *   1. schedules recurring work (dedupe_key makes this idempotent),
 *   2. runs the fixed rhythms that are due, sends reminders, handles deadlines
 *      and delivers bot messages that were held back until office hours,
 *   3. publishes content whose scheduled time has passed (already approved),
 *   4. runs queued tasks that are due.
 */

export type TaskType =
  | "process_messages"
  | "evaluate_signal"
  | "generate_draft"
  | "generate_social_posts"
  | "prepare_newsletter"
  | "leadership_interview"
  | "sync_integration"
  | "publish_scheduled";

export async function enqueueTask(input: {
  organizationId: string;
  type: TaskType;
  title: string;
  agentKind?: AgentKind | null;
  payload?: Record<string, unknown>;
  scheduledFor?: Date;
  dedupeKey?: string;
  createdBy?: string | null;
  relatedEntityType?: string;
  relatedEntityId?: string;
}): Promise<string | null> {
  const db = createAdminClient();
  let agentId: string | null = null;
  if (input.agentKind) {
    const { data } = await db
      .from("agents")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("kind", input.agentKind)
      .maybeSingle();
    agentId = data?.id ?? null;
  }
  const { data, error } = await db
    .from("agent_tasks")
    .upsert(
      {
        organization_id: input.organizationId,
        agent_id: agentId,
        type: input.type,
        title: input.title,
        payload: toJson(input.payload ?? {}),
        scheduled_for: (input.scheduledFor ?? new Date()).toISOString(),
        dedupe_key: input.dedupeKey ?? null,
        created_by: input.createdBy ?? null,
        related_entity_type: input.relatedEntityType ?? null,
        related_entity_id: input.relatedEntityId ?? null,
      },
      { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  return data?.[0]?.id ?? null;
}

async function execute(task: AgentTask): Promise<Record<string, unknown>> {
  const payload = fromJson<Record<string, unknown>>(task.payload, {});
  const base = { organizationId: task.organization_id, trigger: "schedule" as const, triggeredBy: task.created_by };
  switch (task.type as TaskType) {
    case "process_messages":
      return processSourceMessages({ ...base, autoEvaluate: true });
    case "evaluate_signal":
      return evaluateSignal({ ...base, signalId: String(payload.signal_id) });
    case "generate_draft":
      return generateDraft({ ...base, articleId: String(payload.article_id) });
    case "generate_social_posts":
      return generateSocialPosts({ ...base, articleId: String(payload.article_id), platforms: ["linkedin"] });
    case "prepare_newsletter":
      return prepareNewsletter({
        ...base,
        kind: payload.kind === "external" ? "external" : "internal",
        month: payload.month ? new Date(String(payload.month)) : new Date(),
      });
    case "leadership_interview":
      return scheduleLeadershipInterview(base);
    case "sync_integration":
      return syncIntegration({
        organizationId: task.organization_id,
        provider: String(payload.provider) as IntegrationProvider,
        trigger: "schedule",
      });
    case "publish_scheduled":
      return publishDueContent(task.organization_id);
    default:
      throw new Error(`Onbekend taaktype: ${task.type}`);
  }
}

export async function runTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  // Claim the task: only one worker moves it from queued to running.
  const { data: task } = await db
    .from("agent_tasks")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (!task) return { ok: false, error: "Taak is al opgepakt of bestaat niet." };

  const attempts = task.attempts + 1;
  try {
    const result = await execute(task);
    await db
      .from("agent_tasks")
      .update({ status: "completed", result: toJson(result), attempts, completed_at: new Date().toISOString(), error: null })
      .eq("id", task.id);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A paused agent is not a failure: leave the task queued for later.
    const paused = error instanceof AgentPausedError;
    const retry = !paused && attempts < task.max_attempts;
    await db
      .from("agent_tasks")
      .update({
        status: paused || retry ? "queued" : "failed",
        attempts: paused ? task.attempts : attempts,
        error: message,
        // Exponential backoff: 5, 20, 80 minutes.
        scheduled_for: new Date(Date.now() + (paused ? 60 : 5 * 4 ** (attempts - 1)) * 60_000).toISOString(),
      })
      .eq("id", task.id);
    return { ok: false, error: message };
  }
}

/** Publishes scheduled, already-approved content whose time has come. */
export async function publishDueContent(organizationId: string): Promise<{ articles: number; socialPosts: number; newsletters: number; errors: string[] }> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const errors: string[] = [];
  let articles = 0;
  let socialPosts = 0;
  let newsletters = 0;

  const { data: dueArticles } = await db
    .from("articles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "scheduled")
    .lte("publish_at", now);
  for (const article of dueArticles ?? []) {
    try {
      const result = await publishArticle(db, article);
      articles++;
      await logSystemAction(db, {
        organizationId,
        action: "article.published",
        category: "performed",
        entityType: "article",
        entityId: article.id,
        summary: `Geplande publicatie uitgevoerd: “${article.title}”. ${result.detail}`,
        metadata: { mode: result.mode, scheduled_for: article.publish_at },
      });
    } catch (error) {
      errors.push(`${article.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const { data: duePosts } = await db
    .from("social_posts")
    .select("id, platform")
    .eq("organization_id", organizationId)
    .eq("status", "scheduled")
    .lte("publish_at", now);
  for (const post of duePosts ?? []) {
    // No LinkedIn connector in this MVP: mark as published (simulated).
    const { error } = await db.from("social_posts").update({ status: "published", publication_mode: "simulated" }).eq("id", post.id);
    if (error) errors.push(error.message);
    else {
      socialPosts++;
      await db.from("content_calendar").update({ status: "done" }).eq("entity_type", "social_post").eq("entity_id", post.id);
      await logSystemAction(db, {
        organizationId,
        action: "social.published",
        entityType: "social_post",
        entityId: post.id,
        summary: `Geplande social post (${post.platform}) gemarkeerd als geplaatst - gesimuleerd, er is geen LinkedIn-koppeling.`,
        metadata: { mode: "simulated" },
      });
    }
  }

  const { data: dueNewsletters } = await db
    .from("newsletters")
    .select("id, title")
    .eq("organization_id", organizationId)
    .eq("status", "scheduled")
    .lte("send_at", now);
  for (const newsletter of dueNewsletters ?? []) {
    // No e-mail connector in this MVP: mark as sent (simulated). The database
    // still requires the human approval record.
    const { error } = await db.from("newsletters").update({ status: "sent", send_mode: "simulated" }).eq("id", newsletter.id);
    if (error) errors.push(error.message);
    else {
      newsletters++;
      await db.from("content_calendar").update({ status: "done" }).eq("entity_type", "newsletter").eq("entity_id", newsletter.id);
      await logSystemAction(db, {
        organizationId,
        action: "newsletter.sent",
        entityType: "newsletter",
        entityId: newsletter.id,
        summary: `Geplande verzending van “${newsletter.title}” gemarkeerd als verzonden - gesimuleerd, er is geen e-mailkoppeling.`,
        metadata: { mode: "simulated" },
      });
    }
  }

  return { articles, socialPosts, newsletters, errors };
}

/**
 * Data retention: after the organization's retention period the content of a
 * source message is removed. The reference itself (system, channel, timestamp)
 * is kept so signals and articles stay traceable.
 */
export async function applyRetention(organizationId: string): Promise<number> {
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("settings").eq("id", organizationId).single();
  const days = Number(fromJson<Record<string, unknown>>(org?.settings, {}).retention_days ?? 0);
  if (!Number.isFinite(days) || days < 30) return 0;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await db
    .from("source_messages")
    .update({
      body: "[Inhoud verwijderd volgens de bewaartermijn]",
      title: null,
      author_name: null,
      author_profile_id: null,
      url: null,
      metadata: toJson({ redacted: true }),
    })
    .eq("organization_id", organizationId)
    .lt("occurred_at", cutoff)
    .not("metadata", "cs", '{"redacted":true}')
    .select("id");
  if (error) throw new Error(error.message);
  if (data && data.length > 0) {
    await logSystemAction(db, {
      organizationId,
      action: "retention.applied",
      summary: `Bewaartermijn toegepast: de inhoud van ${data.length} bronbericht(en) ouder dan ${days} dagen is verwijderd.`,
    });
  }
  return data?.length ?? 0;
}

/**
 * Signals that led nowhere are deleted after the retention period, together
 * with the message they came from when nothing else uses it.
 */
export async function applySignalRetention(organizationId: string, now = new Date()): Promise<number> {
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("settings").eq("id", organizationId).single();
  const months = redactieSettings(org?.settings).signalRetentionMonths;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);

  const { data: old } = await db
    .from("content_signals")
    .select("id, primary_source_id")
    .eq("organization_id", organizationId)
    .in("status", ["new", "needs_info", "dismissed", "duplicate"])
    .lt("detected_at", cutoff.toISOString())
    .limit(500);
  let removed = 0;
  for (const signal of old ?? []) {
    const { count: articles } = await db.from("article_signals").select("article_id", { count: "exact", head: true }).eq("signal_id", signal.id);
    if ((articles ?? 0) > 0) continue;
    await db.from("content_opportunities").delete().eq("signal_id", signal.id).is("article_id", null);
    const { error } = await db.from("content_signals").delete().eq("id", signal.id);
    if (error) continue;
    removed++;
    if (signal.primary_source_id) {
      const { count: others } = await db
        .from("signal_sources")
        .select("signal_id", { count: "exact", head: true })
        .eq("source_message_id", signal.primary_source_id);
      if (!others) await db.from("source_messages").delete().eq("id", signal.primary_source_id);
    }
  }
  if (removed > 0) {
    await logSystemAction(db, {
      organizationId,
      action: "retention.signals",
      summary: `Bewaartermijn toegepast: ${removed} signaal/signalen van ouder dan ${months} maanden die nergens toe leidden zijn verwijderd.`,
    });
  }
  return removed;
}

/** Idempotently schedules the recurring work for one organization. */
export async function ensureRecurringTasks(organizationId: string, now = new Date()): Promise<void> {
  const db = createAdminClient();
  const month = format(now, "yyyy-MM");
  const { data: agents } = await db.from("agents").select("kind, status, config").eq("organization_id", organizationId);

  // The newsletters, the team round and the MD-update are scheduled by the fixed
  // rhythms (see lib/redactie/rhythms), which the administrator configures.
  void agents;
  void month;

  const hour = format(now, "yyyy-MM-dd-HH");
  const { count } = await db
    .from("source_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("processed_at", null);
  if ((count ?? 0) > 0) {
    await enqueueTask({
      organizationId,
      type: "process_messages",
      title: "Nieuwe bronberichten analyseren",
      dedupeKey: `process:${hour}`,
    });
  }

  const { data: connected } = await db
    .from("integrations")
    .select("provider")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .in("provider", ["slack", "jira"]);
  for (const integration of connected ?? []) {
    await enqueueTask({
      organizationId,
      type: "sync_integration",
      title: `Synchronisatie ${integration.provider}`,
      payload: { provider: integration.provider },
      dedupeKey: `sync:${integration.provider}:${hour}`,
    });
  }
}

export type TickResult = {
  organizations: number;
  tasksRun: number;
  tasksFailed: number;
  published: { articles: number; socialPosts: number; newsletters: number };
  errors: string[];
};

export async function runDueJobs(options: { organizationId?: string; maxTasks?: number } = {}): Promise<TickResult> {
  const db = createAdminClient();
  const result: TickResult = {
    organizations: 0,
    tasksRun: 0,
    tasksFailed: 0,
    published: { articles: 0, socialPosts: 0, newsletters: 0 },
    errors: [],
  };

  let orgQuery = db.from("organizations").select("id");
  if (options.organizationId) orgQuery = orgQuery.eq("id", options.organizationId);
  const { data: organizations } = await orgQuery;

  for (const org of organizations ?? []) {
    result.organizations++;
    try {
      await ensureRecurringTasks(org.id);
      await applyRetention(org.id);
      await applySignalRetention(org.id);
      await wakeSnoozedTopics(org.id);
      const rhythms = await runDueRhythms(org.id);
      result.errors.push(...rhythms.errors);
      await processApprovalDeadlines(org.id);
      await processInterviewReminders(org.id);
      await deliverScheduledMessages(org.id);
      const published = await publishDueContent(org.id);
      result.published.articles += published.articles;
      result.published.socialPosts += published.socialPosts;
      result.published.newsletters += published.newsletters;
      result.errors.push(...published.errors);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  let taskQuery = db
    .from("agent_tasks")
    .select("id")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .order("priority", { ascending: false })
    .order("scheduled_for", { ascending: true })
    .limit(options.maxTasks ?? 10);
  if (options.organizationId) taskQuery = taskQuery.eq("organization_id", options.organizationId);
  const { data: due } = await taskQuery;

  for (const task of due ?? []) {
    const outcome = await runTask(task.id);
    if (outcome.ok) result.tasksRun++;
    else {
      result.tasksFailed++;
      if (outcome.error) result.errors.push(outcome.error);
    }
  }
  return result;
}
