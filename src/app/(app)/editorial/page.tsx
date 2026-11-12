import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Columns3, FileText, Hourglass, List, Newspaper, PenLine } from "lucide-react";
import {
  AgentBadge,
  ClassificationBadge,
  ContentStatusBadge,
  ContentTypeLabel,
  DemoBadge,
} from "@/components/shared/badges";
import { EmptyState, FilterTabs, PageHeader, Panel, StatCard, UserAvatar } from "@/components/shared/layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireSession } from "@/lib/auth";
import { channelLabel, CONTENT_STATUSES, CONTENT_TYPES } from "@/lib/constants";
import { formatDate, formatDay, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus, ContentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES } from "@/lib/workflow";
import { EditorialFilters } from "./_components/editorial-filters";
import { NewArticleDialog } from "./_components/new-article-dialog";

export const metadata: Metadata = { title: "Redactie" };

const ARTICLE_SELECT =
  "id, title, content_type, classification, channel, status, publish_at, published_at, updated_at, is_demo, current_version, reviewer_id, author_profile_id, agent:agents(kind, name), author:profiles!articles_author_profile_id_fkey(full_name, avatar_color), reviewer:profiles!articles_reviewer_id_fkey(full_name, avatar_color)";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function EditorialPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const db = await createClient();

  const view = first(sp.view) === "list" ? "list" : "board";
  const classification = ["external", "internal"].includes(first(sp.classificatie)) ? first(sp.classificatie) : "";
  const type = (CONTENT_TYPES as string[]).includes(first(sp.type)) ? (first(sp.type) as ContentType) : "";
  const status = (CONTENT_STATUSES as string[]).includes(first(sp.status)) ? (first(sp.status) as ContentStatus) : "";
  const mine = first(sp.mijn) === "1";
  const showArchived = first(sp.archief) === "1";
  const query = first(sp.q).trim().slice(0, 100);

  const canDecide = can(session, "content.approve", "content.review");
  const [{ data: rows, error }, { data: pending }] = await Promise.all([
    db.from("articles").select(ARTICLE_SELECT).order("updated_at", { ascending: false }).limit(500),
    canDecide
      ? db.from("approvals").select("entity_id").eq("entity_type", "article").eq("decision", "pending")
      : Promise.resolve({ data: [] as { entity_id: string }[] }),
  ]);
  if (error) throw new Error(error.message);

  const all = rows ?? [];
  const pendingIds = new Set((pending ?? []).map((p) => p.entity_id));
  const awaitingMe = all.filter((a) => a.status === "in_review" && (pendingIds.has(a.id) || a.reviewer_id === session.userId));

  const needle = query.toLowerCase();
  const filtered = all.filter((a) => {
    if (!showArchived && a.status === "archived" && status !== "archived") return false;
    if (classification && a.classification !== classification) return false;
    if (type && a.content_type !== type) return false;
    if (status && a.status !== status) return false;
    if (needle && !a.title.toLowerCase().includes(needle)) return false;
    if (mine && !(a.reviewer_id === session.userId || (a.status === "in_review" && pendingIds.has(a.id)))) return false;
    return true;
  });

  // URL helpers: every control keeps the other filters.
  const current: Record<string, string> = {};
  if (view === "list") current.view = "list";
  if (classification) current.classificatie = classification;
  if (type) current.type = type;
  if (status) current.status = status;
  if (mine) current.mijn = "1";
  if (showArchived) current.archief = "1";
  if (query) current.q = query;
  const href = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    return qs ? `/editorial?${qs}` : "/editorial";
  };
  // Params the client-side filter component must preserve (it manages type, status and q itself).
  const preserved = Object.fromEntries(Object.entries(current).filter(([key]) => !["type", "status", "q"].includes(key)));

  const stages = [
    ...PIPELINE_STAGES,
    ...(showArchived || status === "archived" ? [{ key: "archived", label: "Gearchiveerd", statuses: ["archived" as ContentStatus] }] : []),
  ];
  const hasFilters = Boolean(classification || type || status || mine || query);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Redactionele werkruimte"
        description="Alle contentitems van signaal tot publicatie. Elke stap naar buiten vraagt een menselijk besluit."
        actions={can(session, "content.create") ? <NewArticleDialog /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Concepten"
          value={all.filter((a) => a.status === "draft").length}
          hint="Nog niet ingediend ter review"
          icon={PenLine}
          href={href({ status: "draft", mijn: null })}
        />
        <StatCard
          label="In review"
          value={all.filter((a) => a.status === "in_review").length}
          hint="Wacht op beoordeling"
          icon={FileText}
          href={href({ status: "in_review", mijn: null })}
        />
        <StatCard
          label={can(session, "content.approve") ? "Wacht op mijn besluit" : "Aan mij toegewezen"}
          value={awaitingMe.length}
          hint={can(session, "content.approve") ? "Openstaande goedkeuringen" : "Reviews op mijn naam"}
          icon={Hourglass}
          accent={awaitingMe.length > 0}
          href={href({ mijn: "1", status: null })}
        />
        <StatCard
          label="Ingepland"
          value={all.filter((a) => a.status === "scheduled").length}
          hint="Goedgekeurd en gepland voor publicatie"
          icon={CalendarClock}
          href={href({ status: "scheduled", mijn: null })}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterTabs
            active={mine ? "mine" : classification || "all"}
            items={[
              { key: "all", label: "Alles", href: href({ classificatie: null, mijn: null }) },
              { key: "external", label: "Extern", href: href({ classificatie: "external", mijn: null }) },
              { key: "internal", label: "Intern", href: href({ classificatie: "internal", mijn: null }) },
              { key: "mine", label: "Mijn reviews", href: href({ mijn: "1", classificatie: null }), count: awaitingMe.length },
            ]}
          />
          <div className="flex items-center gap-2">
            <Link
              href={href({ archief: showArchived ? null : "1" })}
              scroll={false}
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-3 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                showArchived ? "border-foreground/40 bg-muted text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {showArchived ? "Archief verbergen" : "Archief tonen"}
            </Link>
            <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="Weergave">
              {[
                { key: "board", label: "Bord", icon: Columns3 },
                { key: "list", label: "Lijst", icon: List },
              ].map((option) => (
                <Link
                  key={option.key}
                  href={href({ view: option.key === "list" ? "list" : null })}
                  scroll={false}
                  aria-current={view === option.key ? "page" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === option.key ? "bg-secondary text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <option.icon className="size-3.5" strokeWidth={1.75} />
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <EditorialFilters
          key={`${type}|${status}|${query}`}
          params={preserved}
          type={type}
          status={status}
          query={query}
          showArchivedStatus={showArchived}
        />
      </div>

      {all.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Newspaper}
            title="Nog geen contentitems"
            description="Contentitems ontstaan wanneer een agent een kans oppakt, of wanneer je er zelf een aanmaakt."
            action={can(session, "content.create") ? <NewArticleDialog /> : undefined}
          />
        </Panel>
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Newspaper}
            title="Geen items gevonden"
            description={
              hasFilters ? "Er zijn geen contentitems die aan deze filters voldoen." : "Alle items zijn gearchiveerd. Toon het archief om ze te bekijken."
            }
            action={
              hasFilters ? (
                <Link href={view === "list" ? "/editorial?view=list" : "/editorial"} className="text-sm font-medium underline underline-offset-4">
                  Filters wissen
                </Link>
              ) : undefined
            }
          />
        </Panel>
      ) : view === "board" ? (
        <div className="board-scroll -mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" tabIndex={0} role="region" aria-label="Bord met stappen, scroll horizontaal voor meer">
          <div className="flex min-w-max gap-4">
            {stages.map((stage) => {
              const items = filtered.filter((a) => stage.statuses.includes(a.status));
              return (
                <section key={stage.key} className="flex w-72 shrink-0 flex-col gap-2.5" aria-label={stage.label}>
                  <header className="flex items-center justify-between px-1">
                    <h2 className="text-[0.8125rem] font-semibold tracking-tight">{stage.label}</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                  </header>
                  <div className="flex min-h-24 flex-col gap-2.5 rounded-lg bg-muted/60 p-2">
                    {items.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">Geen items</p>
                    ) : (
                      items.map((article) => (
                        <Link
                          key={article.id}
                          href={`/editorial/${article.id}`}
                          className="block space-y-2.5 rounded-lg border bg-card p-3 transition-colors outline-none hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <ContentTypeLabel type={article.content_type} />
                            {article.is_demo && <DemoBadge />}
                          </div>
                          <p className="text-[1.02rem] leading-snug font-semibold text-pretty tracking-tight">{article.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ContentStatusBadge status={article.status} />
                            <ClassificationBadge classification={article.classification} />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            {article.agent ? (
                              <AgentBadge kind={article.agent.kind} />
                            ) : article.author ? (
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <UserAvatar name={article.author.full_name} color={article.author.avatar_color} size="sm" />
                                <span className="truncate">{article.author.full_name}</span>
                              </span>
                            ) : (
                              <span>Geen eigenaar</span>
                            )}
                            <time dateTime={article.updated_at} className="shrink-0">
                              {article.status === "scheduled" && article.publish_at
                                ? formatDay(article.publish_at)
                                : formatRelative(article.updated_at)}
                            </time>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Panel flush>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Titel</TableHead>
                <TableHead>Classificatie</TableHead>
                <TableHead>Kanaal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verantwoordelijk</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Publicatie</TableHead>
                <TableHead className="pr-5 text-right">Bijgewerkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((article) => (
                <TableRow key={article.id}>
                  <TableCell className="max-w-md py-3 pl-5 whitespace-normal">
                    <Link
                      href={`/editorial/${article.id}`}
                      className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex items-center gap-2">
                        <ContentTypeLabel type={article.content_type} />
                        {article.is_demo && <DemoBadge />}
                      </span>
                      <span className="mt-0.5 block font-medium hover:underline hover:underline-offset-2">{article.title}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ClassificationBadge classification={article.classification} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{channelLabel(article.channel)}</TableCell>
                  <TableCell>
                    <ContentStatusBadge status={article.status} />
                  </TableCell>
                  <TableCell>
                    {article.agent ? (
                      <AgentBadge kind={article.agent.kind} />
                    ) : article.author ? (
                      <span className="inline-flex items-center gap-1.5">
                        <UserAvatar name={article.author.full_name} color={article.author.avatar_color} size="sm" />
                        {article.author.full_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {article.reviewer ? (
                      <span className="inline-flex items-center gap-1.5">
                        <UserAvatar name={article.reviewer.full_name} color={article.reviewer.avatar_color} size="sm" />
                        {article.reviewer.full_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {article.published_at
                      ? formatDate(article.published_at)
                      : article.publish_at
                        ? formatDay(article.publish_at)
                        : "-"}
                  </TableCell>
                  <TableCell className="pr-5 text-right text-muted-foreground">
                    <time dateTime={article.updated_at}>{formatRelative(article.updated_at)}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} van {all.length} contentitem(s) getoond.
        </p>
      )}
    </div>
  );
}
