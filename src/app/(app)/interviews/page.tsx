import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ListChecks, MessageSquareText, Mic, Send } from "lucide-react";
import { AgentBadge, ClassificationBadge, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, Notice, PageHeader, Panel, StatCard } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { INTERVIEW_KIND_LABELS, INTERVIEW_STATUS_META } from "@/lib/constants";
import { formatDate, formatDay, formatRelative } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { InterviewKind, InterviewStatus } from "@/lib/types";
import { NewInterviewDialog } from "./_components/new-interview-dialog";

export const metadata: Metadata = { title: "Interviews" };

const STATUS_FILTERS: InterviewStatus[] = ["requested", "scheduled", "in_progress", "completed", "cancelled"];

type FollowUp = { id: string; text: string; done: boolean };

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const db = await createClient();
  const canCreate = can(session, "content.create");
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");

  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const statusParam = one(params.status);
  const activeStatus = STATUS_FILTERS.includes(statusParam as InterviewStatus) ? (statusParam as InterviewStatus) : "all";
  const articleParam = one(params.artikel);
  const openNew = one(params.nieuw) === "1";

  const [{ data: interviews, error }, { data: profiles }, { data: articles }] = await Promise.all([
    db
      .from("interviews")
      .select("*, agent:agents(kind, name), article:articles!interviews_article_id_fkey(id, title)")
      .order("created_at", { ascending: false }),
    canCreate
      ? db.from("profiles").select("id, full_name, job_title").eq("is_active", true).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string; job_title: string | null }[] }),
    canCreate
      ? db
          .from("articles")
          .select("id, title, classification")
          .in("status", ["new_signal", "research", "interview_requested", "interview_completed", "draft", "changes_requested"])
          .order("updated_at", { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] as { id: string; title: string; classification: "internal" | "external" }[] }),
  ]);
  if (error) throw new Error(error.message);

  const all = interviews ?? [];
  const count = (status: InterviewStatus) => all.filter((i) => i.status === status).length;
  const visible = activeStatus === "all" ? all : all.filter((i) => i.status === activeStatus);

  const tabs = [
    { key: "all", label: "Alle", href: "/interviews", count: all.length },
    ...STATUS_FILTERS.map((status) => ({
      key: status,
      label: INTERVIEW_STATUS_META[status].label,
      href: `/interviews?status=${status}`,
      count: count(status),
    })),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Interviews"
        description="Plan interviews, laat een agent de vragen voorbereiden en het gesprek voeren, en zet de antwoorden om in een samenvatting en een concepttekst."
        actions={
          canCreate ? (
            <NewInterviewDialog
              profiles={profiles ?? []}
              articles={articles ?? []}
              defaultArticleId={articleParam ?? null}
              defaultOpen={openNew || Boolean(articleParam)}
            />
          ) : undefined
        }
      />

      {!editorial && (
        <Notice tone="info" icon={Mic} title="Je ziet alleen je eigen interviews">
          Hier staan de interviews waarvoor jij bent gevraagd. Open een interview om de vragen van de agent te beantwoorden. Je
          antwoorden gaan altijd eerst langs de redactie voordat er iets wordt gedeeld.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aangevraagd" value={count("requested")} icon={Send} href="/interviews?status=requested" hint="Wacht op de geïnterviewde" />
        <StatCard label="Ingepland" value={count("scheduled")} icon={CalendarClock} href="/interviews?status=scheduled" hint="Datum en tijd vastgelegd" />
        <StatCard label="Bezig" value={count("in_progress")} icon={MessageSquareText} href="/interviews?status=in_progress" hint="Gesprek loopt" />
        <StatCard label="Afgerond" value={count("completed")} icon={CheckCircle2} href="/interviews?status=completed" hint="Samengevat door de agent" />
      </div>

      <div className="space-y-4">
        <FilterTabs items={tabs} active={activeStatus} />
        <Panel flush>
          {visible.length === 0 ? (
            <EmptyState
              icon={Mic}
              title={all.length === 0 ? "Nog geen interviews" : "Geen interviews met deze status"}
              description={
                all.length === 0
                  ? canCreate
                    ? "Maak een interview aan of laat een agent er één aanvragen vanuit een contentkans."
                    : "Zodra je voor een interview wordt gevraagd, verschijnt het hier."
                  : "Kies een ander filter om meer interviews te zien."
              }
            />
          ) : (
            <ul className="divide-y">
              {visible.map((interview) => {
                const followUps = fromJson<FollowUp[]>(interview.follow_up_actions, []);
                const openFollowUps = followUps.filter((f) => !f.done).length;
                const date =
                  interview.status === "completed"
                    ? `Afgerond op ${formatDate(interview.completed_at)}`
                    : interview.scheduled_at
                      ? `Gepland: ${formatDay(interview.scheduled_at)}`
                      : `Aangevraagd ${formatRelative(interview.requested_at ?? interview.created_at)}`;
                return (
                  <li key={interview.id}>
                    <Link
                      href={`/interviews/${interview.id}`}
                      className="flex flex-col gap-3 px-5 py-4 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground ">
                            {INTERVIEW_KIND_LABELS[interview.kind as InterviewKind] ?? interview.kind}
                          </span>
                          {interview.is_demo && <DemoBadge />}
                        </div>
                        <p className="text-lg leading-snug font-semibold">{interview.title}</p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{interview.interviewee_name}</span>
                          {interview.interviewee_role ? ` · ${interview.interviewee_role}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-xs text-muted-foreground">
                          <ClassificationBadge classification={interview.classification} />
                          {interview.agent && <AgentBadge kind={interview.agent.kind} />}
                          {interview.article && <span className="truncate">Contentitem: {interview.article.title}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                        <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} dot />
                        <span className="text-xs text-muted-foreground">{date}</span>
                        {openFollowUps > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                            <ListChecks className="size-3.5" strokeWidth={1.75} />
                            {openFollowUps} open {openFollowUps === 1 ? "vervolgactie" : "vervolgacties"}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
