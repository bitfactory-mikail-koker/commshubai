import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SCENARIO_MESSAGE } from "@/lib/demo/feed";
import type { ContentStatus } from "@/lib/types";

type Db = SupabaseClient<Database>;

export type ScenarioState = {
  message: { id: string; body: string; channel: string | null; author: string | null; occurredAt: string } | null;
  signal: { id: string; title: string; relevance: number; status: string; relatedSources: number } | null;
  opportunity: { id: string; title: string; status: string; externalPermission: string } | null;
  article: {
    id: string;
    title: string;
    status: ContentStatus;
    version: number;
    externalPermission: string;
    publishAt: string | null;
  } | null;
  interview: { id: string; status: string; interviewee: string } | null;
  /** Index of the first step that is not done yet (0-based); 8 = all done. */
  currentStep: number;
};

/**
 * Derives the state of the guided demo scenario from the real records it
 * created, so the page always reflects what actually happened.
 */
export async function getScenarioState(db: Db, organizationId: string): Promise<ScenarioState> {
  const state: ScenarioState = { message: null, signal: null, opportunity: null, article: null, interview: null, currentStep: 0 };

  const { data: message } = await db
    .from("source_messages")
    .select("id, body, channel, author_name, occurred_at")
    .eq("organization_id", organizationId)
    .eq("external_id", SCENARIO_MESSAGE.externalId)
    .maybeSingle();
  if (!message) return state;
  state.message = { id: message.id, body: message.body, channel: message.channel, author: message.author_name, occurredAt: message.occurred_at };
  state.currentStep = 1;

  const { data: signal } = await db
    .from("content_signals")
    .select("id, title, relevance_score, status")
    .eq("organization_id", organizationId)
    .eq("primary_source_id", message.id)
    .maybeSingle();
  if (!signal) return state;
  const { count } = await db
    .from("signal_sources")
    .select("source_message_id", { count: "exact", head: true })
    .eq("signal_id", signal.id)
    .eq("relation", "related");
  state.signal = { id: signal.id, title: signal.title, relevance: signal.relevance_score, status: signal.status, relatedSources: count ?? 0 };
  state.currentStep = 2;

  const { data: opportunity } = await db
    .from("content_opportunities")
    .select("id, title, status, external_permission, article_id")
    .eq("organization_id", organizationId)
    .eq("signal_id", signal.id)
    .eq("classification", "external")
    .maybeSingle();
  if (!opportunity) return state;
  state.opportunity = { id: opportunity.id, title: opportunity.title, status: opportunity.status, externalPermission: opportunity.external_permission };
  state.currentStep = 3;

  if (!opportunity.article_id) return state;
  const { data: article } = await db
    .from("articles")
    .select("id, title, status, current_version, external_permission, publish_at")
    .eq("id", opportunity.article_id)
    .maybeSingle();
  if (!article) return state;
  state.article = {
    id: article.id,
    title: article.title,
    status: article.status,
    version: article.current_version,
    externalPermission: article.external_permission,
    publishAt: article.publish_at,
  };

  const { data: interview } = await db
    .from("interviews")
    .select("id, status, interviewee_name")
    .eq("organization_id", organizationId)
    .eq("article_id", article.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!interview) return state;
  state.interview = { id: interview.id, status: interview.status, interviewee: interview.interviewee_name };
  state.currentStep = 4;

  if (interview.status !== "completed") return state;
  state.currentStep = 5;
  if (article.current_version < 1) return state;
  state.currentStep = 6;
  if (!["approved", "scheduled", "published"].includes(article.status)) return state;
  state.currentStep = 7;
  if (!["scheduled", "published"].includes(article.status)) return state;
  state.currentStep = 8;
  return state;
}
