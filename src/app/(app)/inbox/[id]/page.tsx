import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleDashed,
  Copy,
  ExternalLink,
  Lightbulb,
  Link2,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { evaluateSignalAction, setSignalStatus } from "@/actions/signals";
import { ActionButton } from "@/components/shared/actions";
import { ActivityFeed, ACTIVITY_SELECT, type ActivityItem } from "@/components/shared/activity-feed";
import { AgentBadge, ContentStatusBadge, DemoBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, Field, Notice, PageHeader, Panel, RelevanceScore } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import {
  AGENT_META,
  AUDIENCE_LABELS,
  CONFIDENTIALITY_META,
  CONTENT_TYPE_LABELS,
  SIGNAL_CATEGORY_META,
  SIGNAL_STATUS_META,
  SOURCE_META,
} from "@/lib/constants";
import { formatDateTime, formatDay, truncate } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type {
  AgentKind,
  Classification,
  ContentStatus,
  ContentType,
  SignalAudience,
  SignalCategory,
  SignalEntities,
  SourceKind,
  SourceMessage,
} from "@/lib/types";
import {
  OPPORTUNITY_SELECT,
  OpportunityCard,
  type OpportunityWithRelations,
} from "../../_components/opportunity-card";
import { AddInformationDialog, CreateArticleDialog } from "./_components/signal-dialogs";

export const metadata: Metadata = { title: "Signaal" };

const DEFAULT_TYPE: Partial<Record<SignalCategory, { external: ContentType; internal: ContentType }>> = {
  customer_case: { external: "customer_case", internal: "internal_update" },
  new_employee: { external: "website_article", internal: "employee_introduction" },
  management_update: { external: "news_article", internal: "management_update" },
};

