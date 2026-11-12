import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Eye, EyeOff, Inbox, Info, ListChecks } from "lucide-react";
import { AgentBadge, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, Notice, PageHeader, Panel, RelevanceScore } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { ORIGIN_LABELS, SIGNAL_CATEGORY_META, SIGNAL_STATUS_META, SOURCE_META } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SourceKind } from "@/lib/types";
import { OPPORTUNITY_SELECT, OpportunityCard, type OpportunityWithRelations } from "../_components/opportunity-card";
import { TipDialog } from "./_components/tip-dialog";

export const metadata: Metadata = { title: "Inbox" };

type SignalRow = {
  id: string;
  title: string;
  summary: string;
  category: string;
  audience: string;
  status: string;
  origin: string;
  emoji: string | null;
  suggested_agent: "external" | "internal";
  relevance_score: number;
  detected_at: string;
  is_demo: boolean;
  source: {
    source: string;
    channel: string | null;
    author_name: string | null;
  } | null;
};

const FILTERS: {
  key: string;
  label: string;
  match: (s: SignalRow) => boolean;
}[] = [
  { key: "all", label: "Alle signalen", match: () => true },
  {
    key: "external",
    label: "Extern",
    match: (s) => s.audience === "external" || s.audience === "both",
  },
  {
    key: "internal",
    label: "Intern",
    match: (s) => s.audience === "internal" || s.audience === "both",
  },
  {
    key: "customer_case",
    label: "Klantcases",
    match: (s) => s.category === "customer_case",
  },
  {
    key: "team_achievement",
    label: "Teamprestaties",
    match: (s) => s.category === "team_achievement",
  },
  {
    key: "new_employee",
    label: "Nieuwe collega's",
    match: (s) => s.category === "new_employee",
  },
  {
    key: "management_update",
    label: "Directie-updates",
    match: (s) => s.category === "management_update",
  },
  {
    key: "needs_info",
    label: "Meer info nodig",
    match: (s) => s.status === "needs_info",
  },
];

const HIDDEN_STATUSES = ["dismissed", "duplicate"];
/** Origins worth naming on a row: a person pointed at it or sent it in. */
const HUMAN_ORIGINS = ["emoji", "tip", "mail", "manual"];

