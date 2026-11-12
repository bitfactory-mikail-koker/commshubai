import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown, FlaskConical, Lock, Pause, Play } from "lucide-react";
import { setBotPaused } from "@/actions/redactie";
import { ActionButton } from "@/components/shared/actions";
import { DemoBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { aiStatus } from "@/lib/ai";
import { monthUsage } from "@/lib/ai/metering";
import { can, requirePagePermission } from "@/lib/auth";
import { BOT_MESSAGE_KIND_LABELS, BOT_MESSAGE_STATUS_META } from "@/lib/constants";
import { env } from "@/lib/env";
import { formatDateTime, formatDay, truncate, formatEuro } from "@/lib/format";
import { redactieSettings } from "@/lib/redactie/settings";
import { createClient } from "@/lib/supabase/server";
import type { BotMessageKind, BotMessageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BotSettingsForm } from "./_components/settings-form";
import { TryOut } from "./_components/try-out";

export const metadata: Metadata = { title: "Gedrag en postvak" };

const VIEWS = [
  { key: "postvak", label: "Postvak" },
  { key: "uitproberen", label: "Uitproberen" },
  { key: "instellingen", label: "Instellingen" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const STATUS_ORDER: BotMessageStatus[] = ["shadow", "simulated", "sent", "scheduled", "blocked", "failed"];
const PAGE_SIZE = 50;

const MEDIUM_LABELS: Record<string, string> = {
  dm: "Privébericht",
  channel: "Bericht in kanaal",
  thread: "Reactie in thread",
  email: "E-mail",
};

/** Where the record a message is about can be opened. */
function entityLink(type: string | null, id: string | null): { href: string; label: string } | null {
  if (!type) return null;
  switch (type) {
    case "article":
      return id ? { href: `/editorial/${id}`, label: "Naar het stuk" } : null;
    case "interview":
      return id ? { href: `/interviews/${id}`, label: "Naar het interview" } : null;
    case "newsletter":
      return id ? { href: `/newsletters/${id}`, label: "Naar de editie" } : null;
    case "channel":
      return { href: "/channels", label: "Naar de kanalen" };
    case "outreach_group":
      return { href: "/groups", label: "Naar de groepen" };
    default:
      return null;
  }
}


export default async function BotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission(
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
    "users.manage",
    "agents.manage",
    "integrations.manage",
  );
  const params = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === params.weergave) ? (params.weergave as ViewKey) : "postvak";
  const statusFilter =
    typeof params.status === "string" && STATUS_ORDER.includes(params.status as BotMessageStatus) ? (params.status as BotMessageStatus) : "all";
  const page = Math.max(1, Number.parseInt(typeof params.pagina === "string" ? params.pagina : "1", 10) || 1);

  const canManage = can(session, "agents.manage");
  const canTry = can(session, "agents.manage", "integrations.manage");
  const settings = redactieSettings(session.organization.settings);
  const ai = aiStatus();
  const db = await createClient();

  const [{ data: slack }, { count: pilotCount }, { count: activeCount }, usage] = await Promise.all([
    db.from("integrations").select("status").eq("provider", "slack").maybeSingle(),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true).eq("in_pilot", true),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    monthUsage(session.organization.id),
  ]);
  const slackConnected = slack?.status === "connected";

  const href = (patch: Record<string, string | null>) => {
    const query = new URLSearchParams();
    const next = { weergave: view === "postvak" ? null : view, status: statusFilter === "all" ? null : statusFilter, ...patch };
    for (const [key, value] of Object.entries(next)) if (value) query.set(key, value);
    const qs = query.toString();
    return qs ? `/bot?${qs}` : "/bot";
  };

  // What the state means right now, in plain words.
  const running = settings.botPaused
    ? "De bot stuurt geen berichten, reageert niet op emoji's en maakt geen nieuwe voorstellen. Goedkeuringen op de website gaan gewoon door."
    : settings.shadowMode
      ? "De bot werkt, maar collega's merken er niets van. Elk bericht dat hij zou sturen komt alleen hier in het postvak te staan."
      : slackConnected
        ? `De bot stuurt berichten via Slack, op werkdagen tussen ${settings.workStart} en ${settings.workEnd}.`
        : "De bot werkt en zet berichten klaar als gesimuleerd. Er is geen Slack-workspace verbonden, dus er komt niets bij collega's aan.";
  const budget =
    settings.aiBudgetEur > 0
      ? `${formatEuro(usage.costEur)} van ${formatEuro(settings.aiBudgetEur)} gebruikt deze maand (${usage.calls} aanroepen).`
      : `${formatEuro(usage.costEur)} gebruikt deze maand (${usage.calls} aanroepen). Er is geen plafond ingesteld.`;
  const overBudget = settings.aiBudgetEur > 0 && usage.costEur >= settings.aiBudgetEur;

  const state: { label: string; badge: React.ReactNode; text: string }[] = [
    {
      label: "Bot",
      badge: settings.botPaused ? <ToneBadge tone="amber">Gepauzeerd</ToneBadge> : <ToneBadge tone="green">Actief</ToneBadge>,
      text: running,
    },
    {
      label: "Schaduwmodus",
      badge: settings.shadowMode ? <ToneBadge tone="blue">Aan</ToneBadge> : <ToneBadge tone="slate">Uit</ToneBadge>,
      text: settings.shadowMode
        ? "Alleen de redactie ziet wat de bot zou doen. Zet dit uit zodra de proef echt begint."
        : "Berichten gaan de deur uit zodra de gedragsregels het toelaten.",
    },
    {
      label: "Proefgroep",
      badge: settings.pilotOnly ? <ToneBadge tone="blue">Alleen proefgroep</ToneBadge> : <ToneBadge tone="slate">Iedereen</ToneBadge>,
      text: settings.pilotOnly
        ? `Alleen de ${pilotCount ?? 0} mensen in de proefgroep worden benaderd. Berichten aan de andere ${Math.max(0, (activeCount ?? 0) - (pilotCount ?? 0))} collega's worden tegengehouden.`
        : `Alle ${activeCount ?? 0} actieve collega's kunnen worden benaderd, behalve wie de beheerder of de collega zelf heeft uitgezonderd. In de proefgroep zitten ${pilotCount ?? 0} mensen.`,
    },
    {
      label: "Slack",
      badge: slackConnected ? <ToneBadge tone="green">Verbonden</ToneBadge> : <ToneBadge tone="slate">Niet verbonden</ToneBadge>,
      text: slackConnected
        ? "De eigen Slack-app is verbonden en getest."
        : "Er is geen Slack-workspace verbonden. Niets uit het postvak is bij een collega aangekomen.",
    },
    {
      label: "AI-kosten",
      badge: overBudget ? <ToneBadge tone="red">Plafond bereikt</ToneBadge> : <ToneBadge tone="slate">Binnen het plafond</ToneBadge>,
      text: overBudget ? `${budget} De bot beoordeelt en schrijft niets meer tot het plafond omhoog gaat of de nieuwe maand begint.` : budget,
    },
  ];

  // --- Postvak -----------------------------------------------------------------
  let messages: {
    id: string;
    kind: string;
    medium: string;
    slack_channel_id: string | null;
    recipient_label: string | null;
    body: string;
    status: string;
    blocked_reason: string | null;
    error: string | null;
    send_after: string | null;
    counts_as_request: boolean;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
  }[] = [];
  let total = 0;
  const counts: Record<string, number> = {};
  const channelNames = new Map<string, string>();
  if (view === "postvak") {
    let query = db
      .from("bot_messages")
      .select(
        "id, kind, medium, slack_channel_id, recipient_label, body, status, blocked_reason, error, send_after, counts_as_request, entity_type, entity_id, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const [{ data, count, error }, { data: statuses }, { data: channels }] = await Promise.all([
      query,
      db.from("bot_messages").select("status").limit(5000),
      db.from("channels").select("slack_channel_id, name"),
    ]);
    if (error) throw new Error(error.message);
    messages = data ?? [];
    total = count ?? 0;
    for (const row of statuses ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
    for (const channel of channels ?? []) channelNames.set(channel.slack_channel_id, channel.name);
  }
  const allCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // --- Try-out -------------------------------------------------------------------
  const tryOutData =
    view === "uitproberen"
      ? await Promise.all([
          db.from("channels").select("id, name, follow_mode").eq("followed", true).order("name"),
          db.from("emoji_rules").select("emoji, shortcode, goal").eq("enabled", true).order("sort_order"),
          db.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
        ])
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gedrag en postvak"
        description={`Hoe de ${settings.botName} zich gedraagt en alles wat hij heeft gestuurd, zou sturen, vasthoudt of niet mocht sturen.`}
        actions={
          canManage ? (
            settings.botPaused ? (
              <ActionButton
                action={setBotPaused.bind(null, { paused: false })}
                confirm={{
                  title: "Bot hervatten?",
                  description: settings.shadowMode
                    ? "De bot gaat weer aan het werk. De schaduwmodus staat aan, dus er gaat nog niets naar collega's."
                    : "De bot gaat weer aan het werk en stuurt weer berichten zodra de gedragsregels dat toelaten.",
                  confirmLabel: "Hervatten",
                }}
              >
                <Play />
                Bot hervatten
              </ActionButton>
            ) : (
              <ActionButton
                variant="destructive"
                action={setBotPaused.bind(null, { paused: true })}
                confirm={{
                  title: "Bot pauzeren?",
                  description:
                    "De bot stuurt dan geen enkel bericht meer, reageert niet op emoji's en maakt geen nieuwe voorstellen. Goedkeuringen op de website gaan door. Je kunt de bot op elk moment hervatten.",
                  confirmLabel: "Pauzeren",
                  destructive: true,
                }}
              >
                <Pause />
                Bot pauzeren
              </ActionButton>
            )
          ) : undefined
        }
      />

      <Panel title="Stand van zaken" flush>
        <dl className="divide-y">
          {state.map((row) => (
            <div key={row.label} className="grid gap-x-6 gap-y-1 px-4 py-2.5 sm:grid-cols-[9rem_10rem_minmax(0,1fr)] sm:items-baseline">
              <dt className="text-[0.8125rem] font-medium">{row.label}</dt>
              <dd>{row.badge}</dd>
              <dd className="text-[0.8125rem] leading-relaxed text-muted-foreground">{row.text}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="Onderdeel">
        {VIEWS.map((option) => (
          <Link
            key={option.key}
            href={option.key === "postvak" ? "/bot" : `/bot?weergave=${option.key}`}
            scroll={false}
            aria-current={view === option.key ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === option.key ? "bg-secondary text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {view === "postvak" && (
        <div className="space-y-4">
          <FilterTabs
            active={statusFilter}
            items={[
              { key: "all", label: "Alles", href: href({ status: null, pagina: null }), count: allCount },
              ...STATUS_ORDER.map((status) => ({
                key: status,
                label: BOT_MESSAGE_STATUS_META[status].label,
                href: href({ status, pagina: null }),
                count: counts[status] ?? 0,
              })),
            ]}
          />
          <Panel flush>
            {messages.length === 0 ? (
              <EmptyState
                title={allCount === 0 ? "Het postvak is leeg" : "Geen berichten met deze status"}
                description={
                  allCount === 0
                    ? "Zodra de bot iemand wil benaderen of in een kanaal wil reageren, staat het bericht hier. Ook als het niet verstuurd mocht worden."
                    : "Kies een andere status om meer berichten te zien."
                }
              />
            ) : (
              <ul className="divide-y">
                {messages.map((message) => {
                  const channel = message.slack_channel_id
                    ? channelNames.has(message.slack_channel_id)
                      ? `#${channelNames.get(message.slack_channel_id)}`
                      : `een verwijderd kanaal (${message.slack_channel_id})`
                    : null;
                  const to = message.medium === "dm" || message.medium === "email" ? (message.recipient_label ?? "Onbekend") : (channel ?? "Onbekend kanaal");
                  const reason = message.blocked_reason ?? message.error;
                  const link = entityLink(message.entity_type, message.entity_id);
                  return (
                    <li key={message.id}>
                      <details className="group">
                        <summary className="grid list-none items-center gap-x-4 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
                          <time dateTime={message.created_at} className="text-xs text-muted-foreground tabular-nums">
                            {formatDay(message.created_at)}
                          </time>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                              <span className="font-medium">{BOT_MESSAGE_KIND_LABELS[message.kind as BotMessageKind] ?? message.kind}</span>
                              <span className="text-[0.8125rem] text-muted-foreground">aan {to}</span>
                            </p>
                            <p className="truncate text-[0.8125rem] text-muted-foreground group-open:hidden">
                              {reason ? reason : truncate(message.body, 150)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <MetaBadge meta={BOT_MESSAGE_STATUS_META} value={message.status} />
                            <ChevronDown className="size-4 text-muted-foreground/70 transition-transform duration-150 group-open:rotate-180" />
                          </div>
                        </summary>
                        <div className="grid gap-x-4 gap-y-3 px-4 pt-1 pb-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
                          <div className="hidden sm:block" />
                          <div className="min-w-0 space-y-3">
                            {reason && (
                              <p className={cn("text-[0.8125rem] font-medium", message.status === "failed" ? "text-danger" : "text-warning")}>
                                {message.status === "failed" ? "Mislukt" : "Tegengehouden"}: {reason}
                              </p>
                            )}
                            <p className="max-w-[72ch] text-[0.8125rem] leading-relaxed whitespace-pre-wrap">{message.body}</p>
                            <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                              <span>{MEDIUM_LABELS[message.medium] ?? message.medium}</span>
                              <span aria-hidden>·</span>
                              <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
                              {message.counts_as_request && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span>Telt als nieuw verzoek voor de limiet per persoon</span>
                                </>
                              )}
                              {message.status === "scheduled" && message.send_after && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span>Gaat uit vanaf {formatDateTime(message.send_after)}</span>
                                </>
                              )}
                              {link && (
                                <>
                                  <span aria-hidden>·</span>
                                  <Link href={link.href} className="font-medium text-info underline-offset-2 hover:underline">
                                    {link.label}
                                  </Link>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          {total > PAGE_SIZE && (
            <nav className="flex items-center justify-between text-[0.8125rem] text-muted-foreground" aria-label="Pagina's">
              <span className="tabular-nums">
                {(page - 1) * PAGE_SIZE + 1} tot {Math.min(page * PAGE_SIZE, total)} van {total}
              </span>
              <span className="flex items-center gap-1">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={href({ pagina: page > 2 ? String(page - 1) : null })}>
                      <ChevronLeft />
                      Vorige
                    </Link>
                  </Button>
                )}
                {page < pages && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={href({ pagina: String(page + 1) })}>
                      Volgende
                      <ChevronRight />
                    </Link>
                  </Button>
                )}
              </span>
            </nav>
          )}
        </div>
      )}

      {view === "uitproberen" && tryOutData && (
        <div className="space-y-4">
          <Notice tone="demo" icon={FlaskConical} title="Uitproberen zonder Slack">
            In deze omgeving is geen Slack-workspace verbonden. Hier stuur je zelf een proefbericht door precies dezelfde code als een
            echte Slack-gebeurtenis of een echte e-mail: dezelfde regels, hetzelfde oordeel, hetzelfde postvak. Wat je hier doet is echt
            voor deze omgeving. Een proefbericht kan dus een voorstel in de inbox opleveren.
          </Notice>
          {canTry ? (
            <TryOut
              channels={(tryOutData[0].data ?? []).map((c) => ({ id: c.id, name: c.name, followMode: c.follow_mode }))}
              emoji={(tryOutData[1].data ?? []).map((e) => ({ emoji: e.emoji, shortcode: e.shortcode, goal: e.goal }))}
              people={(tryOutData[2].data ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
              currentUserId={session.userId}
              mailDomain={settings.mailDomain}
              mailboxAddress={settings.mailboxAddress}
              paused={settings.botPaused}
            />
          ) : (
            <Notice tone="info" icon={Lock}>
              Alleen gebruikers met het recht ‘Agents beheren’ of ‘Integraties beheren’ kunnen proefberichten sturen.
            </Notice>
          )}
        </div>
      )}

      {view === "instellingen" && (
        <div className="space-y-8">
          <Panel
            title="Gedragsregels"
            description="Gelden voor elk bericht dat de bot wil sturen. Wat een regel tegenhoudt, staat met de reden in het postvak."
            actions={!canManage ? <ToneBadge tone="slate">Alleen-lezen</ToneBadge> : undefined}
          >
            {!canManage && (
              <Notice tone="info" icon={Lock} className="mb-5">
                Alleen gebruikers met het recht ‘Agents beheren’ kunnen het gedrag van de bot wijzigen.
              </Notice>
            )}
            <BotSettingsForm
              key={session.organization.updated_at}
              initial={{
                botName: settings.botName,
                shadowMode: settings.shadowMode,
                pilotOnly: settings.pilotOnly,
                minDaysBetweenRequests: settings.minDaysBetweenRequests,
                workStart: settings.workStart,
                workEnd: settings.workEnd,
                lookbackMaxDays: settings.lookbackMaxDays,
                aiBudgetEur: settings.aiBudgetEur,
                mailDomain: settings.mailDomain,
                mailboxAddress: settings.mailboxAddress,
                contactPerson: settings.contactPerson,
                signalRetentionMonths: settings.signalRetentionMonths,
              }}
              canManage={canManage}
              spentThisMonth={usage.costEur}
              callsThisMonth={usage.calls}
              pilotCount={pilotCount ?? 0}
            />
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-2">
                Modellen
                {ai.id === "demo" && <DemoBadge label="Demo-modus" />}
              </span>
            }
            description="Twee modellen, elk voor zijn eigen werk. Ingesteld via omgevingsvariabelen op de server."
            flush
          >
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                  <th scope="col">Werk</th>
                  <th scope="col">Model</th>
                  <th scope="col" className="hidden sm:table-cell">
                    Variabele
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.8125rem]">
                <tr className="[&>td]:px-4 [&>td]:py-2.5">
                  <td>Slack-berichten en tips beoordelen</td>
                  <td>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{env.anthropicTriageModel}</code>
                  </td>
                  <td className="hidden font-mono text-xs text-muted-foreground sm:table-cell">ANTHROPIC_TRIAGE_MODEL</td>
                </tr>
                <tr className="[&>td]:px-4 [&>td]:py-2.5">
                  <td>Interviewen, schrijven en controleren</td>
                  <td>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{env.anthropicModel}</code>
                  </td>
                  <td className="hidden font-mono text-xs text-muted-foreground sm:table-cell">ANTHROPIC_MODEL</td>
                </tr>
              </tbody>
            </table>
            {ai.id === "demo" && (
              <p className="border-t px-4 py-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                Er is geen API-sleutel ingesteld. Tot die er is doet een regelgebaseerde stand-in ({ai.model}) beide taken en kost het
                gebruik niets. De modellen hierboven worden gebruikt zodra ANTHROPIC_API_KEY is gezet.
              </p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
