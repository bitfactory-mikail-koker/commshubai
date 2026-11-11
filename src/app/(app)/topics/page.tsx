import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquare } from "lucide-react";
import { MetaBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, PageHeader } from "@/components/shared/layout";
import { can, requirePagePermission } from "@/lib/auth";
import { CLASSIFICATION_META, CONTENT_TYPE_LABELS, INTERVIEW_STATUS_META } from "@/lib/constants";
import { formatDate, formatDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Classification, ContentStatus, ContentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadTopicLookups } from "../inbox/_components/topic-data";
import { AssignDialog } from "./_components/assign-dialog";
import { BoardFilters } from "./_components/board-filters";

export const metadata: Metadata = { title: "Onderwerpen" };

type ColumnKey = "idea" | "interview" | "draft" | "approval" | "ready" | "published";

const COLUMNS: { key: ColumnKey; label: string; empty: string }[] = [
  { key: "idea", label: "Idee", empty: "Niets in voorbereiding" },
  { key: "interview", label: "Interview", empty: "Geen interviews bezig" },
  { key: "draft", label: "Concept", empty: "Geen concepten" },
  { key: "approval", label: "Goedkeuring", empty: "Niets wacht op akkoord" },
  { key: "ready", label: "Klaar", empty: "Niets klaar voor publicatie" },
  { key: "published", label: "Gepubliceerd", empty: "Nog niets gepubliceerd" },
];

/** The column follows from the real status of the piece; nothing is dragged. */
function columnOf(status: ContentStatus | null): ColumnKey | null {
  switch (status) {
    case null:
    case "new_signal":
    case "research":
      return "idea";
    case "interview_requested":
    case "interview_completed":
      return "interview";
    case "draft":
    case "changes_requested":
      return "draft";
    case "in_review":
      return "approval";
    case "approved":
    case "scheduled":
      return "ready";
    case "published":
      return "published";
    default:
      return null; // archived
  }
}

type TopicRow = {
  id: string;
  title: string;
  suggested_content_type: ContentType;
  classification: Classification;
  project_id: string | null;
  proposed_interviewee_ids: string[];
  updated_at: string;
  article: {
    id: string;
    title: string;
    status: ContentStatus;
    publish_at: string | null;
    published_at: string | null;
    published_url: string | null;
  } | null;
};

const PUBLISHED_SHOWN = 8;

