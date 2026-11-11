"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { encryptionAvailable } from "@/lib/crypto";
import { hasConnector } from "@/lib/integrations/connectors";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import {
  disconnectIntegration,
  runDemoSync,
  saveIntegrationSettings,
  setDemoMode,
  syncIntegration,
  testIntegration,
} from "@/lib/integrations/service";
import { fail, ok, runAction, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");
const providerSchema = z.enum(["slack", "jira", "teamleader", "email", "cms", "linkedin"]);

export async function saveIntegration(input: {
  provider: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("integrations.manage");
    const provider = providerSchema.parse(input.provider);
    const definition = INTEGRATIONS[provider];

    const fieldErrors: Record<string, string> = {};
    for (const field of definition.configFields) {
      const value = (input.config[field.key] ?? "").trim();
      if (field.required && !value) fieldErrors[field.key] = `${field.label} is verplicht.`;
      if (value && field.type === "url" && !/^https?:\/\/.+/.test(value)) fieldErrors[field.key] = "Vul een geldige URL in (https://…).";
      if (value.length > 500) fieldErrors[field.key] = "Deze waarde is te lang.";
    }
    if (Object.keys(fieldErrors).length > 0) return fail("Controleer de invoer.", fieldErrors);

    const hasNewSecret = definition.secretFields.some((f) => (input.secrets[f.key] ?? "").trim());
    if (hasNewSecret && !encryptionAvailable()) {
      return fail("INTEGRATION_ENCRYPTION_KEY is niet ingesteld. Zonder sleutel kunnen geheimen niet veilig worden opgeslagen.");
    }

    await saveIntegrationSettings({
      organizationId: session.organization.id,
      provider,
      config: input.config,
      secrets: input.secrets,
      userId: session.userId,
    });
    const db = await createClient();
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "integration.configured",
      entityType: "integration",
      summary: `Instellingen van ${definition.label} opgeslagen${hasNewSecret ? " (inclusief nieuwe, versleutelde inloggegevens)" : ""}.`,
    });
    refresh();
    return ok(
      hasConnector(provider)
        ? "Instellingen opgeslagen. Voer een verbindingstest uit om de koppeling te activeren."
        : "Instellingen opgeslagen. Voor deze integratie is nog geen live koppeling beschikbaar.",
    );
  });
}

export async function testIntegrationAction(input: { provider: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("integrations.manage");
    const result = await testIntegration(session.organization.id, providerSchema.parse(input.provider));
    refresh();
    return result.ok ? ok(`Verbinding geslaagd. ${result.detail}`) : fail(`Verbinding mislukt. ${result.detail}`);
  });
}

export async function syncIntegrationAction(input: { provider: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("integrations.manage");
    const result = await syncIntegration({
      organizationId: session.organization.id,
      provider: providerSchema.parse(input.provider),
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(`Synchronisatie voltooid: ${result.added} nieuw(e) bericht(en), ${result.signals} signaal/signalen.`);
  });
}

export async function toggleDemoMode(input: { provider: string; enabled: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("integrations.manage");
    const provider = providerSchema.parse(input.provider);
    if (!INTEGRATIONS[provider].hasDemoFeed) return fail("Voor deze integratie is geen demo-simulatie beschikbaar.");
    await setDemoMode(session.organization.id, provider, input.enabled);
    refresh();
    return ok(input.enabled ? "Demo-simulatie ingeschakeld." : "Demo-simulatie uitgeschakeld.");
  });
}

export async function runDemoSyncAction(input: { provider: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("integrations.manage");
    const result = await runDemoSync({
      organizationId: session.organization.id,
      provider: providerSchema.parse(input.provider),
      triggeredBy: session.userId,
    });
    refresh();
    if (result.exhausted) return ok("Er zijn geen nieuwe demo-berichten meer voor deze integratie.");
    return ok(
      `Demo-synchronisatie: ${result.added} gesimuleerd(e) bericht(en) ontvangen, ${result.signals} signaal/signalen gedetecteerd${result.skipped ? `, ${result.skipped} als niet-nieuwswaardig overgeslagen` : ""}.`,
    );
  });
}

export async function disconnectIntegrationAction(input: { provider: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("integrations.manage");
    await disconnectIntegration(session.organization.id, providerSchema.parse(input.provider));
    refresh();
    return ok("Integratie ontkoppeld en opgeslagen gegevens verwijderd.");
  });
}
