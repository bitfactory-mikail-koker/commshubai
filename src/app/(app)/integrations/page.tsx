import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  ChevronRight,
  Globe,
  Hash,
  Info,
  KeyRound,
  Share2,
  Mail,
  SquareKanban,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { MetaBadge } from "@/components/shared/badges";
import { Notice, PageHeader } from "@/components/shared/layout";
import { can, requirePagePermission } from "@/lib/auth";
import { INTEGRATION_PROVIDERS, INTEGRATION_STATUS_META } from "@/lib/constants";
import { formatDay, truncate } from "@/lib/format";
import { INTEGRATIONS, type IntegrationDefinition } from "@/lib/integrations/registry";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Integration, IntegrationProvider } from "@/lib/types";

export const metadata: Metadata = { title: "Integraties" };

const ICONS: Record<IntegrationProvider, LucideIcon> = {
  slack: Hash,
  jira: SquareKanban,
  teamleader: Briefcase,
  email: Mail,
  cms: Globe,
  linkedin: Share2,
};

function syncSummary(row: Integration | undefined, definition: IntegrationDefinition): string {
  if (!row?.last_sync_at) {
    return definition.role === "publication" ? "Geen synchronisatie (publicatiekanaal)" : "Nog niet gesynchroniseerd";
  }
  const status = row.last_sync_status === "error" ? "mislukt" : "geslaagd";
  const count = row.last_sync_count !== null ? `, ${row.last_sync_count} bericht(en)` : "";
  return `${formatDay(row.last_sync_at)}, ${status}${count}`;
}

const ROW_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_8.5rem_1rem]";

function IntegrationRow({ definition, row }: { definition: IntegrationDefinition; row: Integration | undefined }) {
  const Icon = ICONS[definition.provider];
  const status = row?.status ?? "not_connected";
  return (
    <li>
      <Link
        href={`/integrations/${definition.provider}`}
        className={cn(
          "grid items-center gap-x-4 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary",
          ROW_COLUMNS,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-medium">{definition.label}</p>
            <p className="text-xs text-muted-foreground">{definition.tagline}</p>
          </div>
        </div>
        <span className="hidden text-[0.8125rem] text-muted-foreground lg:block">
          {definition.connector === "implemented" ? "Connector beschikbaar" : "OAuth nog niet gebouwd"}
        </span>
        <span className="hidden text-[0.8125rem] text-muted-foreground lg:block">{syncSummary(row, definition)}</span>
        <span className="hidden items-center gap-1.5 text-[0.8125rem] text-muted-foreground lg:inline-flex">
          {row?.has_credentials ? (
            <>
              <KeyRound className="size-3.5" strokeWidth={1.75} />
              Versleuteld opgeslagen
            </>
          ) : (
            "Niet opgeslagen"
          )}
        </span>
        <span>
          <MetaBadge meta={INTEGRATION_STATUS_META} value={status} />
        </span>
        <ChevronRight className="hidden size-4 text-muted-foreground/60 lg:block" />
        {row?.last_error && (
          <p className="col-span-full flex gap-2 text-xs leading-relaxed text-danger">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{truncate(row.last_error, 160)}</span>
          </p>
        )}
      </Link>
    </li>
  );
}

export default async function IntegrationsPage() {
  const session = await requirePagePermission(
    "integrations.manage",
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
  );
  const db = await createClient();
  const { data: rows, error } = await db.from("integrations").select("*");
  if (error) throw new Error(error.message);

  const byProvider = new Map((rows ?? []).map((r) => [r.provider, r]));
  const definitions = INTEGRATION_PROVIDERS.map((p) => INTEGRATIONS[p]);
  const groups = [
    {
      key: "source",
      title: "Informatiebronnen",
      description: "Systemen waaruit de Intelligence Engine geautoriseerde berichten leest om signalen te detecteren.",
      items: definitions.filter((d) => d.role === "source"),
    },
    {
      key: "publication",
      title: "Publicatiekanalen",
      description: "Kanalen waar goedgekeurde content naartoe kan. Er gaat nooit iets uit zonder menselijke goedkeuring.",
      items: definitions.filter((d) => d.role === "publication"),
    },
  ];
  const connected = (rows ?? []).filter((r) => r.status === "connected").length;
  const demo = (rows ?? []).filter((r) => r.status === "demo").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integraties"
        description="Koppel de systemen waar het nieuws ontstaat en de kanalen waar het naartoe gaat. Een integratie telt pas als verbonden na een geslaagde verbindingstest."
        actions={
          <span className="text-xs text-muted-foreground">
            {connected} live verbonden · {demo} in demo-simulatie
          </span>
        }
      />

      <Notice tone="info" icon={Info} title="Wat werkt er nu echt?">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Voor <strong className="font-medium">Slack</strong>, <strong className="font-medium">Jira</strong> en de{" "}
            <strong className="font-medium">CMS-webhook</strong> is een connector gebouwd op de officiële API&apos;s. Deze zijn in deze
            omgeving nog niet getest tegen echte accounts.
          </li>
          <li>
            <strong className="font-medium">Teamleader Orbit</strong>, <strong className="font-medium">e-mail</strong> en{" "}
            <strong className="font-medium">LinkedIn</strong> vereisen OAuth-autorisatie die nog niet is gebouwd. Je kunt de gegevens
            alvast vastleggen, maar er is geen live verbinding.
          </li>
          <li>
            <strong className="font-medium">Demo-simulatie</strong> levert voorbeeldberichten aan die overal als demo zijn gemarkeerd.
          </li>
        </ul>
      </Notice>

      {!can(session, "integrations.manage") && (
        <Notice tone="info" title="Alleen-lezen">
          Je kunt de status van de integraties inzien. Instellen en verbinden kan alleen met het recht ‘Integraties beheren’.
        </Notice>
      )}

      {groups.map((group) => (
        <section key={group.key} className="space-y-2.5" aria-labelledby={`group-${group.key}`}>
          <div className="space-y-1">
            <h2 id={`group-${group.key}`} className="text-[0.9375rem] leading-6 font-semibold tracking-[-0.006em]">
              {group.title}
            </h2>
            <p className="text-[0.8125rem] text-muted-foreground">{group.description}</p>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className={cn("hidden gap-x-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid", ROW_COLUMNS)}>
              <span>Integratie</span>
              <span>Koppeling</span>
              <span>Laatste synchronisatie</span>
              <span>Inloggegevens</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y">
              {group.items.map((definition) => (
                <IntegrationRow key={definition.provider} definition={definition} row={byProvider.get(definition.provider)} />
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
