import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Cpu,
  ListChecks,
  Lock,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  X,
  Zap,
} from "lucide-react";
import { runAgentJob, setAgentStatus, taskAction } from "@/actions/agents";
import { ActionButton } from "@/components/shared/actions";
import { ActivityFeed, ACTIVITY_SELECT, type ActivityItem } from "@/components/shared/activity-feed";
import { AgentAvatar, AgentBadge, DemoBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { HUMAN_GATED_ACTIONS, SOURCE_OPTIONS, TOOLS, type ToolDefinition } from "@/lib/agents/registry";
import { aiStatus } from "@/lib/ai";
import { can, requirePagePermission } from "@/lib/auth";
import { AUDIT_CATEGORY_META, RUN_STATUS_META, TASK_STATUS_META, TASK_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, formatDay, formatRelative } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { Agent, AgentKind, AuditCategory, RunStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AGENT_MESSAGE_SELECT, AgentMessageList, type AgentMessageWithAgents } from "../_components/agent-messages";
import { AgentConfigDialog } from "./_components/agent-config-dialog";

type AgentRow = Omit<Agent, "approval_requirements" | "created_at" | "updated_at" | "organization_id">;

export const metadata: Metadata = { title: "AI-agents" };

const TABS = [
  { key: "activity", label: "Activiteitenlog" },
  { key: "runs", label: "Runs" },
  { key: "tasks", label: "Taken" },
  { key: "collaboration", label: "Samenwerking" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const CATEGORY_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Alles" },
  { key: "discovered", label: "Ontdekt" },
  { key: "used", label: "Gebruikt" },
  { key: "generated", label: "Gegenereerd" },
  { key: "requested", label: "Aangevraagd" },
  { key: "performed", label: "Uitgevoerd" },
  { key: "handoff", label: "Overdracht" },
  { key: "approval", label: "Goedkeuring" },
  { key: "needs_approval", label: "Vereist goedkeuring" },
];

const PIPELINE_LABELS: Record<string, string> = {
  intelligence: "Signaaldetectie en contextverrijking",
  story_evaluation: "Verhaalbeoordeling",
  handle_referral: "Doorverwijzing verwerken",
  accept_opportunity: "Kans oppakken",
  interview_request: "Interview aanvragen",
  interview_turn: "Interviewgesprek",
  interview_summary: "Interview samenvatten",
  content_generation: "Concept schrijven",
  brand_validation: "Merkcontrole",
  social_posts: "Social posts opstellen",
  newsletter_preparation: "Nieuwsbrief voorbereiden",
  newsletter_framing: "Nieuwsbrieftekst schrijven",
  info_request: "Informatie opvragen",
  info_response: "Informatieverzoek beantwoorden",
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: "Handmatig",
  schedule: "Gepland",
  event: "Gebeurtenis",
  demo: "Demo",
};

const JOBS: { job: string; label: string; description: string }[] = [
  { job: "process_messages", label: "Bronberichten analyseren", description: "Onverwerkte berichten door de Intelligence Engine halen en nieuwe signalen laten beoordelen." },
  { job: "external_newsletter", label: "Externe nieuwsbrief voorbereiden", description: "Concept van deze maand samenstellen uit goedgekeurde externe content." },
  { job: "internal_newsletter", label: "Interne nieuwsbrief voorbereiden", description: "Concept van deze maand samenstellen uit goedgekeurde interne content." },
  { job: "leadership_interview", label: "Directie-interview plannen", description: "Het tweewekelijkse interview met de directie aanvragen." },
  { job: "tick", label: "Wachtrij en planning verwerken", description: "Terugkerende taken inplannen, geplande publicaties uitvoeren en de wachtrij afwerken." },
];

function duration(start: string, end: string | null): string {
  if (!end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${Math.max(ms, 0)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function AgentCard({ agent, canManage }: { agent: AgentRow; canManage: boolean }) {
  const kind = agent.kind;
  const config = fromJson<Record<string, unknown>>(agent.config, {});
  const available = TOOLS.filter((t) => t.availableTo.includes(kind));
  const modules = new Map<string, ToolDefinition[]>();
  for (const tool of available) modules.set(tool.module, [...(modules.get(tool.module) ?? []), tool]);
  const gated = HUMAN_GATED_ACTIONS.filter((a) => a.appliesTo.includes(kind));
  const active = agent.status === "active";

  return (
    <section className="flex flex-col rounded-lg border bg-card">
      <div className="space-y-4 border-b p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3.5">
            <AgentAvatar kind={kind} size="lg" />
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold tracking-tight">{agent.name}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
            </div>
          </div>
          <ToneBadge tone={active ? "green" : agent.status === "paused" ? "amber" : "red"} dot>
            {active ? "Actief" : agent.status === "paused" ? "Gepauzeerd" : "Fout"}
          </ToneBadge>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Opdracht</p>
          <p className="text-sm leading-relaxed">{agent.mission}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Laatste run: {agent.last_run_at ? formatRelative(agent.last_run_at) : "nog niet uitgevoerd"} · drempel relevantie{" "}
            {String(config.min_relevance_score ?? "-")} · nieuwsbrief op dag {String(config.newsletter_day_of_month ?? "-")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={kind === "external" ? "/external" : "/internal"}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[0.8125rem] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Werkruimte
              <ArrowRight className="size-3.5" />
            </Link>
            {canManage && (
              <>
                <AgentConfigDialog
                  agent={{
                    id: agent.id,
                    name: agent.name,
                    kind,
                    mission: agent.mission,
                    allowedTools: agent.allowed_tools,
                    allowedSources: agent.allowed_sources,
                    minRelevanceScore: Number(config.min_relevance_score ?? 50),
                    newsletterDay: Number(config.newsletter_day_of_month ?? 25),
                  }}
                />
                <ActionButton
                  size="sm"
                  variant={active ? "outline" : "default"}
                  action={setAgentStatus.bind(null, { id: agent.id, status: active ? "paused" : "active" })}
                  confirm={
                    active
                      ? {
                          title: `${agent.name} pauzeren?`,
                          description: "De agent voert geen taken meer uit. Geplande taken blijven in de wachtrij tot je de agent weer activeert.",
                          confirmLabel: "Pauzeren",
                        }
                      : undefined
                  }
                >
                  {active ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                  {active ? "Pauzeren" : "Activeren"}
                </ActionButton>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground ">
            Tools ({agent.allowed_tools.filter((t) => available.some((a) => a.key === t)).length} van {available.length} toegestaan)
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {[...modules.entries()].map(([module, tools]) => (
              <div key={module} className="space-y-1.5">
                <p className="text-xs font-medium">{module}</p>
                <ul className="space-y-1">
                  {tools.map((tool) => {
                    const allowed = agent.allowed_tools.includes(tool.key);
                    return (
                      <li
                        key={tool.key}
                        title={tool.description}
                        className={cn("flex items-center gap-1.5 text-[0.8125rem] leading-snug", allowed ? "text-foreground" : "text-muted-foreground/70 line-through")}
                      >
                        {allowed ? (
                          <Check className="size-3.5 shrink-0 text-success" strokeWidth={2} />
                        ) : (
                          <X className="size-3.5 shrink-0" strokeWidth={2} />
                        )}
                        {tool.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground ">Bronnen die deze agent mag lezen</p>
          <ul className="flex flex-wrap gap-1.5">
            {SOURCE_OPTIONS.map((source) => {
              const allowed = agent.allowed_sources.includes(source.key);
              return (
                <li
                  key={source.key}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    allowed ? "bg-background font-medium" : "border-dashed text-muted-foreground/70 line-through",
                  )}
                >
                  {source.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Lock className="size-3.5" strokeWidth={1.75} />
            Alleen na menselijke goedkeuring
          </p>
          <ul className="space-y-1.5">
            {gated.map((action) => (
              <li key={action.key} className="flex items-start gap-2 text-[0.8125rem] leading-snug">
                <Lock className="mt-0.5 size-3 shrink-0 text-muted-foreground" strokeWidth={2} />
                <span>
                  <span className="font-medium">{action.label}</span>
                  <span className="text-muted-foreground"> - {action.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePagePermission("agents.manage", "content.create", "content.edit", "content.review", "content.approve");
  const params = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === params.tab) ? (params.tab as TabKey) : "activity";
  const category = typeof params.cat === "string" && CATEGORY_FILTERS.some((c) => c.key === params.cat) ? params.cat : "all";
  const canManage = can(session, "agents.manage");
  const ai = aiStatus();
  const db = await createClient();

  const { data: agentRows, error } = await db.from("agents").select("allowed_sources, allowed_tools, config, description, id, kind, last_run_at, mission, name, status").order("kind", { ascending: false });
  if (error) throw new Error(error.message);
  const agents = agentRows ?? [];

  const tabHref = (key: string) => (key === "activity" ? "/agents" : `/agents?tab=${key}`);

  // Only load what the active tab shows.
  let tabContent: React.ReactNode;
  if (tab === "activity") {
    let query = db
      .from("audit_logs")
      .select(ACTIVITY_SELECT)
      .or("actor_type.in.(agent,system),category.eq.approval")
      .order("created_at", { ascending: false })
      .limit(80);
    if (category === "needs_approval") query = query.eq("requires_approval", true);
    else if (category !== "all") query = query.eq("category", category as AuditCategory);
    const { data: logs } = await query;
    tabContent = (
      <Panel
        title="Gedeeld activiteitenlog"
        description="Wat de agents en de Intelligence Engine hebben ontdekt, gebruikt, gegenereerd, aangevraagd en uitgevoerd - en wat nog op een mens wacht."
        flush
      >
        <div className="border-b px-5 py-3">
          <FilterTabs
            active={category}
            items={CATEGORY_FILTERS.map((c) => ({
              key: c.key,
              label: c.label,
              href: c.key === "all" ? "/agents" : `/agents?cat=${c.key}`,
            }))}
          />
        </div>
        <ActivityFeed
          items={(logs ?? []) as unknown as ActivityItem[]}
          emptyText={
            category === "all"
              ? "Nog geen activiteit. Voer hierboven een taak uit of lever informatie aan in de Inbox."
              : `Geen activiteit in de categorie “${category === "needs_approval" ? "Vereist goedkeuring" : (AUDIT_CATEGORY_META[category as AuditCategory]?.label ?? category)}”.`
          }
        />
      </Panel>
    );
  } else if (tab === "runs") {
    const { data: runs } = await db
      .from("agent_runs")
      .select("*, agent:agents!agent_runs_agent_id_fkey(kind, name)")
      .order("started_at", { ascending: false })
      .limit(40);
    tabContent = (
      <Panel
        title="Runs"
        description="Elke uitvoering van een pipeline, met de stappen en de gebruikte tools. Klik op een run om de stappen te zien."
        flush
      >
        {(runs ?? []).length === 0 ? (
          <EmptyState icon={Cpu} title="Nog geen runs" description="Runs verschijnen zodra een agent of de Intelligence Engine iets uitvoert." />
        ) : (
          <ul className="divide-y">
            {(runs ?? []).map((run) => {
              const steps = fromJson<RunStep[]>(run.steps, []);
              const agent = run.agent as { kind: AgentKind; name: string } | null;
              return (
                <li key={run.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 outline-none hover:bg-muted/40 focus-visible:bg-muted/60 [&::-webkit-details-marker]:hidden">
                      {agent ? (
                        <AgentAvatar kind={agent.kind} size="sm" />
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Cpu className="size-3" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 basis-56 leading-snug">
                        <span className="block text-sm font-medium">{PIPELINE_LABELS[run.pipeline] ?? run.pipeline}</span>
                        <span className="block text-xs text-muted-foreground">
                          {agent?.name ?? "Intelligence Engine"} · {formatDay(run.started_at)} · {duration(run.started_at, run.finished_at)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone="slate">{TRIGGER_LABELS[run.trigger] ?? run.trigger}</ToneBadge>
                        {run.ai_provider === "demo" ? <DemoBadge label="Demo-AI" /> : run.ai_provider ? <ToneBadge tone="green">Claude</ToneBadge> : null}
                        <MetaBadge meta={RUN_STATUS_META} value={run.status} dot />
                        <span className="text-xs text-muted-foreground tabular-nums">{steps.length} stap(pen)</span>
                        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="space-y-3 border-t bg-muted/30 px-5 py-4">
                      {run.error && (
                        <Notice tone="danger" icon={CircleAlert} title="Deze run is mislukt">
                          {run.error}
                        </Notice>
                      )}
                      {steps.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Voor deze run zijn geen stappen vastgelegd.</p>
                      ) : (
                        <ol className="space-y-2.5">
                          {steps.map((step, index) => (
                            <li key={`${step.key}-${index}`} className="flex gap-3 text-sm leading-snug">
                              <span
                                className={cn(
                                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                                  step.status === "completed" && "bg-success-soft text-success",
                                  step.status === "failed" && "bg-danger-soft text-danger",
                                  step.status === "skipped" && "bg-muted text-muted-foreground",
                                )}
                              >
                                {step.status === "completed" ? (
                                  <Check className="size-3" strokeWidth={2.5} />
                                ) : step.status === "failed" ? (
                                  <X className="size-3" strokeWidth={2.5} />
                                ) : (
                                  <SkipForward className="size-3" strokeWidth={2} />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="font-medium">{step.label}</span>
                                {step.tool && (
                                  <span className="ml-2 rounded border bg-background px-1.5 py-0.5 font-mono text-[0.68rem] text-muted-foreground">
                                    {step.tool}
                                  </span>
                                )}
                                {step.detail && <span className="block text-muted-foreground">{step.detail}</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Gestart {formatDateTime(run.started_at)}
                        {run.finished_at && ` · afgerond ${formatDateTime(run.finished_at)}`}
                      </p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    );
  } else if (tab === "tasks") {
    const { data: tasks } = await db
      .from("agent_tasks")
      .select("*, agent:agents!agent_tasks_agent_id_fkey(kind, name)")
      .order("scheduled_for", { ascending: false })
      .limit(50);
    tabContent = (
      <Panel
        title="Taken"
        description="De wachtrij met geplande en gebeurtenisgestuurde taken. Mislukte taken worden maximaal drie keer opnieuw geprobeerd."
        flush
      >
        {(tasks ?? []).length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Geen taken in de wachtrij"
            description="Terugkerende taken worden aangemaakt wanneer de planning draait. Kies ‘Wachtrij en planning verwerken’ om dat nu te doen."
          />
        ) : (
          <ul className="divide-y">
            {(tasks ?? []).map((task) => {
              const agent = task.agent as { kind: AgentKind; name: string } | null;
              return (
                <li key={task.id} className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-5 py-3.5">
                  <div className="min-w-0 flex-1 basis-64 space-y-1">
                    <p className="text-sm leading-snug font-medium">{task.title}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{TASK_TYPE_LABELS[task.type] ?? task.type}</span>
                      <span>·</span>
                      {agent ? <AgentBadge kind={agent.kind} /> : <span>Intelligence Engine</span>}
                      <span>·</span>
                      <span>
                        {task.status === "completed"
                          ? `afgerond ${formatDay(task.completed_at)}`
                          : `gepland ${formatDay(task.scheduled_for)}`}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">
                        poging {task.attempts}/{task.max_attempts}
                      </span>
                    </p>
                    {task.error && task.status !== "completed" && (
                      <p className="flex items-start gap-1.5 text-xs leading-snug text-danger">
                        <CircleAlert className="mt-0.5 size-3 shrink-0" />
                        {task.error}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <MetaBadge meta={TASK_STATUS_META} value={task.status} dot />
                    {canManage && task.status === "queued" && (
                      <>
                        <ActionButton size="sm" variant="outline" pendingLabel="Bezig…" action={taskAction.bind(null, { id: task.id, action: "run" })}>
                          <Play data-icon="inline-start" />
                          Nu uitvoeren
                        </ActionButton>
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          action={taskAction.bind(null, { id: task.id, action: "cancel" })}
                          confirm={{
                            title: "Taak annuleren?",
                            description: `“${task.title}” wordt niet uitgevoerd. Je kunt de taak later opnieuw starten.`,
                            confirmLabel: "Taak annuleren",
                            destructive: true,
                          }}
                        >
                          Annuleren
                        </ActionButton>
                      </>
                    )}
                    {canManage && ["failed", "cancelled"].includes(task.status) && (
                      <ActionButton size="sm" variant="outline" pendingLabel="Bezig…" action={taskAction.bind(null, { id: task.id, action: "retry" })}>
                        <RotateCcw data-icon="inline-start" />
                        Opnieuw proberen
                      </ActionButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    );
  } else {
    const { data: messages } = await db
      .from("agent_messages")
      .select(AGENT_MESSAGE_SELECT)
      .order("created_at", { ascending: false })
      .limit(40);
    tabContent = (
      <Panel
        title="Samenwerking tussen de agents"
        description="De interne agent draagt verhalen aan die ook extern interessant zijn; de externe agent vraagt aanvullende informatie op. Vertrouwelijke signalen worden nooit doorgezet."
        flush
      >
        <AgentMessageList messages={(messages ?? []) as unknown as AgentMessageWithAgents[]} />
      </Panel>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="AI-agents"
        description="Twee gespecialiseerde agents met elk een eigen rol, eigen rechten en eigen tools. Ze delen de intelligence-laag en de merkrichtlijnen, en leggen alles vast in één activiteitenlog."
        actions={ai.id === "demo" ? <DemoBadge label="AI in demo-modus" /> : <ToneBadge tone="green">{ai.label}</ToneBadge>}
      />

      {ai.id === "demo" && (
        <Notice tone="demo" title="De AI-laag draait in demo-modus">
          Er is geen Claude API-sleutel ingesteld. Analyses en concepten komen uit vaste regels en zijn uitsluitend opgebouwd uit
          bronmateriaal en interviewantwoorden. Stel <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> in om Claude te gebruiken.
        </Notice>
      )}

      {/* How the agents share the intelligence layer */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground" aria-label="Hoe de agents samenwerken">
        <span className="font-medium text-foreground">Bronnen</span>
        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">Intelligence Engine</span>
        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">Interne agent</span>
        <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">Externe agent</span>
        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">Redactie en goedkeuring</span>
        <span className="basis-full">
          Eén gedeelde intelligence-laag, twee agents met gescheiden verantwoordelijkheden, en altijd een mens voor het besluit.
        </span>
      </p>

      {agents.length === 0 ? (
        <Panel>
          <EmptyState title="Geen agents gevonden" description="Voor deze organisatie zijn nog geen agents ingericht." />
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} canManage={canManage} />
          ))}
        </div>
      )}

      <Panel
        title="Nu uitvoeren"
        description={
          canManage
            ? "Start een taak direct, zonder op de planning te wachten. Het resultaat verschijnt in het activiteitenlog."
            : "Alleen gebruikers met het recht ‘Agents beheren’ kunnen taken handmatig starten."
        }
        flush
      >
        <ul className="divide-y">
          {JOBS.map((job) => (
            <li key={job.job} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-medium">{job.label}</p>
                <p className="text-[0.8125rem] leading-snug text-muted-foreground">{job.description}</p>
              </div>
              <ActionButton
                size="sm"
                variant="outline"
                disabled={!canManage}
                pendingLabel="Bezig…"
                action={runAgentJob.bind(null, { job: job.job })}
              >
                <Zap data-icon="inline-start" />
                Uitvoeren
              </ActionButton>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="space-y-4">
        <nav className="flex gap-1 border-b" aria-label="Onderdelen">
          {TABS.map((item) => {
            const isActive = item.key === tab;
            return (
              <Link
                key={item.key}
                href={tabHref(item.key)}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {tabContent}
      </div>
    </div>
  );
}
