import { subMinutes, subWeeks } from "date-fns";
import "server-only";
import { logSystemAction } from "@/lib/audit";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { DEMO_FEED, type DemoMessage } from "@/lib/demo/feed";
import { fetchMessages, hasConnector, testConnection, type IngestMessage } from "@/lib/integrations/connectors";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { processSourceMessages } from "@/lib/intelligence/pipeline";
import { fromJson, toJson } from "@/lib/json";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Integration, IntegrationProvider } from "@/lib/types";

/**
 * Integration service. All functions take an organization id that the caller
 * has already authorized (server action with integrations.manage, or a job).
 */

async function loadIntegration(organizationId: string, provider: IntegrationProvider): Promise<Integration> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .single();
  if (error || !data) throw new Error("Integratie niet gevonden.");
  return data;
}

export async function loadSecrets(integrationId: string): Promise<Record<string, string>> {
  const db = createAdminClient();
  const { data } = await db
    .from("integration_credentials")
    .select("encrypted_payload")
    .eq("integration_id", integrationId)
    .maybeSingle();
  return data ? decryptJson(data.encrypted_payload) : {};
}

/** Saves non-secret config and (optionally) new secrets. Empty secrets keep the stored value. */
export async function saveIntegrationSettings(input: {
  organizationId: string;
  provider: IntegrationProvider;
  config: Record<string, string>;
  secrets: Record<string, string>;
  userId: string;
}): Promise<void> {
  const db = createAdminClient();
  const integration = await loadIntegration(input.organizationId, input.provider);
  const definition = INTEGRATIONS[input.provider];

  const config: Record<string, string> = {};
  for (const field of definition.configFields) config[field.key] = (input.config[field.key] ?? "").trim();

  const existing = await loadSecrets(integration.id);
  const merged = { ...existing };
  let changed = false;
  for (const field of definition.secretFields) {
    const value = (input.secrets[field.key] ?? "").trim();
    if (value) {
      merged[field.key] = value;
      changed = true;
    }
  }
  if (changed) {
    const { error } = await db.from("integration_credentials").upsert({
      integration_id: integration.id,
      organization_id: input.organizationId,
      encrypted_payload: encryptJson(merged),
      updated_by: input.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  // Changing settings invalidates an earlier successful test.
  const { error } = await db
    .from("integrations")
    .update({
      config: toJson(config),
      has_credentials: Object.keys(merged).length > 0,
      status: integration.status === "connected" || integration.status === "error" ? "not_connected" : integration.status,
      last_error: null,
    })
    .eq("id", integration.id);
  if (error) throw new Error(error.message);
}

/** Runs a live connection test. Only a successful test sets status "connected". */
export async function testIntegration(organizationId: string, provider: IntegrationProvider) {
  const db = createAdminClient();
  const integration = await loadIntegration(organizationId, provider);
  const secrets = await loadSecrets(integration.id);
  const result = await testConnection(provider, fromJson<Record<string, unknown>>(integration.config, {}), secrets);
  const now = new Date().toISOString();

  await db
    .from("integrations")
    .update({
      last_tested_at: now,
      status: result.ok ? "connected" : hasConnector(provider) ? "error" : integration.status === "demo" ? "demo" : "not_connected",
      last_error: result.ok ? null : result.detail,
    })
    .eq("id", integration.id);

  await logSystemAction(db, {
    organizationId,
    action: "integration.tested",
    entityType: "integration",
    entityId: integration.id,
    summary: `Verbindingstest ${INTEGRATIONS[provider].label}: ${result.ok ? "geslaagd" : "mislukt"} - ${result.detail}`,
  });
  return result;
}

export async function disconnectIntegration(organizationId: string, provider: IntegrationProvider): Promise<void> {
  const db = createAdminClient();
  const integration = await loadIntegration(organizationId, provider);
  await db.from("integration_credentials").delete().eq("integration_id", integration.id);
  await db
    .from("integrations")
    .update({ status: "not_connected", has_credentials: false, last_error: null, config: toJson({}) })
    .eq("id", integration.id);
  await logSystemAction(db, {
    organizationId,
    action: "integration.disconnected",
    entityType: "integration",
    entityId: integration.id,
    summary: `Integratie ${INTEGRATIONS[provider].label} is ontkoppeld en de opgeslagen gegevens zijn verwijderd.`,
  });
}

export async function setDemoMode(organizationId: string, provider: IntegrationProvider, enabled: boolean): Promise<void> {
  const db = createAdminClient();
  const integration = await loadIntegration(organizationId, provider);
  if (integration.status === "connected") {
    throw new Error("Deze integratie is live verbonden. Ontkoppel eerst om de demo-simulatie te gebruiken.");
  }
  await db
    .from("integrations")
    .update({ status: enabled ? "demo" : "not_connected", last_error: null })
    .eq("id", integration.id);
}

async function storeMessages(
  organizationId: string,
  integrationId: string | null,
  messages: (IngestMessage & { isDemo: boolean })[],
): Promise<string[]> {
  if (messages.length === 0) return [];
  const db = createAdminClient();
  const { data, error } = await db
    .from("source_messages")
    .upsert(
      messages.map((m) => ({
        organization_id: organizationId,
        integration_id: integrationId,
        source: m.source,
        external_id: m.externalId,
        channel: m.channel,
        author_name: m.authorName,
        title: m.title,
        body: m.body,
        url: m.url,
        metadata: toJson(m.metadata),
        occurred_at: m.occurredAt,
        is_demo: m.isDemo,
      })),
      { onConflict: "organization_id,source,external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

/** Live synchronization through the real connector (Slack / Jira). */
export async function syncIntegration(input: {
  organizationId: string;
  provider: IntegrationProvider;
  trigger: "manual" | "schedule";
  triggeredBy?: string | null;
}): Promise<{ fetched: number; added: number; signals: number }> {
  const db = createAdminClient();
  const integration = await loadIntegration(input.organizationId, input.provider);
  if (integration.status !== "connected") {
    throw new Error("Deze integratie is niet verbonden. Voer eerst een geslaagde verbindingstest uit.");
  }
  const now = new Date();
  try {
    const secrets = await loadSecrets(integration.id);
    const since = integration.last_sync_at ? new Date(integration.last_sync_at) : subWeeks(now, 1);
    const fetched = await fetchMessages(input.provider, fromJson<Record<string, unknown>>(integration.config, {}), secrets, since);
    const ids = await storeMessages(input.organizationId, integration.id, fetched.map((m) => ({ ...m, isDemo: false })));
    const processed = ids.length
      ? await processSourceMessages({
          organizationId: input.organizationId,
          messageIds: ids,
          trigger: input.trigger === "manual" ? "manual" : "schedule",
          triggeredBy: input.triggeredBy,
          autoEvaluate: true,
        })
      : null;
    await db
      .from("integrations")
      .update({ last_sync_at: now.toISOString(), last_sync_status: "success", last_sync_count: ids.length, last_error: null })
      .eq("id", integration.id);
    await logSystemAction(db, {
      organizationId: input.organizationId,
      action: "integration.synced",
      entityType: "integration",
      entityId: integration.id,
      summary: `${INTEGRATIONS[input.provider].label} gesynchroniseerd: ${ids.length} nieuw(e) bericht(en), ${processed?.signalIds.length ?? 0} signaal/signalen.`,
    });
    return { fetched: fetched.length, added: ids.length, signals: processed?.signalIds.length ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout.";
    await db
      .from("integrations")
      .update({ last_sync_at: now.toISOString(), last_sync_status: "error", last_error: message, status: "error" })
      .eq("id", integration.id);
    throw error;
  }
}

/** Inserts demo messages (flagged is_demo) and runs them through the engine. */
export async function ingestDemoMessages(input: {
  organizationId: string;
  messages: DemoMessage[];
  trigger: "manual" | "demo";
  triggeredBy?: string | null;
}): Promise<{ messageIds: string[]; signalIds: string[]; opportunityIds: string[]; skipped: number }> {
  const db = createAdminClient();
  const { data: integrations } = await db
    .from("integrations")
    .select("id, provider")
    .eq("organization_id", input.organizationId);
  const now = Date.now();
  const messageIds: string[] = [];
  for (const [i, m] of input.messages.entries()) {
    const integrationId = integrations?.find((x) => x.provider === m.source)?.id;
    const ids = await storeMessages(input.organizationId, integrationId ?? null, [
      {
        source: m.source,
        externalId: m.externalId,
        channel: m.channel,
        authorName: m.authorName,
        title: m.title,
        body: m.body,
        url: null,
        occurredAt: subMinutes(now, input.messages.length - i).toISOString(),
        metadata: { ...m.metadata, demo: true },
        isDemo: true,
      },
    ]);
    messageIds.push(...ids);
  }
  if (messageIds.length === 0) return { messageIds, signalIds: [], opportunityIds: [], skipped: 0 };
  const processed = await processSourceMessages({
    organizationId: input.organizationId,
    messageIds,
    trigger: input.trigger,
    triggeredBy: input.triggeredBy,
    autoEvaluate: true,
  });
  return { messageIds, signalIds: processed.signalIds, opportunityIds: processed.opportunityIds, skipped: processed.skipped };
}

/** "Demo-synchronisatie": delivers the next unseen demo messages for a provider. */
export async function runDemoSync(input: {
  organizationId: string;
  provider: IntegrationProvider;
  triggeredBy?: string | null;
}): Promise<{ added: number; signals: number; skipped: number; exhausted: boolean }> {
  const db = createAdminClient();
  const integration = await loadIntegration(input.organizationId, input.provider);
  if (integration.status !== "demo") {
    throw new Error("Schakel eerst de demo-simulatie in voor deze integratie.");
  }
  const pool = DEMO_FEED.filter((m) => m.source === input.provider);
  const { data: seen } = await db
    .from("source_messages")
    .select("external_id")
    .eq("organization_id", input.organizationId)
    .in("external_id", pool.map((m) => m.externalId));
  const seenIds = new Set((seen ?? []).map((s) => s.external_id));
  const next = pool.filter((m) => !seenIds.has(m.externalId)).slice(0, 2);

  const now = new Date().toISOString();
  if (next.length === 0) {
    await db.from("integrations").update({ last_sync_at: now, last_sync_status: "success", last_sync_count: 0 }).eq("id", integration.id);
    return { added: 0, signals: 0, skipped: 0, exhausted: true };
  }
  const result = await ingestDemoMessages({
    organizationId: input.organizationId,
    messages: next,
    trigger: "manual",
    triggeredBy: input.triggeredBy,
  });
  await db
    .from("integrations")
    .update({ last_sync_at: now, last_sync_status: "success", last_sync_count: result.messageIds.length, last_error: null })
    .eq("id", integration.id);
  await logSystemAction(db, {
    organizationId: input.organizationId,
    action: "integration.demo_synced",
    entityType: "integration",
    entityId: integration.id,
    summary: `Demo-synchronisatie ${INTEGRATIONS[input.provider].label}: ${result.messageIds.length} gesimuleerd(e) bericht(en), ${result.signalIds.length} signaal/signalen.`,
    metadata: { demo: true },
  });
  return { added: result.messageIds.length, signals: result.signalIds.length, skipped: result.skipped, exhausted: false };
}
