import Link from "next/link";
import { format, startOfMonth } from "date-fns";
import { nl } from "date-fns/locale";
import {
  ArrowUpRight,
  CalendarPlus,
  FileText,
  ListChecks,
  Mail,
  Mic,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  ChevronDown,
} from "lucide-react";
import { runAgentJob } from "@/actions/agents";
import { prepareNewsletterAction } from "@/actions/newsletters";
import { ActionButton } from "@/components/shared/actions";
import { ActivityFeed, ACTIVITY_SELECT, type ActivityItem } from "@/components/shared/activity-feed";
import { AgentAvatar, ClassificationBadge, ContentStatusBadge, DemoBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader, Panel, StatCard } from "@/components/shared/layout";
import { aiStatus } from "@/lib/ai";
import { can, requirePagePermission } from "@/lib/auth";
import {
  CONTENT_TYPE_LABELS,
  INTERVIEW_STATUS_META,
  NEWSLETTER_STATUS_META,
  TASK_STATUS_META,
  TASK_TYPE_LABELS,
} from "@/lib/constants";
import { formatDay, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AgentKind, ContentStatus } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/workflow";
import { AGENT_MESSAGE_SELECT, AgentMessageList, type AgentMessageWithAgents } from "./agent-messages";
import { CreateSocialDraft } from "./create-social-draft";
import { OPPORTUNITY_SELECT, OpportunityCard, type OpportunityWithRelations } from "./opportunity-card";
import { SocialPostCard, type SocialPostView } from "./social-post-card";

const COPY: Record<
  AgentKind,
  { eyebrow: string; title: string; description: string; responsibilities: string[]; guardrails: string[] }
> = {
  external: {
    eyebrow: "Externe Communicatie-agent",
    title: "Extern bureau",
    description:
      "Ontdekt nieuwswaardige ontwikkelingen en klantcases, verzamelt aanvullende informatie en bereidt externe content voor. Publiceren doet altijd een mens.",
    responsibilities: [
      "Nieuwswaardige informatie herkennen",
      "Proactief kansen voor klantcases opsporen",
      "Relevante projectleiders en commerciële betrokkenen aanwijzen",
      "Vragen en interviewverzoeken voorbereiden",
      "Aanvullende informatie verzamelen, ook via de interne agent",
      "Nieuwsberichten en website-artikelen schrijven",
      "Klantcases, interviews en expertcontent maken",
      "Employer-brandingcontent maken",
      "LinkedIn- en social-concepten opstellen",
      "De maandelijkse externe nieuwsbrief voorbereiden",
      "De redactionele kalender bijhouden",
    ],
    guardrails: [
      "Gebruikt de vastgestelde merkrichtlijnen.",
      "Verzint nooit feiten, quotes, klantresultaten of cijfers.",
      "Controleert of externe publicatie is toegestaan en legt dat vast.",
      "Externe publicatie vereist expliciete menselijke goedkeuring.",
    ],
  },
  internal: {
    eyebrow: "Interne Communicatie-agent",
    title: "Intern bureau",
    description:
      "Volgt geautoriseerde interne bronnen, herkent teamprestaties, organisatienieuws en nieuwe collega's en bereidt interne updates voor. Versturen doet altijd een mens.",
    responsibilities: [
      "Geautoriseerde interne bedrijfsinformatie volgen",
      "Teamprestaties herkennen",
      "Organisatorische ontwikkelingen herkennen",
      "Nieuwe collega's signaleren en voorstelrondes voorbereiden",
      "Interne interviews afnemen",
      "Slack-aankondigingen schrijven",
      "Teamupdates maken",
      "De maandelijkse interne nieuwsbrief voorbereiden",
      "Twee keer per maand de directie interviewen",
      "Directie-interviews omzetten naar updates voor medewerkers",
      "E-mailconcepten klaarzetten voor menselijke goedkeuring",
    ],
    guardrails: [
      "Draagt verhalen die ook extern interessant zijn aan bij de externe agent.",
      "Deelt nooit interne of vertrouwelijke informatie extern zonder expliciete toestemming.",
      "Verstuurt zelf geen e-mails, Slack-berichten of nieuwsbrieven.",
    ],
  },
};

const ACTIVE_STATUSES: ContentStatus[] = PIPELINE_STAGES.filter((s) => s.key !== "published").flatMap((s) => s.statuses);

