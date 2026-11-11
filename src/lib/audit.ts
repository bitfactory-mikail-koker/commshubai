import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { toJson } from "@/lib/json";
import type { AuditCategory } from "@/lib/types";

type Db = SupabaseClient<Database>;

export type AuditEntry = {
  organizationId: string;
  action: string;
  summary: string;
  category?: AuditCategory;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  requiresApproval?: boolean;
};

/** Records a user action. Runs with the user's own client (RLS: actor = self). */
export async function logUserAction(db: Db, userId: string, entry: AuditEntry): Promise<void> {
  const { error } = await db.from("audit_logs").insert({
    organization_id: entry.organizationId,
    actor_type: "user",
    actor_profile_id: userId,
    action: entry.action,
    category: entry.category ?? "performed",
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    summary: entry.summary,
    metadata: toJson(entry.metadata ?? {}),
    requires_approval: entry.requiresApproval ?? false,
  });
  if (error) console.error("[audit] could not write user action", error.message);
}

/** Records an agent action in the shared activity log (service client). */
export async function logAgentAction(admin: Db, agentId: string, entry: AuditEntry): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    organization_id: entry.organizationId,
    actor_type: "agent",
    actor_agent_id: agentId,
    action: entry.action,
    category: entry.category ?? "performed",
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    summary: entry.summary,
    metadata: toJson(entry.metadata ?? {}),
    requires_approval: entry.requiresApproval ?? false,
  });
  if (error) console.error("[audit] could not write agent action", error.message);
}

/** Records a system event (intelligence engine, scheduler, integrations). */
export async function logSystemAction(admin: Db, entry: AuditEntry): Promise<void> {
  const { error } = await admin.from("audit_logs").insert({
    organization_id: entry.organizationId,
    actor_type: "system",
    action: entry.action,
    category: entry.category ?? "system",
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    summary: entry.summary,
    metadata: toJson(entry.metadata ?? {}),
    requires_approval: entry.requiresApproval ?? false,
  });
  if (error) console.error("[audit] could not write system action", error.message);
}