const isPast = (value: string | null) => Boolean(value && new Date(value).getTime() <= Date.now());

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission("content.create", "content.edit", "content.review", "content.approve");
  const params = await searchParams;
  const bureau = params.bureau === "intern" ? "internal" : params.bureau === "extern" ? "external" : null;
  const projectFilter = typeof params.project === "string" ? params.project : null;
  const personFilter = typeof params.persoon === "string" ? params.persoon : null;

  const db = await createClient();
  const [{ data: topicData, error }, lookups] = await Promise.all([
    db
      .from("content_opportunities")
      .select(
        "id, title, suggested_content_type, classification, project_id, proposed_interviewee_ids, updated_at, article:articles!content_opportunities_article_id_fkey(id, title, status, publish_at, published_at, published_url)",
      )
      .in("status", ["accepted", "in_progress", "converted"])
      .order("updated_at", { ascending: false })
      .limit(400),
    loadTopicLookups(),
  ]);
  if (error) throw new Error(error.message);
  const topics = (topicData ?? []) as unknown as TopicRow[];

  const articleIds = topics.map((t) => t.article?.id).filter((id): id is string => Boolean(id));
  const topicIds = topics.map((t) => t.id);
  const [{ data: interviewData }, { data: approvalData }] = await Promise.all([
    topicIds.length
      ? db
          .from("interviews")
          .select("id, status, interviewee_name, interviewee_profile_id, article_id, opportunity_id")
          .or(`opportunity_id.in.(${topicIds.join(",")})${articleIds.length ? `,article_id.in.(${articleIds.join(",")})` : ""}`)
          .neq("status", "cancelled")
      : Promise.resolve({ data: [] }),
    articleIds.length
      ? db
          .from("approvals")
          .select("entity_id, kind, step_label, eligible_profile_ids, due_at")
          .eq("entity_type", "article")
          .eq("decision", "pending")
          .in("entity_id", articleIds)
      : Promise.resolve({ data: [] }),
  ]);
  const interviews = interviewData ?? [];
  const approvals = approvalData ?? [];
  const name = (id: string) => lookups.personById.get(id)?.name ?? "Onbekend";

  const cards = topics
    .map((topic) => {
      const column = columnOf(topic.article?.status ?? null);
      if (!column) return null;
      const own = interviews.filter((i) => i.opportunity_id === topic.id || (topic.article && i.article_id === topic.article.id));
      const waiting = topic.article ? approvals.filter((a) => a.entity_id === topic.article!.id) : [];
      // Everyone this topic touches: interviewees, the people the bot proposed and those who still have to approve.
      const involved = new Set<string>([
        ...own.map((i) => i.interviewee_profile_id).filter((id): id is string => Boolean(id)),
        ...(column === "idea" ? topic.proposed_interviewee_ids : []),
        ...waiting.flatMap((a) => a.eligible_profile_ids),
      ]);
      return { topic, column, interviews: own, waiting, involved };
    })
    .filter((card) => card !== null)
    .filter((card) => !bureau || card.topic.classification === bureau)
    .filter((card) => !projectFilter || card.topic.project_id === projectFilter)
    .filter((card) => !personFilter || card.involved.has(personFilter));

  const href = (next: string | null) => {
    const query = new URLSearchParams();
    if (next) query.set("bureau", next);
    if (projectFilter) query.set("project", projectFilter);
    if (personFilter) query.set("persoon", personFilter);
    const qs = query.toString();
    return qs ? `/topics?${qs}` : "/topics";
  };

  const usedProjects = lookups.projects.filter((p) => topics.some((t) => t.project_id === p.id));
  const filtered = Boolean(bureau || projectFilter || personFilter);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Onderwerpen"
        description="Elk opgepakt onderwerp met zijn stuk, van idee tot publicatie. De kolom volgt uit de werkelijke status van het stuk; je verplaatst hier niets met de hand."
        actions={can(session, "content.create") ? <AssignDialog projects={lookups.projects.map((p) => ({ id: p.id, name: p.name }))} /> : null}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          active={bureau === "internal" ? "intern" : bureau === "external" ? "extern" : "alle"}
          items={[
            { key: "alle", label: "Beide bureaus", href: href(null) },
            { key: "intern", label: "Intern", href: href("intern") },
            { key: "extern", label: "Extern", href: href("extern") },
          ]}
        />
        <BoardFilters
          projects={usedProjects.map((p) => ({ id: p.id, name: p.name }))}
          people={lookups.people.map((p) => ({ id: p.id, name: p.name }))}
          project={projectFilter}
          person={personFilter}
        />
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={KanbanSquare}
            title={filtered ? "Geen onderwerpen in deze selectie" : "Nog geen opgepakte onderwerpen"}
            description={
              filtered
                ? "Kies een ander filter om meer onderwerpen te zien."
                : "Een onderwerp verschijnt hier zodra de redactie een voorstel uit de inbox oppakt of zelf een opdracht geeft."
            }
            action={
              filtered ? (
                <Link href="/topics" className="text-sm font-medium underline underline-offset-4">
                  Alle onderwerpen tonen
                </Link>
              ) : (
                <Link href="/inbox" className="text-sm font-medium underline underline-offset-4">
                  Naar de inbox
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-border">
          <div className="grid gap-px md:grid-cols-3 xl:grid-cols-6">
            {COLUMNS.map((column) => {
              const all = cards.filter((card) => card.column === column.key);
              const shown = column.key === "published" ? all.slice(0, PUBLISHED_SHOWN) : all;
              return (
                <section key={column.key} className="min-w-0 bg-card" aria-label={column.label}>
                  <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <h2 className="text-xs font-medium">{column.label}</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">{all.length}</span>
                  </header>
                  {shown.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">{column.empty}</p>
                  ) : (
                    <ul className="divide-y">
                      {shown.map(({ topic, interviews: own, waiting }) => {
                        const project = topic.project_id ? lookups.projectById.get(topic.project_id) : null;
                        const article = topic.article;
                        const overdue = waiting.some((a) => isPast(a.due_at));
                        // One line per kind of request: "Citaat: Tim Hoekstra", "Redactie".
                        const requests = Array.from(
                          new Map(
                            waiting.map((a) => {
                              const who = a.eligible_profile_ids.length ? a.eligible_profile_ids.map(name).join(", ") : "de redactie";
                              const what = a.kind === "quote" ? "citaat" : a.kind === "passage" ? "passage" : (a.step_label ?? "stuk").toLowerCase();
                              return [`${what}:${who}`, { who, what }];
                            }),
                          ).values(),
                        );
                        return (
                          <li key={topic.id} className="space-y-1.5 px-3 py-2.5">
                            {article ? (
                              <Link
                                href={`/editorial/${article.id}`}
                                className="block text-[0.8125rem] leading-snug font-medium outline-none hover:underline focus-visible:underline"
                              >
                                {article.title}
                              </Link>
                            ) : (
                              <p className="text-[0.8125rem] leading-snug font-medium">{topic.title}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {CONTENT_TYPE_LABELS[topic.suggested_content_type]}, {CLASSIFICATION_META[topic.classification].label.toLowerCase()}
                              {project && <span className="block truncate">{project.name}</span>}
                            </p>

                            {(column.key === "idea" || column.key === "interview") && own.length > 0 && (
                              <ul className="space-y-1">
                                {own.map((interview) => (
                                  <li key={interview.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                                    <Link href={`/interviews/${interview.id}`} className="min-w-0 truncate hover:underline">
                                      {interview.interviewee_name}
                                    </Link>
                                    <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                                  </li>
                                ))}
                              </ul>
                            )}
                            {column.key === "idea" && own.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                {topic.suggested_content_type === "social_post" ? "Geen interview nodig" : "Nog geen interview aangevraagd"}
                              </p>
                            )}
                            {column.key === "draft" && (
                              <p className="text-xs text-muted-foreground">
                                {article?.status === "changes_requested" ? "Aanpassing gevraagd; ligt bij de redactie" : "Wacht op indienen ter goedkeuring"}
                              </p>
                            )}
                            {column.key === "approval" && (
                              <div className={cn("space-y-0.5 text-xs", overdue ? "text-warning" : "text-muted-foreground")}>
                                {requests.length === 0 ? (
                                  <p>Wacht op akkoord</p>
                                ) : (
                                  requests.map((request) => (
                                    <p key={`${request.what}:${request.who}`}>
                                      Wacht op <span className={overdue ? undefined : "text-foreground"}>{request.who}</span> ({request.what})
                                    </p>
                                  ))
                                )}
                                {overdue && <p className="font-medium">Termijn verstreken: de redactie beslist</p>}
                              </div>
                            )}
                            {column.key === "ready" && (
                              <p className="text-xs text-muted-foreground">
                                {article?.status === "scheduled" && article.publish_at
                                  ? `Ingepland voor ${formatDay(article.publish_at)}`
                                  : "Klaar voor publicatie"}
                              </p>
                            )}
                            {column.key === "published" && article && (
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {formatDate(article.published_at)}
                                {article.published_url && (
                                  <>
                                    {" · "}
                                    <a href={article.published_url} target="_blank" rel="noreferrer" className="text-info underline underline-offset-2">
                                      link
                                    </a>
                                  </>
                                )}
                              </p>
                            )}

                            {article && column.key !== "idea" && column.key !== "interview" && (
                              <Link href={`/preview/article/${article.id}`} className="inline-block text-xs text-info hover:underline">
                                Preview
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {all.length > shown.length && (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                      en {all.length - shown.length} eerder gepubliceerd.{" "}
                      <Link href="/editorial?view=list" className="text-info hover:underline">
                        Alle stukken
                      </Link>
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