function SourceCard({ message, relation }: { message: SourceMessage; relation: "primary" | "related" }) {
  const system = SOURCE_META[message.source as SourceKind]?.label ?? message.source;
  return (
    <article className="space-y-2.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{system}</span>
        {message.channel && <span>{message.channel}</span>}
        {message.author_name && <span>· {message.author_name}</span>}
        <span>·</span>
        <time dateTime={message.occurred_at}>{formatDateTime(message.occurred_at)}</time>
        {relation === "primary" && <ToneBadge tone="blue">Primaire bron</ToneBadge>}
        {message.is_demo && <DemoBadge />}
        {message.url && (
          <a
            href={message.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
          >
            Open in {system}
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {message.title && <p className="text-sm font-medium">{message.title}</p>}
      <p
        className={
          relation === "primary"
            ? "text-[1.02rem] leading-relaxed whitespace-pre-line tracking-tight"
            : "text-sm leading-relaxed whitespace-pre-line text-muted-foreground"
        }
      >
        {message.body}
      </p>
    </article>
  );
}

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const db = await createClient();

  const { data: signal } = await db.from("content_signals").select("*").eq("id", id).maybeSingle();
  if (!signal) notFound();

  const canManage = can(session, "content.create");
  const entities = fromJson<SignalEntities>(signal.entities, {});
  const missing = fromJson<string[]>(signal.missing_information, []);

  const [sourceLinks, primaryFallback, relatedSignals, duplicateOf, duplicates, opportunities, articleLinks, activity] =
    await Promise.all([
      db
        .from("signal_sources")
        .select("relation, message:source_messages(*)")
        .eq("signal_id", signal.id)
        .order("created_at", { ascending: true }),
      // Submitters without editorial rights cannot read signal_sources, but can read their own message.
      signal.primary_source_id
        ? db.from("source_messages").select("*").eq("id", signal.primary_source_id).maybeSingle()
        : Promise.resolve({ data: null }),
      signal.related_signal_ids.length > 0
        ? db
            .from("content_signals")
            .select("id, title, category, status, relevance_score, detected_at")
            .in("id", signal.related_signal_ids)
            .order("detected_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      signal.duplicate_of_id
        ? db.from("content_signals").select("id, title").eq("id", signal.duplicate_of_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("content_signals").select("id, title, detected_at").eq("duplicate_of_id", signal.id).order("detected_at"),
      db.from("content_opportunities").select(OPPORTUNITY_SELECT).eq("signal_id", signal.id).order("created_at"),
      db
        .from("article_signals")
        .select("article:articles(id, title, status, content_type)")
        .eq("signal_id", signal.id),
      db
        .from("audit_logs")
        .select(ACTIVITY_SELECT)
        .eq("entity_type", "signal")
        .eq("entity_id", signal.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const linked = (sourceLinks.data ?? []).filter((l) => l.message) as { relation: string; message: SourceMessage }[];
  const primary =
    linked.find((l) => l.relation === "primary")?.message ?? (primaryFallback.data as SourceMessage | null) ?? null;
  const relatedSources = linked.filter((l) => l.relation === "related" && l.message.id !== primary?.id).map((l) => l.message);
  const opportunityRows = (opportunities.data ?? []) as unknown as OpportunityWithRelations[];
  const opportunityArticleIds = new Set(opportunityRows.map((o) => o.article?.id).filter(Boolean));
  const directArticles = (articleLinks.data ?? [])
    .map((l) => l.article)
    .filter((a): a is { id: string; title: string; status: ContentStatus; content_type: ContentType } => Boolean(a))
    .filter((a) => !opportunityArticleIds.has(a.id));
  const evaluatedBy = new Set(opportunityRows.map((o) => o.agent?.kind).filter(Boolean) as AgentKind[]);

  const isClosed = signal.status === "dismissed" || signal.status === "duplicate";
  const defaultClassification: Classification = signal.audience === "internal" ? "internal" : "external";
  const defaultType =
    DEFAULT_TYPE[signal.category as SignalCategory]?.[defaultClassification] ??
    (defaultClassification === "external" ? "news_article" : "internal_update");

  return (
    <div className="space-y-7">
      <Link
        href="/inbox"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
      >
        <ArrowLeft className="size-3.5" />
        Inbox
      </Link>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2 normal-case">
            <MetaBadge meta={SIGNAL_CATEGORY_META} value={signal.category} />
            <MetaBadge meta={SIGNAL_STATUS_META} value={signal.status} dot />
            {signal.is_demo && <DemoBadge />}
          </span>
        }
        title={signal.title}
        description={`Gedetecteerd ${formatDay(signal.detected_at)} · analyse door ${
          signal.detection_provider === "claude" ? "Claude" : "de regelgebaseerde demo-analyse"
        }`}
        actions={
          canManage ? (
            <>
              {!isClosed && <AddInformationDialog signalId={signal.id} missing={missing} />}
              {!isClosed && (
                <CreateArticleDialog
                  signalId={signal.id}
                  defaultTitle={signal.title}
                  defaultClassification={defaultClassification}
                  defaultType={defaultType}
                />
              )}
              {isClosed ? (
                signal.status === "dismissed" && (
                  <ActionButton variant="outline" size="sm" action={setSignalStatus.bind(null, { id: signal.id, status: "new" })}>
                    <RotateCcw data-icon="inline-start" />
                    Heropenen
                  </ActionButton>
                )
              ) : (
                <ActionButton
                  variant="ghost"
                  size="sm"
                  action={setSignalStatus.bind(null, { id: signal.id, status: "dismissed" })}
                  confirm={{
                    title: "Signaal afwijzen?",
                    description: "Het signaal verdwijnt uit de standaardweergave van de inbox. De bron blijft bewaard en je kunt het later heropenen.",
                    confirmLabel: "Afwijzen",
                    destructive: true,
                  }}
                >
                  <XCircle data-icon="inline-start" />
                  Signaal afwijzen
                </ActionButton>
              )}
            </>
          ) : undefined
        }
      />

      {signal.status === "duplicate" && duplicateOf.data && (
        <Notice tone="info" icon={Copy} title="Dit signaal is een duplicaat">
          Het gaat over hetzelfde verhaal als{" "}
          <Link href={`/inbox/${duplicateOf.data.id}`} className="font-medium underline underline-offset-2">
            {duplicateOf.data.title}
          </Link>
          . De bron van dit bericht is daar als extra context toegevoegd.
        </Notice>
      )}
      {signal.confidentiality === "confidential" && (
        <Notice tone="danger" title="Vertrouwelijk signaal">
          Dit signaal bevat vertrouwelijke informatie. De externe agent verwerkt het niet en de inhoud mag niet extern worden gedeeld.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Panel title="Samenvatting">
            <p className="text-[1.1rem] leading-relaxed tracking-tight">{signal.summary}</p>
            {signal.suggested_action && (
              <div className="mt-4 flex gap-2.5 border-t pt-3">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-muted-foreground">Voorgestelde volgende stap</p>
                  <p className="text-sm leading-relaxed">{signal.suggested_action}</p>
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title="Bron"
            description="Het oorspronkelijke bericht waaruit dit signaal is afgeleid, met herkomst en tijdstip."
            flush
          >
            {primary ? (
              <SourceCard message={primary} relation="primary" />
            ) : (
              <EmptyState title="Bron niet beschikbaar" description="Het bronbericht is verwijderd of je hebt er geen toegang toe." className="py-8" />
            )}
          </Panel>

          <Panel
            title="Gerelateerde informatie"
            description="Berichten uit andere bronnen en signalen over dezelfde klant, hetzelfde project of hetzelfde onderwerp."
            flush
          >
            {relatedSources.length === 0 && (relatedSignals.data ?? []).length === 0 && (duplicates.data ?? []).length === 0 ? (
              <EmptyState
                icon={Link2}
                title="Geen gerelateerde informatie gevonden"
                description="Er zijn geen andere berichten of signalen over hetzelfde onderwerp gevonden in de gekoppelde bronnen."
                className="py-8"
              />
            ) : (
              <div className="divide-y">
                {relatedSources.map((message) => (
                  <SourceCard key={message.id} message={message} relation="related" />
                ))}
                {(relatedSignals.data ?? []).length > 0 && (
                  <div className="space-y-2.5 px-5 py-4">
                    <p className="text-xs font-medium text-muted-foreground">Gerelateerde signalen</p>
                    <ul className="-mx-3 divide-y">
                      {(relatedSignals.data ?? []).map((related) => (
                        <li key={related.id}>
                          <Link
                            href={`/inbox/${related.id}`}
                            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-md px-3 py-2 text-sm outline-none hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="min-w-0 font-medium">{truncate(related.title, 90)}</span>
                            <span className="flex shrink-0 items-center gap-3">
                              <MetaBadge meta={SIGNAL_CATEGORY_META} value={related.category} />
                              <MetaBadge meta={SIGNAL_STATUS_META} value={related.status} dot />
                              <RelevanceScore score={related.relevance_score} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(duplicates.data ?? []).length > 0 && (
                  <div className="space-y-2.5 px-5 py-4">
                    <p className="text-xs font-medium text-muted-foreground">Samengevoegde duplicaten</p>
                    <ul className="space-y-1">
                      {(duplicates.data ?? []).map((duplicate) => (
                        <li key={duplicate.id} className="flex items-center gap-2 text-sm">
                          <Copy className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                          <Link href={`/inbox/${duplicate.id}`} className="underline-offset-2 hover:underline">
                            {duplicate.title}
                          </Link>
                          <span className="text-xs text-muted-foreground">{formatDay(duplicate.detected_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel
            title="Voorstellen"
            description="Hoe de agents dit signaal als verhaal beoordelen. Een kans oppakken start een contentitem."
            flush
            actions={
              canManage && !isClosed ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {(["internal", "external"] as const)
                    .filter((kind) => !evaluatedBy.has(kind))
                    .filter((kind) => !(kind === "external" && signal.confidentiality === "confidential"))
                    .map((kind) => (
                      <ActionButton
                        key={kind}
                        variant="outline"
                        size="sm"
                        pendingLabel="Beoordelen…"
                        action={evaluateSignalAction.bind(null, { id: signal.id, agentKind: kind })}
                      >
                        <Sparkles data-icon="inline-start" />
                        Laat {AGENT_META[kind].short.toLowerCase()} beoordelen
                      </ActionButton>
                    ))}
                </div>
              ) : undefined
            }
          >
            {opportunityRows.length === 0 && directArticles.length === 0 ? (
              <EmptyState
                icon={CircleDashed}
                title="Nog niet beoordeeld als verhaal"
                description={
                  canManage
                    ? "Laat een agent dit signaal beoordelen om een invalshoek, format en betrokkenen voorgesteld te krijgen."
                    : "De redactie heeft dit signaal nog niet opgepakt."
                }
                className="py-8"
              />
            ) : (
              <div className="divide-y">
                {opportunityRows.map((opportunity) => (
                  <OpportunityCard key={opportunity.id} opportunity={opportunity} canManage={canManage} />
                ))}
                {directArticles.length > 0 && (
                  <div className="space-y-2.5 px-5 py-4">
                    <p className="text-xs font-medium text-muted-foreground">Contentitems op basis van dit signaal</p>
                    <ul className="-mx-3 divide-y">
                      {directArticles.map((article) => (
                        <li key={article.id}>
                          <Link
                            href={`/editorial/${article.id}`}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2 text-sm outline-none hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="min-w-0">
                              <span className="block text-xs text-muted-foreground">{CONTENT_TYPE_LABELS[article.content_type]}</span>
                              <span className="font-medium">{article.title}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <ContentStatusBadge status={article.status} />
                              <ArrowUpRight className="size-3.5 text-muted-foreground" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Activiteit" description="Wat er met dit signaal is gebeurd." flush>
            <ActivityFeed
              items={(activity.data ?? []) as unknown as ActivityItem[]}
              emptyText="Nog geen activiteit vastgelegd voor dit signaal."
            />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Relevantie">
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl leading-8 font-semibold tracking-[-0.019em] tabular-nums">{signal.relevance_score}</span>
                <span className="text-xs text-muted-foreground">van 100</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-border">
                <div
                  className={
                    signal.relevance_score >= 75
                      ? "h-full rounded-full bg-foreground/75"
                      : signal.relevance_score >= 50
                        ? "h-full rounded-full bg-foreground/45"
                        : "h-full rounded-full bg-foreground/25"
                  }
                  style={{ width: `${signal.relevance_score}%` }}
                />
              </div>
              {signal.score_rationale && <p className="text-sm leading-relaxed text-muted-foreground">{signal.score_rationale}</p>}
            </div>
          </Panel>

          <Panel title="Kenmerken">
            <dl className="space-y-4">
              <Field label="Voorgestelde agent">
                <AgentBadge kind={signal.suggested_agent} />
              </Field>
              <Field label="Doelgroep">{AUDIENCE_LABELS[signal.audience as SignalAudience] ?? signal.audience}</Field>
              <Field label="Vertrouwelijkheid">
                <MetaBadge meta={CONFIDENTIALITY_META} value={signal.confidentiality} />
              </Field>
              <Field label="Klant">{entities.customer || <span className="text-muted-foreground">-</span>}</Field>
              <Field label="Project">{entities.project || <span className="text-muted-foreground">-</span>}</Field>
              <Field label="Personen">
                {entities.people && entities.people.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {entities.people.map((person) => (
                      <li key={person} className="rounded-full border bg-background px-2 py-0.5 text-xs">
                        {person}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </Field>
              <Field label="Gedetecteerd">{formatDateTime(signal.detected_at)}</Field>
            </dl>
          </Panel>

          <Panel
            title="Ontbrekende informatie"
            description={missing.length > 0 ? "Nodig voordat dit een volwaardig verhaal kan worden." : undefined}
          >
            {missing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Er ontbreekt niets volgens de analyse.</p>
            ) : (
              <ul className="space-y-2.5">
                {missing.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm leading-snug">
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.75} />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