/** The three piles of proposals. "open" is what waits for a decision. */
const PROPOSAL_VIEWS = [
  { key: "open", label: "Wacht op besluit", status: "proposed" },
  { key: "later", label: "Later", status: "snoozed" },
  { key: "afgewezen", label: "Afgewezen", status: "declined" },
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const activeKey = typeof params.filter === "string" && FILTERS.some((f) => f.key === params.filter) ? params.filter : "all";
  const showAll = params.alles === "1";
  const proposalView = PROPOSAL_VIEWS.find((v) => v.key === params.voorstellen) ?? PROPOSAL_VIEWS[0];
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");
  const canManage = can(session, "content.create");

  const db = await createClient();
  const [signalResult, proposalResult] = await Promise.all([
    db
      .from("content_signals")
      .select(
        "id, title, summary, category, audience, status, origin, emoji, suggested_agent, relevance_score, detected_at, is_demo, source:source_messages!content_signals_primary_source_id_fkey(source, channel, author_name)",
      )
      .order("detected_at", { ascending: false })
      .limit(500),
    editorial
      ? db
          .from("content_opportunities")
          .select(OPPORTUNITY_SELECT)
          .in("status", ["proposed", "snoozed", "declined"])
          .is("article_id", null)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (signalResult.error) throw new Error(signalResult.error.message);
  if (proposalResult.error) throw new Error(proposalResult.error.message);

  const all = (signalResult.data ?? []) as SignalRow[];
  const hiddenCount = all.filter((s) => HIDDEN_STATUSES.includes(s.status)).length;
  const visible = showAll ? all : all.filter((s) => !HIDDEN_STATUSES.includes(s.status));
  const activeFilter = FILTERS.find((f) => f.key === activeKey) ?? FILTERS[0];
  const signals = visible.filter(activeFilter.match);

  const allProposals = (proposalResult.data ?? []) as unknown as OpportunityWithRelations[];
  const proposals = allProposals.filter((p) => p.status === proposalView.status);

  const href = (next: { filter?: string; alles?: boolean; voorstellen?: string }) => {
    const filter = next.filter ?? activeKey;
    const alles = next.alles ?? showAll;
    const voorstellen = next.voorstellen ?? proposalView.key;
    const query = new URLSearchParams();
    if (voorstellen !== "open") query.set("voorstellen", voorstellen);
    if (filter !== "all") query.set("filter", filter);
    if (alles) query.set("alles", "1");
    const qs = query.toString();
    return qs ? `/inbox?${qs}` : "/inbox";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inbox"
        description={
          editorial
            ? "Wat de bot aan de redactie voorlegt. De bot begint zelf niets: jullie beslissen per voorstel of het wordt opgepakt, later terugkomt of wordt afgewezen."
            : "Geef nieuws of een tip door. Je ziet hier je eigen inzendingen en wat de redactie ermee doet."
        }
        actions={<TipDialog />}
      />

      {!editorial && (
        <Notice icon={Info} title="Je ziet alleen je eigen inzendingen">
          De voorstellen en de signalen uit Slack, de mailbox en andere bronnen zijn alleen zichtbaar voor de redactie. Wat je doorgeeft
          komt daar direct terecht.
        </Notice>
      )}

      {editorial && (
        <section className="min-w-0 space-y-2.5">
          <div>
            <h2 className="text-[0.9375rem] leading-6 font-semibold tracking-[-0.006em]">Voorstellen</h2>
            <p className="text-[0.8125rem] leading-snug text-muted-foreground">
              Per voorstel: wat het is, waarom het nieuws is, voor welk bureau en wie de bot wil interviewen.
            </p>
          </div>
          <FilterTabs
            active={proposalView.key}
            items={PROPOSAL_VIEWS.map((view) => ({
              key: view.key,
              label: view.label,
              href: href({ voorstellen: view.key }),
              count: allProposals.filter((p) => p.status === view.status).length,
            }))}
          />
          <Panel flush>
            {proposals.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={
                  proposalView.key === "open"
                    ? "Geen voorstellen die op een besluit wachten"
                    : proposalView.key === "later"
                      ? "Niets op later gezet"
                      : "Geen afgewezen voorstellen"
                }
                description={
                  proposalView.key === "open"
                    ? "Een nieuw voorstel verschijnt hier zodra een collega een bericht aanwijst met een emoji, een tip doorgeeft of de bot zelf iets opmerkt in een gevolgd kanaal."
                    : proposalView.key === "later"
                      ? "Een voorstel dat je op later zet, komt op de gekozen dag vanzelf terug bij de voorstellen die op een besluit wachten."
                      : "Afgewezen voorstellen blijven hier staan met de reden erbij."
                }
                className="py-9"
              />
            ) : (
              <div className="divide-y">
                {proposals.map((proposal) => (
                  <OpportunityCard key={proposal.id} opportunity={proposal} canManage={canManage} showSignal />
                ))}
              </div>
            )}
          </Panel>
        </section>
      )}

      <section className="min-w-0 space-y-2.5">
        <div>
          <h2 className="text-[0.9375rem] leading-6 font-semibold tracking-[-0.006em]">{editorial ? "Signalen" : "Mijn inzendingen"}</h2>
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">
            {editorial
              ? "Het ruwe materiaal: aangewezen berichten, tips en wat de bot zelf oppikte. Elk signaal bewaart zijn bron en tijdstip."
              : "Wat je hebt doorgegeven en wat ermee is gebeurd."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            active={activeKey}
            items={FILTERS.map((f) => ({
              key: f.key,
              label: f.label,
              href: href({ filter: f.key }),
              count: visible.filter(f.match).length,
            }))}
          />
          {hiddenCount > 0 && (
            <Link
              href={href({ alles: !showAll })}
              scroll={false}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showAll ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {showAll ? "Verberg afgewezen en duplicaten" : `Toon afgewezen en duplicaten (${hiddenCount})`}
            </Link>
          )}
        </div>

        <Panel flush>
          {signals.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={all.length === 0 ? "Nog geen signalen" : "Geen signalen in deze selectie"}
              description={
                all.length === 0
                  ? editorial
                    ? "Zodra een collega een bericht aanwijst, een tip doorgeeft of er iets binnenkomt uit een gevolgd kanaal, verschijnt het signaal hier."
                    : "Je hebt nog niets doorgegeven. Deel nieuws, een resultaat of een tip met de redactie."
                  : "Kies een ander filter om meer signalen te zien."
              }
              action={
                all.length === 0 ? (
                  <TipDialog variant="outline" />
                ) : (
                  <Link href={href({ filter: "all" })} className="text-sm font-medium underline underline-offset-4">
                    Alle signalen tonen
                  </Link>
                )
              }
            />
          ) : (
            <ul className="divide-y">
              {signals.map((signal) => (
                <li key={signal.id}>
                  <Link
                    href={`/inbox/${signal.id}`}
                    className="group grid items-center gap-x-6 gap-y-1.5 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary lg:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">{signal.title}</h3>
                      <p className="line-clamp-1 text-[0.8125rem] text-muted-foreground">{signal.summary}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="text-foreground/75">
                          {signal.source
                            ? (SOURCE_META[signal.source.source as SourceKind]?.label ?? signal.source.source)
                            : "Bron onbekend"}
                        </span>
                        {signal.source?.channel && <span>{signal.source.channel}</span>}
                        {signal.source?.author_name && <span>{signal.source.author_name}</span>}
                        {HUMAN_ORIGINS.includes(signal.origin) && (
                          <span>
                            {signal.emoji ? `${signal.emoji} ` : ""}
                            {ORIGIN_LABELS[signal.origin]}
                          </span>
                        )}
                        <time dateTime={signal.detected_at} className="tabular-nums">
                          {formatDay(signal.detected_at)}
                        </time>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 lg:flex-nowrap lg:justify-end">
                      <span className="text-xs text-muted-foreground lg:w-32 lg:text-right">
                        {SIGNAL_CATEGORY_META[signal.category as keyof typeof SIGNAL_CATEGORY_META]?.label ?? signal.category}
                      </span>
                      <span className="flex items-center gap-1.5 lg:w-52">
                        <MetaBadge meta={SIGNAL_STATUS_META} value={signal.status} />
                        {signal.is_demo && <DemoBadge />}
                      </span>
                      <AgentBadge kind={signal.suggested_agent} className="lg:w-28" />
                      <RelevanceScore score={signal.relevance_score} />
                      <ChevronRight className="hidden size-4 text-muted-foreground/60 lg:block" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}
