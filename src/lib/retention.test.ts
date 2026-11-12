import { describe, expect, it } from "vitest";
import { removeOrphanedSources, removeUnlinkedSignals, RETENTION_CHUNK, RetentionError } from "@/lib/retention";
import type { AdminClient } from "@/lib/supabase/admin";

type Reply = { data: unknown; error: { message: string } | null };

function fakeDb(respond: (table: string, calls: string[]) => Reply) {
  const log: string[] = [];
  const builder = (table: string, calls: string[] = []): unknown =>
    new Proxy(
      {},
      {
        get(_target, property: string) {
          if (property === "then") {
            log.push(`${table}.${calls.join(".")}`);
            const reply = respond(table, calls);
            return (resolve: (value: Reply) => void) => resolve(reply);
          }
          return () => builder(table, [...calls, property]);
        },
      },
    );
  return { db: { from: (table: string) => builder(table) } as unknown as AdminClient, log };
}

const ids = (count: number) => Array.from({ length: count }, (_, index) => `signal-${index}`);

describe("removeUnlinkedSignals", () => {
  it("deletes nothing when the check for linked pieces fails", async () => {
    const { db, log } = fakeDb((table) =>
      table === "article_signals" ? { data: null, error: { message: "URI too long" } } : { data: [], error: null },
    );
    await expect(removeUnlinkedSignals(db, ids(5))).rejects.toBeInstanceOf(RetentionError);
    expect(log.some((entry) => entry.includes("delete"))).toBe(false);
  });

  it("deletes nothing when the check could be truncated", async () => {
    const rows = Array.from({ length: 1000 }, (_, index) => ({ signal_id: `signal-${index}` }));
    const { db, log } = fakeDb((table) => (table === "article_signals" ? { data: rows, error: null } : { data: [], error: null }));
    await expect(removeUnlinkedSignals(db, ids(5))).rejects.toThrow(/te veel rijen/);
    expect(log.some((entry) => entry.includes("delete"))).toBe(false);
  });

  it("keeps signals that belong to a piece and removes the rest", async () => {
    const deletedIds: string[] = [];
    const { db } = fakeDb((table, calls) => {
      if (table === "article_signals") return { data: [{ signal_id: "signal-1" }], error: null };
      if (table === "content_signals" && calls.includes("delete")) {
        deletedIds.push("batch");
        return { data: [{ id: "signal-0", primary_source_id: "message-0" }, { id: "signal-2", primary_source_id: null }], error: null };
      }
      return { data: [], error: null };
    });
    const removed = await removeUnlinkedSignals(db, ids(3));
    expect(removed.map((signal) => signal.id)).toEqual(["signal-0", "signal-2"]);
    expect(deletedIds).toHaveLength(1);
  });

  it("stops and reports when a delete fails", async () => {
    const { db } = fakeDb((table, calls) =>
      table === "content_signals" && calls.includes("delete") ? { data: null, error: { message: "boom" } } : { data: [], error: null },
    );
    await expect(removeUnlinkedSignals(db, ids(2))).rejects.toThrow(/boom/);
  });

  it("splits long id lists into chunks", async () => {
    const lookups: number[] = [];
    const { db } = fakeDb((table) => {
      if (table === "article_signals") lookups.push(1);
      return { data: [], error: null };
    });
    await removeUnlinkedSignals(db, ids(RETENTION_CHUNK * 2 + 1));
    expect(lookups).toHaveLength(3);
  });

  it("does nothing for an empty list", async () => {
    const { db, log } = fakeDb(() => ({ data: [], error: null }));
    expect(await removeUnlinkedSignals(db, [])).toEqual([]);
    expect(log).toHaveLength(0);
  });
});

describe("removeOrphanedSources", () => {
  it("keeps sources that other signals still use", async () => {
    let deleted = 0;
    const { db } = fakeDb((table, calls) => {
      if (table === "signal_sources") return { data: [{ source_message_id: "message-1" }], error: null };
      if (table === "source_messages" && calls.includes("delete")) deleted++;
      return { data: [], error: null };
    });
    expect(await removeOrphanedSources(db, ["message-1", "message-2"])).toBe(1);
    expect(deleted).toBe(1);
  });

  it("deletes nothing when the usage check fails", async () => {
    const { db, log } = fakeDb((table) => (table === "signal_sources" ? { data: null, error: { message: "boom" } } : { data: [], error: null }));
    await expect(removeOrphanedSources(db, ["message-1"])).rejects.toBeInstanceOf(RetentionError);
    expect(log.some((entry) => entry.includes("delete"))).toBe(false);
  });
});
