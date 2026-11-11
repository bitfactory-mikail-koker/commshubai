import "server-only";
import { chunk } from "@/lib/concurrency";
import type { AdminClient } from "@/lib/supabase/admin";

export const RETENTION_CHUNK = 100;
export const RETENTION_MAX_ROWS = 1000;

export class RetentionError extends Error {
  constructor(step: string, detail: string) {
    super(`Opruimen mislukt bij ${step}: ${detail}`);
    this.name = "RetentionError";
  }
}

type Reply<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function selectChunked<T>(step: string, ids: readonly string[], run: (ids: string[]) => Reply<T>): Promise<T[]> {
  const replies = await Promise.all(chunk(ids, RETENTION_CHUNK).map((part) => run(part)));
  return replies.flatMap((reply) => {
    if (reply.error) throw new RetentionError(step, reply.error.message);
    const rows = reply.data ?? [];
    if (rows.length >= RETENTION_MAX_ROWS) throw new RetentionError(step, "te veel rijen voor een betrouwbare controle");
    return rows;
  });
}

export type RemovedSignal = { id: string; primary_source_id: string | null };

export async function removeUnlinkedSignals(db: AdminClient, signalIds: readonly string[]): Promise<RemovedSignal[]> {
  if (signalIds.length === 0) return [];
  const linked = await selectChunked("de controle op stukken", signalIds, (part) =>
    db.from("article_signals").select("signal_id").in("signal_id", part),
  );
  const inPieces = new Set(linked.map((row) => row.signal_id));
  const removable = signalIds.filter((id) => !inPieces.has(id));

  const removed: RemovedSignal[] = [];
  for (const part of chunk(removable, RETENTION_CHUNK)) {
    const proposals = await db.from("content_opportunities").delete().in("signal_id", part).is("article_id", null);
    if (proposals.error) throw new RetentionError("het verwijderen van voorstellen", proposals.error.message);
    const signals = await db.from("content_signals").delete().in("id", part).select("id, primary_source_id");
    if (signals.error) throw new RetentionError("het verwijderen van signalen", signals.error.message);
    removed.push(...(signals.data ?? []));
  }
  return removed;
}

export async function removeOrphanedSources(db: AdminClient, sourceIds: readonly string[]): Promise<number> {
  if (sourceIds.length === 0) return 0;
  const stillUsed = await selectChunked("de controle op bronberichten", sourceIds, (part) =>
    db.from("signal_sources").select("source_message_id").in("source_message_id", part),
  );
  const used = new Set(stillUsed.map((row) => row.source_message_id));
  const orphaned = sourceIds.filter((id) => !used.has(id));
  for (const part of chunk(orphaned, RETENTION_CHUNK)) {
    const result = await db.from("source_messages").delete().in("id", part);
    if (result.error) throw new RetentionError("het verwijderen van bronberichten", result.error.message);
  }
  return orphaned.length;
}
