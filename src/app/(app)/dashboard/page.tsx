import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileText,
  PenLine,
  Mic,
  PlayCircle,
  Radar,
  ShieldAlert,
} from "lucide-react";
import { ACTIVITY_SELECT, ActivityFeed, type ActivityItem } from "@/components/shared/activity-feed";
import { AgentAvatar, ContentStatusBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader, Panel, RelevanceScore, StatCard } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { aiStatus } from "@/lib/ai";
import { can, requireSession } from "@/lib/auth";
import {
  AGENT_META,
  CONTENT_TYPE_LABELS,
  INTERVIEW_STATUS_META,
  NEWSLETTER_STATUS_META,
  SIGNAL_CATEGORY_META,
  TASK_TYPE_LABELS,
} from "@/lib/constants";
import { env } from "@/lib/env";
import { formatDate, formatDay, formatMonth, formatRelative, toZoned } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AgentKind } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(): string {
  const hour = toZoned(new Date()).getHours();
  return hour < 12 ? "Goedemorgen" : hour < 18 ? "Goedemiddag" : "Goedenavond";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const db = await createClient();
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");
  const canDecide = can(session, "content.approve", "content.review");
  const now = new Date().toISOString();
  const firstName = session.profile.full_name.split(" ")[0];

  const [
    { count: openOpportunities },
    { data: topSignals, count: openSignals },
    { count: drafts },
    { count: inReview },
    { data: pendingApprovals },
    { data: upcomingInterviews },
    { data: upcomingCalendar },
    { data: newsletters },
    { data: activity },
    { data: agents },
    { data: tasks },
    { data: opportunities },
    { data: agentArticles },
    { data: publishedInternal },
  ] = await Promise.all([
    db.from("content_opportunities").select("id", { count: "exact", head: true }).eq("status", "proposed"),
    db
      .from("content_signals")
      .select("id, title, category, relevance_score, status, suggested_agent, detected_at, is_demo", { count: "exact" })
      .in("status", ["new", "needs_info"])
      .order("relevance_score", { ascending: false })
      .limit(5),
    db.from("articles").select("id", { count: "exact", head: true }).in("status", ["draft", "changes_requested"]),
    db.from("articles").select("id", { count: "exact", head: true }).eq("status", "in_review"),
    db
      .from("approvals")
      .select("id, entity_type, entity_id, version, requested_at, requester:profiles!approvals_requested_by_profile_id_fkey(full_name)")
      .eq("decision", "pending")
      .order("requested_at", { ascending: true })
      .limit(6),
    db
      .from("interviews")
      .select("id, title, interviewee_name, interviewee_role, status, scheduled_at, requested_at, is_demo")
      .in("status", ["requested", "scheduled", "in_progress"])
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(5),
    db
      .from("content_calendar")
      .select("id, title, entry_type, entity_type, entity_id, starts_at, classification")
      .eq("status", "planned")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(6),
    db
      .from("newsletters")
      .select("id, kind, title, status, period_month, send_at, newsletter_items(id, included)")
      .neq("status", "archived")
      .order("period_month", { ascending: false })
      .limit(6),
    db
      .from("audit_logs")
      .select(ACTIVITY_SELECT)
      .in("actor_type", ["agent", "system"])
      .order("created_at", { ascending: false })
      .limit(8),
    db.from("agents").select("id, kind, name, status, last_run_at").order("kind"),
    db
      .from("agent_tasks")
      .select("id, agent_id, type, title, status, scheduled_for")
      .in("status", ["queued", "running", "waiting_approval", "waiting_input"])
      .order("scheduled_for", { ascending: true }),
    db.from("content_opportunities").select("id, assigned_agent_id, status").in("status", ["proposed", "in_progress"]),
    db
      .from("articles")
      .select("id, agent_id, status")
      .in("status", ["research", "interview_requested", "interview_completed", "draft", "in_review", "changes_requested"]),
    db
      .from("articles")
      .select("id, title, content_type, published_at, excerpt")
      .eq("status", "published")
      .eq("classification", "internal")
      .order("published_at", { ascending: false })
      .limit(4),
  ]);

  // Titles for the pending approvals (three entity types).
  const approvalIds = (type: string) => (pendingApprovals ?? []).filter((a) => a.entity_type === type).map((a) => a.entity_id);
  const [{ data: approvalArticles }, { data: approvalNewsletters }, { data: approvalPosts }] = await Promise.all([
    approvalIds("article").length
      ? db.from("articles").select("id, title, status, content_type").in("id", approvalIds("article"))
      : Promise.resolve({ data: [] as { id: string; title: string; status: string; content_type: string }[] }),
    approvalIds("newsletter").length
      ? db.from("newsletters").select("id, title").in("id", approvalIds("newsletter"))
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    approvalIds("social_post").length
      ? db.from("social_posts").select("id, body, platform").in("id", approvalIds("social_post"))
      : Promise.resolve({ data: [] as { id: string; body: string; platform: string }[] }),
  ]);
  const approvalRows = (pendingApprovals ?? []).map((a) => {
    if (a.entity_type === "article") {
      const article = approvalArticles?.find((x) => x.id === a.entity_id);
      return { ...a, title: article?.title ?? "Contentitem", href: `/editorial/${a.entity_id}`, kind: "Contentitem" };
    }
    if (a.entity_type === "newsletter") {
      const newsletter = approvalNewsletters?.find((x) => x.id === a.entity_id);
      return { ...a, title: newsletter?.title ?? "Nieuwsbrief", href: `/newsletters/${a.entity_id}`, kind: "Nieuwsbrief" };
    }
    const post = approvalPosts?.find((x) => x.id === a.entity_id);
    return { ...a, title: post?.body.split("\n")[0] ?? "Social post", href: "/external", kind: "Social post" };
  });

  const scheduledCount = (upcomingCalendar ?? []).filter((c) => ["article", "social_post", "newsletter"].includes(c.entry_type)).length;
  const latestNewsletter = (kind: AgentKind) => (newsletters ?? []).find((n) => n.kind === kind);
  const calendarHref = (entry: { entity_type: string | null; entity_id: string | null }) =>
    entry.entity_type === "article"
      ? `/editorial/${entry.entity_id}`
      : entry.entity_type === "interview"
        ? `/interviews/${entry.entity_id}`
        : entry.entity_type === "newsletter"
          ? `/newsletters/${entry.entity_id}`
          : entry.entity_type === "social_post"
            ? "/external"
            : "/calendar";
  const ai = aiStatus();

  const metrics = [
    { label: "Nieuwe contentkansen", value: openOpportunities ?? 0, href: "/inbox" },
    { label: "Open signalen", value: openSignals ?? 0, href: "/inbox" },
    { label: "Concepten", value: drafts ?? 0, href: "/editorial?status=draft" },
    { label: "In review", value: inReview ?? 0, href: "/editorial?status=in_review" },
    {
      label: "Wacht op goedkeuring",
      value: pendingApprovals?.length ?? 0,
      href: "/editorial?status=in_review",
      flag: canDecide && (pendingApprovals?.length ?? 0) > 0,
    },
    { label: "Geplande publicaties", value: scheduledCount, href: "/calendar" },
  ];
  const rowClass = "flex items-center gap-4 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary";
  const today = formatDate(new Date(), "EEEE d MMMM yyyy");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={`${greeting()}, ${firstName}. Het is ${today}.`}
        actions={
          <>
            {editorial && env.demoMode && (
              <Button asChild variant="outline">
                <Link href="/demo">
                  <PlayCircle />
                  Demoscenario
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/inbox">
                <PenLine />
                Informatie aanleveren
              </Link>
            </Button>
          </>
        }
      />

      {params["geen-toegang"] && (
        <Notice tone="warning" icon={ShieldAlert} title="Geen toegang">
          Je rol heeft geen toegang tot die pagina. Vraag een beheerder om je rechten aan te passen als je die nodig hebt.
        </Notice>
      )}

      {editorial ? (
        <>
          <section className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6" aria-label="Kerncijfers">
            {metrics.map((metric) => (
              <StatCard key={metric.label} label={metric.label} value={metric.value} href={metric.href} accent={metric.flag} />
            ))}
          </section>

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0 space-y-8">
              <Panel
                title="Wacht op goedkeuring"
                description="Niets wordt gepubliceerd of verzonden zonder een besluit van een mens."
                flush
              >
                {approvalRows.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="Geen openstaande goedkeuringen" description="Alles wat is ingediend, is beoordeeld." />
                ) : (
                  <ul className="divide-y">
                    {approvalRows.map((row) => (
                      <li key={row.id}>
                        <Link href={row.href} className={rowClass}>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-medium sm:line-clamp-1">{row.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.kind}, versie {row.version}. Ingediend {formatRelative(row.requested_at)}
                              {row.requester ? ` door ${row.requester.full_name}` : ""}
                            </p>
                          </div>
                          <ToneBadge tone="amber">{canDecide ? "Jouw besluit" : "In behandeling"}</ToneBadge>
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Agents" description={ai.id === "demo" ? "De AI-laag draait in demo-modus: analyses en concepten zijn regelgebaseerd." : `AI-provider: ${ai.label}`} flush>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                        <th scope="col">Agent</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="hidden text-right sm:table-cell">Open kansen</th>
                        <th scope="col" className="hidden text-right sm:table-cell">In de maak</th>
                        <th scope="col" className="hidden md:table-cell">Volgende taak</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(agents ?? []).map((agent) => {
                        const agentTasks = (tasks ?? []).filter((t) => t.agent_id === agent.id);
                        const proposed = (opportunities ?? []).filter((o) => o.assigned_agent_id === agent.id && o.status === "proposed").length;
                        const inProgress = (agentArticles ?? []).filter((a) => a.agent_id === agent.id).length;
                        return (
                          <tr key={agent.id} className="[&>td]:px-4 [&>td]:py-2.5">
                            <td>
                              <Link
                                href={agent.kind === "external" ? "/external" : "/internal"}
                                className="group flex items-center gap-2.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <AgentAvatar kind={agent.kind} />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium underline-offset-2 group-hover:underline">{agent.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {agent.last_run_at ? `Laatste run ${formatRelative(agent.last_run_at)}` : "Nog niet actief geweest"}
                                  </span>
                                </span>
                              </Link>
                            </td>
                            <td>
                              <ToneBadge tone={agent.status === "active" ? "green" : agent.status === "paused" ? "amber" : "red"}>
                                {agent.status === "active" ? "Actief" : agent.status === "paused" ? "Gepauzeerd" : "Fout"}
                              </ToneBadge>
                            </td>
                            <td className="hidden text-right tabular-nums sm:table-cell">{proposed}</td>
                            <td className="hidden text-right tabular-nums sm:table-cell">{inProgress}</td>
                            <td className="hidden text-[0.8125rem] md:table-cell">
                              {agentTasks[0] ? (
                                <>
                                  <span className="block truncate">{TASK_TYPE_LABELS[agentTasks[0].type] ?? agentTasks[0].title}</span>
                                  <span className="block text-xs text-muted-foreground tabular-nums">{formatDay(agentTasks[0].scheduled_for)}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">Geen geplande taken</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel
                title="Belangrijkste signalen"
                description="Hoogste relevantie, nog niet omgezet naar content."
                actions={
                  <Button asChild variant="link" size="sm" className="h-6 px-0 text-info">
                    <Link href="/inbox">Alle signalen</Link>
                  </Button>
                }
                flush
              >
                {(topSignals ?? []).length === 0 ? (
                  <EmptyState icon={Radar} title="Geen open signalen" description="Zodra een bron iets nieuwswaardigs oplevert, verschijnt het hier." />
                ) : (
                  <ul className="divide-y">
                    {(topSignals ?? []).map((signal) => (
                      <li key={signal.id}>
                        <Link href={`/inbox/${signal.id}`} className={rowClass}>
                          <RelevanceScore score={signal.relevance_score} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{signal.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {AGENT_META[signal.suggested_agent].short}, {formatRelative(signal.detected_at)}
                            </p>
                          </div>
                          <span className="hidden text-xs text-muted-foreground sm:block">{SIGNAL_CATEGORY_META[signal.category as keyof typeof SIGNAL_CATEGORY_META]?.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Recente agentactiviteit"
                actions={
                  <Button asChild variant="link" size="sm" className="h-6 px-0 text-info">
                    <Link href="/agents">Volledig log</Link>
                  </Button>
                }
                flush
              >
                <ActivityFeed items={(activity ?? []) as unknown as ActivityItem[]} emptyText="De agents zijn nog niet actief geweest." />
              </Panel>
            </div>

            <div className="min-w-0 space-y-8">
              <Panel title="Komende interviews" flush>
                {(upcomingInterviews ?? []).length === 0 ? (
                  <EmptyState icon={Mic} title="Geen interviews gepland" className="py-8" />
                ) : (
                  <ul className="divide-y">
                    {(upcomingInterviews ?? []).map((interview) => (
                      <li key={interview.id}>
                        <Link href={`/interviews/${interview.id}`} className={rowClass}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{interview.interviewee_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {interview.scheduled_at ? formatDay(interview.scheduled_at) : `Aangevraagd ${formatRelative(interview.requested_at)}`}
                            </p>
                          </div>
                          <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Planning"
                actions={
                  <Button asChild variant="link" size="sm" className="h-6 px-0 text-info">
                    <Link href="/calendar">Kalender</Link>
                  </Button>
                }
                flush
              >
                {(upcomingCalendar ?? []).length === 0 ? (
                  <EmptyState icon={CalendarClock} title="Niets ingepland" className="py-8" />
                ) : (
                  <ul className="divide-y">
                    {(upcomingCalendar ?? []).map((entry) => (
                      <li key={entry.id}>
                        <Link href={calendarHref(entry)} className={rowClass}>
                          <span className="w-12 shrink-0 text-[0.8125rem] text-muted-foreground tabular-nums">{formatDate(entry.starts_at, "d MMM")}</span>
                          <span className="line-clamp-2 min-w-0 flex-1 font-medium">{entry.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Nieuwsbrieven" flush>
                <ul className="divide-y">
                  {(["external", "internal"] as const).map((kind) => {
                    const newsletter = latestNewsletter(kind);
                    return (
                      <li key={kind}>
                        <Link href={newsletter ? `/newsletters/${newsletter.id}` : "/newsletters"} className={rowClass}>
                          <AgentAvatar kind={kind} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{kind === "external" ? "Externe nieuwsbrief" : "Interne nieuwsbrief"}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {newsletter
                                ? `${formatMonth(newsletter.period_month)}, ${newsletter.newsletter_items.filter((i) => i.included).length} item(s)`
                                : "Nog niet voorbereid"}
                            </p>
                          </div>
                          {newsletter ? (
                            <MetaBadge meta={NEWSLETTER_STATUS_META} value={newsletter.status} />
                          ) : (
                            <ToneBadge tone="neutral">Niet gestart</ToneBadge>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      ) : (
        /* Employees: their own interviews and published internal news. */
        <div className="grid gap-8 lg:grid-cols-2">
          <Panel title="Jouw interviews" description="Interviews waarvoor je bent gevraagd." flush>
            {(upcomingInterviews ?? []).length === 0 ? (
              <EmptyState icon={Mic} title="Geen openstaande interviews" description="Als een agent je om een interview vraagt, vind je dat hier." />
            ) : (
              <ul className="divide-y">
                {(upcomingInterviews ?? []).map((interview) => (
                  <li key={interview.id}>
                    <Link href={`/interviews/${interview.id}`} className={rowClass}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{interview.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {interview.scheduled_at ? formatDay(interview.scheduled_at) : `Aangevraagd ${formatRelative(interview.requested_at)}`}
                        </p>
                      </div>
                      <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Intern nieuws" description="Gepubliceerde interne berichten." flush>
            {(publishedInternal ?? []).length === 0 ? (
              <EmptyState icon={FileText} title="Nog geen interne berichten" />
            ) : (
              <ul className="divide-y">
                {(publishedInternal ?? []).map((article) => (
                  <li key={article.id}>
                    <Link href={`/editorial/${article.id}`} className={rowClass}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{article.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {CONTENT_TYPE_LABELS[article.content_type]}, {formatDate(article.published_at)}
                        </p>
                      </div>
                      <ContentStatusBadge status="published" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
