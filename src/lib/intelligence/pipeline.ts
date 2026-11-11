import { subDays } from "date-fns";
import "server-only";
import { evaluateSignal } from "@/lib/agents/pipelines";
import { AgentPausedError, toSourceMaterial, withRun } from "@/lib/agents/runtime";
import { fromJson, toJson } from "@/lib/json";
import type { SignalEntities } from "@/lib/types";

/**
 * Shared intelligence layer.
 *
 *   retrieval → signal detection → context enrichment (related sources,
 *   related signals, duplicate detection) → hand-over to the suggested agent
 *   for story evaluation.
 *
 * Runs without an agent identity: it only reads sources and writes signals.
 */

const STOPWORDS = new Set(
  "de het een en van voor met op in is zijn was te aan dat die dit er om bij ook als naar door over uit nog maar wel niet we wij ons onze je jij ik hun heeft hebben wordt worden kan na per tot dan zo al".split(
    " ",
  ),
);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return overlap / (a.size + b.size - overlap);
}

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export type ProcessResult = {
  processed: number;
  signalIds: string[];
  duplicateSignalIds: string[];
  skipped: number;
  opportunityIds: string[];
  [key: string]: unknown;
};

export async function processSourceMessages(options: {
  organizationId: string;
  messageIds?: string[];
  trigger: "manual" | "schedule" | "event" | "demo";
  triggeredBy?: string | null;
  /** Let the suggested agent evaluate new signals right away. */
  autoEvaluate?: boolean;
}): Promise<ProcessResult> {
  const result = await withRun<ProcessResult>(
    {
      organizationId: options.organizationId,
      agentKind: null,
      pipeline: "intelligence",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { message_ids: options.messageIds ?? "unprocessed" },
    },
    async (rt) => {
      // 1. Information retrieval -------------------------------------------------
      rt.use("read_sources");
      let query = rt.db
        .from("source_messages")
        .select("*")
        .eq("organization_id", rt.orgId)
        .order("occurred_at", { ascending: true })
        .limit(25);
      query = options.messageIds?.length ? query.in("id", options.messageIds) : query.is("processed_at", null);
      const { data: messages, error } = await query;
      if (error) throw new Error(error.message);
      rt.step("retrieval", "Bronberichten opgehaald", `${messages?.length ?? 0} bericht(en)`, "read_sources");

      const out: ProcessResult = { processed: 0, signalIds: [], duplicateSignalIds: [], skipped: 0, opportunityIds: [] };
      if (!messages || messages.length === 0) return out;

      const [{ data: people }, { data: recentSignals }] = await Promise.all([
        rt.db.from("profiles").select("full_name").eq("organization_id", rt.orgId).eq("is_active", true),
        rt.db
          .from("content_signals")
          .select("id, title, summary, category, entities, related_signal_ids, status")
          .eq("organization_id", rt.orgId)
          .neq("status", "duplicate")
          .gte("detected_at", subDays(new Date(), 90).toISOString()),
      ]);
      const knownPeople = (people ?? []).map((p) => p.full_name);
      const known = (recentSignals ?? []).map((s) => ({
        ...s,
        entities: fromJson<SignalEntities>(s.entities, {}),
        tokens: tokens(`${s.title} ${s.summary}`),
      }));

      const channelIds = Array.from(new Set(messages.map((m) => m.channel_id).filter((id): id is string => Boolean(id))));
      const { data: channels } = channelIds.length
        ? await rt.db.from("channels").select("id, project_id").in("id", channelIds)
        : { data: [] as { id: string; project_id: string | null }[] };
      const projectOfChannel = new Map((channels ?? []).map((c) => [c.id, c.project_id]));

      for (const message of messages) {
        // A message marked "do not use" is never analysed.
        if (message.excluded) {
          await rt.db.from("source_messages").update({ processed_at: new Date().toISOString() }).eq("id", message.id);
          out.skipped++;
          continue;
        }
        // 2. Signal detection ----------------------------------------------------
        rt.use("detect_signals");
        const analysis = await rt.ai.analyzeMessage({
          message: toSourceMaterial(message),
          organizationName: rt.organization.name,
          knownPeople,
        });
        await rt.db.from("source_messages").update({ processed_at: new Date().toISOString() }).eq("id", message.id);
        out.processed++;

        if (!analysis.newsworthy) {
          out.skipped++;
          rt.step("detect", "Geen signaal", `“${message.title ?? message.body.slice(0, 60)}” is niet nieuwswaardig`, "detect_signals", "skipped");
          continue;
        }

        // 3. Context enrichment: duplicates and related signals --------------------
        rt.use("enrich_context");
        const messageTokens = tokens(`${analysis.title} ${analysis.summary}`);
        let duplicateOf: (typeof known)[number] | null = null;
        const related: string[] = [];
        for (const signal of known) {
          const sameCustomer = same(signal.entities.customer, analysis.entities.customer);
          const sameProject = same(signal.entities.project, analysis.entities.project);
          const similarity = jaccard(messageTokens, signal.tokens);
          const isDuplicate =
            similarity >= 0.6 ||
            (sameCustomer && signal.category === analysis.category && (sameProject || similarity >= 0.3));
          if (isDuplicate && !duplicateOf) duplicateOf = signal;
          else if (sameCustomer || sameProject || similarity >= 0.3) related.push(signal.id);
        }

        const needsInfo = analysis.missingInformation.length >= 2;
        const { data: signal, error: insertError } = await rt.db
          .from("content_signals")
          .insert({
            organization_id: rt.orgId,
            title: analysis.title,
            summary: analysis.summary,
            category: analysis.category,
            audience: analysis.audience,
            suggested_agent: analysis.suggestedAgent,
            relevance_score: analysis.relevanceScore,
            score_rationale: analysis.scoreRationale,
            status: duplicateOf ? "duplicate" : needsInfo ? "needs_info" : "new",
            missing_information: toJson(analysis.missingInformation),
            suggested_action: duplicateOf
              ? "Samengevoegd met een bestaand signaal; de bron is daar als context toegevoegd."
              : analysis.suggestedAction,
            entities: toJson(analysis.entities),
            confidentiality: analysis.confidentiality,
            duplicate_of_id: duplicateOf?.id ?? null,
            related_signal_ids: related,
            primary_source_id: message.id,
            submitted_by: message.source === "manual" ? message.author_profile_id : null,
            detection_provider: rt.ai.id,
            is_demo: message.is_demo,
            detected_at: new Date().toISOString(),
            origin: message.source === "manual" ? "tip" : message.source === "email" ? "mail" : "listen",
            project_id: message.channel_id ? (projectOfChannel.get(message.channel_id) ?? null) : null,
          })
          .select("id")
          .single();
        if (insertError || !signal) throw new Error(insertError?.message ?? "Signaal kon niet worden opgeslagen.");

        await rt.db.from("signal_sources").insert({
          signal_id: signal.id,
          source_message_id: message.id,
          organization_id: rt.orgId,
          relation: "primary",
        });

        if (duplicateOf) {
          // Keep the information: attach the new source to the original signal.
          await rt.db.from("signal_sources").upsert(
            { signal_id: duplicateOf.id, source_message_id: message.id, organization_id: rt.orgId, relation: "related" },
            { onConflict: "signal_id,source_message_id" },
          );
          out.duplicateSignalIds.push(signal.id);
          rt.step("dedupe", "Duplicaat herkend", `“${analysis.title}” hoort bij “${duplicateOf.title}”`, "enrich_context");
          await rt.log({
            action: "signal.duplicate",
            category: "discovered",
            entityType: "signal",
            entityId: signal.id,
            summary: `Dubbel signaal herkend: “${analysis.title}” is samengevoegd met “${duplicateOf.title}”.`,
            metadata: { duplicate_of: duplicateOf.id, source: message.source },
          });
          continue;
        }

        // Related source messages from other systems (same customer / project).
        const needles = [analysis.entities.customer, analysis.entities.project].filter(
          (n): n is string => Boolean(n && n.length > 3),
        );
        let relatedSources = 0;
        if (needles.length > 0) {
          const { data: candidates } = await rt.db
            .from("source_messages")
            .select("id, title, body, source")
            .eq("organization_id", rt.orgId)
            .neq("id", message.id)
            .gte("occurred_at", subDays(new Date(message.occurred_at), 60).toISOString())
            .order("occurred_at", { ascending: false })
            .limit(200);
          const hits = (candidates ?? [])
            .filter((c) => {
              const haystack = `${c.title ?? ""} ${c.body}`.toLowerCase();
              return needles.some((n) => haystack.includes(n.toLowerCase()));
            })
            .slice(0, 6);
          if (hits.length > 0) {
            await rt.db.from("signal_sources").upsert(
              hits.map((h) => ({
                signal_id: signal.id,
                source_message_id: h.id,
                organization_id: rt.orgId,
                relation: "related",
              })),
              { onConflict: "signal_id,source_message_id" },
            );
            relatedSources = hits.length;
          }
        }

        // Link related signals in both directions.
        for (const relatedId of related) {
          const other = known.find((k) => k.id === relatedId);
          if (!other) continue;
          const merged = Array.from(new Set([...(other.related_signal_ids ?? []), signal.id]));
          await rt.db.from("content_signals").update({ related_signal_ids: merged }).eq("id", relatedId);
        }

        known.push({
          id: signal.id,
          title: analysis.title,
          summary: analysis.summary,
          category: analysis.category,
          entities: analysis.entities,
          related_signal_ids: related,
          status: needsInfo ? "needs_info" : "new",
          tokens: messageTokens,
        });
        out.signalIds.push(signal.id);

        rt.step(
          "detect",
          "Signaal gedetecteerd",
          `“${analysis.title}” - relevantie ${analysis.relevanceScore}, ${relatedSources} gerelateerde bron(nen), ${related.length} gerelateerd(e) signaal/signalen`,
          "detect_signals",
        );
        await rt.log({
          action: "signal.detected",
          category: "discovered",
          entityType: "signal",
          entityId: signal.id,
          summary: `Nieuw signaal uit ${sourceName(message.source)}${message.channel ? ` (${message.channel})` : ""}: “${analysis.title}” (relevantie ${analysis.relevanceScore}).`,
          metadata: {
            source: message.source,
            source_message_id: message.id,
            related_sources: relatedSources,
            related_signals: related.length,
            missing_information: analysis.missingInformation,
          },
        });
      }

      return out;
    },
  );

  // 4. Hand-over: the suggested agent evaluates each new signal (own run each).
  if (options.autoEvaluate) {
    for (const signalId of result.signalIds) {
      try {
        const evaluation = await evaluateSignal({
          organizationId: options.organizationId,
          signalId,
          trigger: options.trigger === "manual" ? "event" : options.trigger,
          triggeredBy: options.triggeredBy,
          onlyIfRelevant: true,
        });
        if (evaluation.opportunityId) result.opportunityIds.push(evaluation.opportunityId);
        if (evaluation.externalOpportunityId) result.opportunityIds.push(evaluation.externalOpportunityId);
      } catch (error) {
        if (!(error instanceof AgentPausedError)) console.error("[intelligence] evaluation failed", error);
      }
    }
  }

  return result;
}

function sourceName(source: string): string {
  return (
    { slack: "Slack", jira: "Jira", teamleader: "Teamleader Orbit", email: "e-mail", manual: "een handmatige inzending" }[
      source
    ] ?? source
  );
}