export async function AgentWorkspace({ kind }: { kind: AgentKind }) {
  const session = await requirePagePermission("content.create", "content.edit", "content.review", "content.approve");
  const db = await createClient();
  const copy = COPY[kind];
  const ai = aiStatus();

  const { data: agent } = await db.from("agents").select("*").eq("kind", kind).maybeSingle();
  if (!agent) {
    return (
      <div className="space-y-7">
        <PageHeader title={copy.title} description={copy.description} />
        <Panel>
          <EmptyState title="Agent niet gevonden" description="Voor deze organisatie is deze agent niet ingericht." />
        </Panel>
      </div>
    );
  }

  const month = startOfMonth(new Date());
  const monthKey = format(month, "yyyy-MM");
  const monthLabel = format(month, "MMMM yyyy", { locale: nl });

  const [opportunities, articles, interviews, newsletter, tasks, messages, activity, socialPosts, socialSources] = await Promise.all([
    db
      .from("content_opportunities")
      .select(OPPORTUNITY_SELECT)
      .eq("assigned_agent_id", agent.id)
      .in("status", ["proposed", "accepted", "in_progress"])
      .order("priority", { ascending: false }),
    db
      .from("articles")
      .select("id, title, status, content_type, classification, channel, updated_at, is_demo")
      .eq("agent_id", agent.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(60),
    db
      .from("interviews")
      .select("id, title, interviewee_name, interviewee_role, status, scheduled_at, completed_at, is_demo")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("newsletters")
      .select("id, title, status, subject")
      .eq("kind", kind)
      .eq("period_month", `${monthKey}-01`)
      .maybeSingle(),
    db
      .from("agent_tasks")
      .select("id, type, title, status, scheduled_for, completed_at, error")
      .eq("agent_id", agent.id)
      .order("scheduled_for", { ascending: false })
      .limit(8),
    db
      .from("agent_messages")
      .select(AGENT_MESSAGE_SELECT)
      .or(`from_agent_id.eq.${agent.id},to_agent_id.eq.${agent.id}`)
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("audit_logs")
      .select(ACTIVITY_SELECT)
      .eq("actor_agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(15),
    kind === "external"
      ? db
          .from("social_posts")
          .select(
            "id, platform, body, status, publish_at, published_at, publication_mode, generation_provider, is_demo, article:articles!social_posts_article_id_fkey(id, title)",
          )
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
    // External content with text: candidates for a new social draft.
    kind === "external"
      ? db
          .from("articles")
          .select("id, title")
          .eq("classification", "external")
          .gt("current_version", 0)
          .not("status", "in", "(archived)")
          .not("content_type", "in", "(social_post,newsletter)")
          .order("updated_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] }),
  ]);

  const opportunityRows = (opportunities.data ?? []) as unknown as OpportunityWithRelations[];
  const proposed = opportunityRows.filter((o) => o.status === "proposed");
  const inProgress = opportunityRows.filter((o) => o.status !== "proposed");
  const articleRows = articles.data ?? [];
  const activeArticles = articleRows.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const awaitingApproval = articleRows.filter((a) => a.status === "in_review").length;
  const openInterviews = (interviews.data ?? []).filter((i) => !["completed", "cancelled"].includes(i.status)).length;
  const messageRows = (messages.data ?? []) as unknown as AgentMessageWithAgents[];
  const posts = (socialPosts.data ?? []) as unknown as SocialPostView[];
  const canCreate = can(session, "content.create");
  const canManageAgents = can(session, "agents.manage");

  return (
    <div className="space-y-7">
      <PageHeader title={copy.title} description={copy.description} />

      {/* Agent header */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <AgentAvatar kind={kind} size="lg" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight">{agent.name}</h2>
                <ToneBadge tone={agent.status === "active" ? "green" : agent.status === "paused" ? "amber" : "red"} dot>
                  {agent.status === "active" ? "Actief" : agent.status === "paused" ? "Gepauzeerd" : "Fout"}
                </ToneBadge>
                {ai.id === "demo" ? <DemoBadge label="AI in demo-modus" /> : <ToneBadge tone="green">{ai.label}</ToneBadge>}
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{agent.mission}</p>
              <p className="text-xs text-muted-foreground">
                Laatste run: {agent.last_run_at ? formatRelative(agent.last_run_at) : "nog niet uitgevoerd"}
                {" · "}
                {agent.allowed_tools.length} tools · {agent.allowed_sources.length} bronnen
              </p>
            </div>
          </div>
          <Link
            href="/agents"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md border bg-background px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Rechten en configuratie
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        {agent.status !== "active" && (
          <Notice tone="warning" className="mt-4" title="Deze agent is gepauzeerd">
            Taken blijven in de wachtrij staan tot de agent weer actief is. {canManageAgents ? "Activeer de agent onder AI-agents." : "Vraag een beheerder om de agent te activeren."}
          </Notice>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Voorgestelde kansen" value={proposed.length} hint="Wachten op een besluit van de redactie" icon={Target} accent={proposed.length > 0} />
        <StatCard label="Content in bewerking" value={activeArticles.length} hint="Van onderzoek tot goedgekeurd" icon={FileText} />
        <StatCard label="Wacht op goedkeuring" value={awaitingApproval} hint="Ingediend ter review" icon={ShieldCheck} href="/editorial" />
        <StatCard label="Open interviews" value={openInterviews} hint="Aangevraagd, ingepland of bezig" icon={Mic} href="/interviews" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Panel
            title="Voorstellen"
            description="Door de agent beoordeelde signalen. Oppakken start een contentitem met de gekoppelde bronnen."
            flush
          >
            {proposed.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Geen openstaande kansen"
                description="Nieuwe kansen verschijnen hier zodra de agent een relevant signaal heeft beoordeeld."
                action={
                  <Link href="/inbox" className="text-sm font-medium underline underline-offset-4">
                    Naar de inbox
                  </Link>
                }
                className="py-9"
              />
            ) : (
              <div className="divide-y">
                {proposed.map((opportunity) => (
                  <OpportunityCard key={opportunity.id} opportunity={opportunity} canManage={canCreate} showSignal showAgent={false} />
                ))}
              </div>
            )}
          </Panel>

          {inProgress.length > 0 && (
            <Panel title="Opgepakte kansen" description="Kansen waar al een contentitem voor loopt." flush>
              <div className="divide-y">
                {inProgress.map((opportunity) => (
                  <OpportunityCard key={opportunity.id} opportunity={opportunity} canManage={canCreate} showSignal showAgent={false} />
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title="Content van deze agent"
            description="Contentitems waarvoor deze agent verantwoordelijk is, per fase van de redactionele workflow."
            flush
            actions={
              <Link href="/editorial" className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Open de redactie
              </Link>
            }
          >
            {articleRows.length === 0 ? (
              <EmptyState icon={FileText} title="Nog geen content" description="Pak een kans op om het eerste contentitem te starten." className="py-9" />
            ) : (
              <div className="divide-y">
                {PIPELINE_STAGES.map((stage) => {
                  const items = articleRows.filter((a) => stage.statuses.includes(a.status));
                  if (items.length === 0) return null;
                  return (
                    <div key={stage.key} className="py-2">
                      <p className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                        {stage.label}
                        <span className="tabular-nums">{items.length}</span>
                      </p>
                      <ul>
                        {items.slice(0, 6).map((article) => (
                          <li key={article.id}>
                            <Link
                              href={`/editorial/${article.id}`}
                              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-medium">{article.title}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {CONTENT_TYPE_LABELS[article.content_type]}, bijgewerkt {formatRelative(article.updated_at)}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {article.is_demo && <DemoBadge />}
                                {kind === "internal" && article.classification === "external" && <ClassificationBadge classification="external" />}
                                <ContentStatusBadge status={article.status} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {items.length > 6 && <p className="mt-2 text-xs text-muted-foreground">+ {items.length - 6} meer in de redactie</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {kind === "external" && (
            <Panel
              title="Social-concepten"
              description="LinkedIn- en social-concepten bij externe content. De agent schrijft een concept; plaatsen kan pas na goedkeuring."
              flush
            >
              <div className="space-y-3 border-b px-5 py-3">
                {canCreate && <CreateSocialDraft articles={socialSources.data ?? []} />}
                <Notice tone="demo" icon={Share2} title="Plaatsen is gesimuleerd">
                  Er is geen LinkedIn-koppeling verbonden. Na goedkeuring kopieer je de tekst en plaats je die handmatig; de hub legt
                  alleen vast dat de post is geplaatst.
                </Notice>
              </div>
              {posts.length === 0 ? (
                <EmptyState
                  icon={Share2}
                  title="Nog geen social-concepten"
                  description={
                    (socialSources.data ?? []).length > 0
                      ? "Kies hierboven een extern contentitem om de agent een LinkedIn-concept te laten schrijven."
                      : "Zodra er externe content met tekst is, kan de agent er een LinkedIn-concept bij schrijven."
                  }
                  className="py-9"
                />
              ) : (
                <div className="divide-y">
                  {posts.map((post) => (
                    <SocialPostCard
                      key={post.id}
                      post={post}
                      canEdit={can(session, "content.edit")}
                      canReview={can(session, "content.review")}
                      canApprove={can(session, "content.approve")}
                      canPublish={can(session, "content.publish")}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel
            title="Samenwerking tussen de agents"
            description={
              kind === "external"
                ? "Doorverwijzingen van de interne agent en informatieverzoeken die deze agent heeft gedaan."
                : "Verhalen die deze agent heeft aangedragen bij de externe agent en vragen die hij heeft beantwoord."
            }
            flush
          >
            <AgentMessageList
              messages={messageRows}
              emptyText={
                kind === "external"
                  ? "Zodra de interne agent een extern interessant verhaal aandraagt, of deze agent interne informatie opvraagt, zie je dat hier."
                  : "Zodra deze agent een verhaal doorverwijst of een informatieverzoek beantwoordt, zie je dat hier."
              }
            />
          </Panel>

          <Panel title="Recente activiteit" description="Wat deze agent heeft ontdekt, gebruikt, gegenereerd en aangevraagd." flush>
            <ActivityFeed items={(activity.data ?? []) as unknown as ActivityItem[]} emptyText="Deze agent heeft nog niets gedaan." />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel
            title={`Nieuwsbrief ${monthLabel}`}
            description={kind === "external" ? "Maandelijkse externe nieuwsbrief" : "Maandelijkse interne nieuwsbrief"}
          >
            {newsletter.data ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <MetaBadge meta={NEWSLETTER_STATUS_META} value={newsletter.data.status} dot />
                  <p className="text-sm font-medium">{newsletter.data.title}</p>
                  {newsletter.data.subject && <p className="text-xs text-muted-foreground">Onderwerp: {newsletter.data.subject}</p>}
                </div>
                <Link
                  href={`/newsletters/${newsletter.data.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Mail className="size-3.5" />
                  Open bij Edities
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Er is nog geen nieuwsbrief voor deze maand. De agent selecteert goedgekeurde en gepubliceerde content en schrijft een
                  inleiding en afsluiting als concept.
                </p>
                {canCreate ? (
                  <ActionButton
                    size="sm"
                    pendingLabel="Voorbereiden…"
                    action={prepareNewsletterAction.bind(null, { kind, month: monthKey })}
                  >
                    <Sparkles data-icon="inline-start" />
                    Nieuwsbrief voorbereiden
                  </ActionButton>
                ) : (
                  <p className="text-xs text-muted-foreground">Je hebt geen rechten om een nieuwsbrief te starten.</p>
                )}
              </div>
            )}
          </Panel>

          {kind === "internal" && (
            <Panel title="Directie-interviews" description="Twee keer per maand, als basis voor de directie-update.">
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  De agent vraagt een interview aan bij de directie en zet het op de kalender. Per halve maand wordt er één aangemaakt.
                </p>
                {canManageAgents ? (
                  <ActionButton
                    size="sm"
                    variant="outline"
                    pendingLabel="Plannen…"
                    action={runAgentJob.bind(null, { job: "leadership_interview" })}
                  >
                    <CalendarPlus data-icon="inline-start" />
                    Directie-interview plannen
                  </ActionButton>
                ) : (
                  <p className="text-xs text-muted-foreground">Alleen gebruikers met het recht ‘Agents beheren’ kunnen dit handmatig starten.</p>
                )}
              </div>
            </Panel>
          )}

          <Panel title="Interviews" flush actions={<Link href="/interviews" className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Alle interviews</Link>}>
            {(interviews.data ?? []).length === 0 ? (
              <EmptyState icon={Mic} title="Geen interviews" className="py-7" />
            ) : (
              <ul className="divide-y">
                {(interviews.data ?? []).map((interview) => (
                  <li key={interview.id}>
                    <Link href={`/interviews/${interview.id}`} className="block space-y-1 px-5 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/60">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{interview.interviewee_name}</span>
                        <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} dot />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{interview.title}</span>
                      {interview.scheduled_at && interview.status !== "completed" && (
                        <span className="block text-xs text-muted-foreground">Gepland: {formatDay(interview.scheduled_at)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Taken van deze agent" flush actions={<Link href="/agents?tab=tasks" className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Alle taken</Link>}>
            {(tasks.data ?? []).length === 0 ? (
              <EmptyState icon={ListChecks} title="Geen taken" description="Geplande en uitgevoerde taken verschijnen hier." className="py-7" />
            ) : (
              <ul className="divide-y">
                {(tasks.data ?? []).map((task) => (
                  <li key={task.id} className="space-y-1 px-5 py-3">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm leading-snug font-medium">{task.title}</span>
                      <MetaBadge meta={TASK_STATUS_META} value={task.status} dot />
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {TASK_TYPE_LABELS[task.type] ?? task.type} · {task.status === "completed" ? `afgerond ${formatDay(task.completed_at)}` : `gepland ${formatDay(task.scheduled_for)}`}
                    </span>
                    {task.error && task.status !== "completed" && <span className="block text-xs text-danger">{task.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <details className="group rounded-lg border bg-card">
            <summary className="flex h-10 list-none items-center justify-between gap-3 px-4 text-[0.8125rem] font-medium outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary [&::-webkit-details-marker]:hidden">
              Rol en spelregels van deze agent
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
            </summary>
            <div className="space-y-4 border-t px-4 py-3.5 text-[0.8125rem] leading-relaxed">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Verantwoordelijkheden</p>
                <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground">
                  {copy.responsibilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Vaste spelregels</p>
                <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground">
                  {copy.guardrails.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
