import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Classification } from "@/lib/types";

type Db = SupabaseClient<Database>;

export type CalendarSync = {
  organizationId: string;
  entityType: "article" | "interview" | "newsletter" | "social_post";
  entityId: string;
  entryType: "article" | "interview" | "newsletter" | "social_post" | "deadline";
  title: string;
  startsAt: string;
  classification?: Classification | null;
  status?: "planned" | "done" | "cancelled";
  createdBy?: string | null;
};

/** Creates or updates the calendar entry that mirrors a planned entity. */
export async function upsertCalendarEntry(db: Db, entry: CalendarSync): Promise<void> {
  const { error } = await db.from("content_calendar").upsert(
    {
      organization_id: entry.organizationId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      entry_type: entry.entryType,
      title: entry.title,
      starts_at: entry.startsAt,
      classification: entry.classification ?? null,
      status: entry.status ?? "planned",
      created_by: entry.createdBy ?? null,
    },
    { onConflict: "entity_type,entity_id,entry_type" },
  );
  if (error) console.error("[calendar] upsert failed", error.message);
}

export async function removeCalendarEntry(
  db: Db,
  entityType: CalendarSync["entityType"],
  entityId: string,
  entryType?: CalendarSync["entryType"],
): Promise<void> {
  let query = db.from("content_calendar").delete().eq("entity_type", entityType).eq("entity_id", entityId);
  if (entryType) query = query.eq("entry_type", entryType);
  const { error } = await query;
  if (error) console.error("[calendar] delete failed", error.message);
}
