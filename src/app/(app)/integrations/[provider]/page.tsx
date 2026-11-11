import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, ExternalLink, Info, Lock, RefreshCw, ShieldCheck, TriangleAlert, Unplug } from "lucide-react";
import { ActionButton } from "@/components/shared/actions";
import { DemoBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, Field, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { can, requirePagePermission } from "@/lib/auth";
import { disconnectIntegrationAction, syncIntegrationAction, testIntegrationAction } from "@/actions/integrations";
import { INTEGRATION_STATUS_META } from "@/lib/constants";
import { formatDateTime, formatDay, truncate } from "@/lib/format";
import { integrationDefinition } from "@/lib/integrations/registry";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { IntegrationStatus, SourceKind } from "@/lib/types";
import { DemoControls } from "./_components/demo-controls";
import { IntegrationForm } from "./_components/integration-form";

type Props = { params: Promise<{ provider: string }> };

const SOURCE_KINDS: SourceKind[] = ["slack", "jira", "teamleader", "email"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { provider } = await params;
  return { title: integrationDefinition(provider)?.label ?? "Integratie" };
}

export default async function IntegrationDetailPage({ params }: Props) {
  const { provider } = await params;
  const definition = integrationDefinition(provider);
  if (!definition) notFound();

  const session = await requirePagePermission(
    "integrations.manage",
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
  );
  const canManage = can(session, "integrations.manage");
  const db = await createClient();

  const { data: integration, error } = await db.from("integrations").select("*").eq("provider", definition.provider).maybeSingle();
  if (error) throw new Error(error.message);
  if (!integration) notFound();

  const isSource = SOURCE_KINDS.includes(definition.provider as SourceKind);
  const { data: messages } = isSource
    ? await db
        .from("source_messages")
        .select("id, channel, author_name, title, body, occurred_at, is_demo")
        .eq("source", definition.provider)
        .order("occurred_at", { ascending: false })
        .limit(10)
    : { data: [] };

  const status = integration.status as IntegrationStatus;
  const implemented = definition.connector === "implemented";
  const config = fromJson<Record<string, string>>(integration.config, {});
  const hasSettings = integration.has_credentials || Object.values(config).some((v) => String(v ?? "").trim());
  const retentionDays = session.organization.settings.retention_days ?? 365;
  const input = { provider: definition.provider };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <Link href="/integrations" className="inline-flex items-center gap-1 normal-case hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Integraties
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {definition.label}
            <MetaBadge meta={INTEGRATION_STATUS_META} value={status} dot />
          </span>
        }
        description={definition.description}
        actions={
          canManage && implemented ? (
            <>
              <ActionButton
                action={testIntegrationAction.bind(null, input)}
                variant="outline"
                disabled={!integration.has_credentials}
                title={integration.has_credentials ? undefined : "Sla eerst de instellingen en inloggegevens op"}
                pendingLabel="Testen…"
              >
                <CircleCheck />
                Verbinding testen
              </ActionButton>
              {definition.role === "source" && (
                <ActionButton
                  action={syncIntegrationAction.bind(null, input)}
                  disabled={status !== "connected"}
                  title={status === "connected" ? undefined : "Beschikbaar na een geslaagde verbindingstest"}
                  pendingLabel="Synchroniseren…"
                >
                  <RefreshCw />
                  Nu synchroniseren
                </ActionButton>
              )}
            </>
          ) : undefined
        }
      />

      {!canManage && (
        <Notice tone="info" icon={Lock} title="Alleen-lezen">
          Je kunt de status en het beleid van deze integratie inzien. Instellen kan alleen met het recht ‘Integraties beheren’.
        </Notice>
      )}

      {integration.last_error && (
        <Notice tone="danger" icon={TriangleAlert} title="Laatste fout">
          {integration.last_error}
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Panel title="Verbinding" description={definition.roleLabel}>
            <div className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-3">
                <Field label="Status">
                  <MetaBadge meta={INTEGRATION_STATUS_META} value={status} dot />
                </Field>
                <Field label="Authenticatie">{definition.authLabel}</Field>
                <Field label="Laatst getest">{integration.last_tested_at ? formatDateTime(integration.last_tested_at) : "Nog niet getest"}</Field>
              </dl>
              {implemented ? (
                <Notice tone="info" icon={Info} title="Connector beschikbaar">
                  {definition.connectorNote}
                </Notice>
              ) : (
                <Notice tone="warning" icon={TriangleAlert} title="Nog geen live koppeling beschikbaar">
                  {definition.connectorNote}
                </Notice>
              )}
              {status === "connected" && (
                <Notice tone="success" icon={CircleCheck} title="Live verbonden">
                  De laatste verbindingstest is geslaagd. Wijzig je de instellingen, dan is een nieuwe test nodig.
                </Notice>
              )}
              {definition.docsUrl && (
                <a
                  href={definition.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[0.8125rem] font-medium underline underline-offset-4"
                >
                  Waar vind ik deze gegevens?
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </Panel>

          <Panel
            title="Configuratie"
            description="Instellingen worden per organisatie opgeslagen. Geheimen worden versleuteld (AES-256-GCM) en zijn nooit terug te lezen."
          >
            <IntegrationForm
              key={integration.updated_at}
              provider={definition.provider}
              configFields={definition.configFields}
              secretFields={definition.secretFields}
              initialConfig={Object.fromEntries(definition.configFields.map((f) => [f.key, String(config[f.key] ?? "")]))}
              hasCredentials={integration.has_credentials}
              canManage={canManage}
              implemented={implemented}
            />
            {canManage && hasSettings && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ontkoppelen verwijdert de instellingen en de versleutelde inloggegevens. Eerder opgehaalde berichten blijven bewaard.
                </p>
                <ActionButton
                  action={disconnectIntegrationAction.bind(null, input)}
                  variant="destructive"
                  size="sm"
                  confirm={{
                    title: `${definition.label} ontkoppelen?`,
                    description: "De instellingen en opgeslagen inloggegevens worden verwijderd. Dit kan niet ongedaan worden gemaakt.",
                    confirmLabel: "Ontkoppelen",
                    destructive: true,
                  }}
                >
                  <Unplug />
                  Ontkoppelen
                </ActionButton>
              </div>
            )}
          </Panel>

          {definition.hasDemoFeed && (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  Demo-simulatie
                  <DemoBadge />
                </span>
              }
              description="Levert realistische voorbeeldberichten aan alsof ze uit dit systeem komen. Alles wat hieruit ontstaat is als demo gemarkeerd."
            >
              <DemoControls provider={definition.provider} status={status} canManage={canManage} />
            </Panel>
          )}

          <Panel
            title="Synchronisatie"
            description={isSource ? "Wanneer er voor het laatst berichten zijn opgehaald en wat er binnenkwam." : undefined}
            flush
          >
            {isSource ? (
              <>
                <dl className="grid gap-4 border-b px-5 py-4 sm:grid-cols-3">
                  <Field label="Laatste synchronisatie">
                    {integration.last_sync_at ? formatDateTime(integration.last_sync_at) : "Nog niet gesynchroniseerd"}
                  </Field>
                  <Field label="Resultaat">
                    {integration.last_sync_status === "success" ? (
                      <span className="font-medium text-success">Geslaagd</span>
                    ) : integration.last_sync_status === "error" ? (
                      <span className="font-medium text-danger">Mislukt</span>
                    ) : (
                      "-"
                    )}
                  </Field>
                  <Field label="Nieuwe berichten">{integration.last_sync_count ?? "-"}</Field>
                </dl>
                {(messages ?? []).length === 0 ? (
                  <EmptyState
                    title="Nog geen berichten uit deze bron"
                    description={
                      definition.hasDemoFeed
                        ? "Voer een synchronisatie of demo-synchronisatie uit om berichten op te halen."
                        : "Na een synchronisatie verschijnen de berichten hier."
                    }
                    className="py-10"
                  />
                ) : (
                  <ul className="divide-y">
                    {(messages ?? []).map((m) => (
                      <li key={m.id} className="space-y-1 px-5 py-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <time dateTime={m.occurred_at}>{formatDay(m.occurred_at)}</time>
                          {m.channel && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="font-medium text-foreground">{m.channel}</span>
                            </>
                          )}
                          {m.author_name && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{m.author_name}</span>
                            </>
                          )}
                          {m.is_demo && <DemoBadge />}
                        </div>
                        <p className="text-[0.8125rem] leading-relaxed">
                          {m.title && <span className="font-medium">{m.title} - </span>}
                          {truncate(m.body, 200)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="px-5 py-5 text-sm leading-relaxed text-muted-foreground">
                Dit is een publicatiekanaal: er worden geen berichten opgehaald.{" "}
                {definition.provider === "cms"
                  ? "Zonder live verbinding wordt publicatie van externe artikelen gesimuleerd en als zodanig vastgelegd."
                  : "Zonder koppeling wordt het plaatsen van social posts gesimuleerd; plaats de goedgekeurde tekst handmatig."}
              </p>
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Rechten" description="Wat de koppeling vraagt en waarvoor.">
            <ul className="space-y-3">
              {definition.scopes.map((s) => (
                <li key={s.scope} className="space-y-0.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.72rem]">{s.scope}</code>
                  <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{s.reason}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Privacy & beleid">
            <ul className="space-y-3">
              {definition.safeguards.map((text) => (
                <li key={text} className="flex gap-2.5 text-[0.8125rem] leading-relaxed">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={1.75} />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-3 border-t pt-4">
              <Field label="Bewaartermijn bronberichten">
                {retentionDays} dagen{" "}
                <Link href="/settings" className="text-xs text-muted-foreground underline underline-offset-4">
                  wijzigen
                </Link>
              </Field>
              <Field label="Toegang tot bronberichten">
                <span className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                  Alleen redactiemedewerkers van deze organisatie; agents lezen uitsluitend de bronnen die bij hun configuratie zijn
                  toegestaan.
                </span>
              </Field>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
