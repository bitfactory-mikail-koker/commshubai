import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

let adminClient: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses RLS, so it is only used by:
 *  - the agent runtime (which scopes every query to one organization and
 *    checks the agent's tool permissions itself),
 *  - background jobs,
 *  - user administration (auth admin API).
 * Never import this from client components.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (!adminClient) {
    adminClient = createSupabaseClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export type AdminClient = SupabaseClient<Database>;
