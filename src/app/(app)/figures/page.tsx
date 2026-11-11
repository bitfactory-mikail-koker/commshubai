import { subDays } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { ToneBadge } from "@/components/shared/badges";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shared/layout";
import { monthStart } from "@/lib/ai/metering";
import { requirePagePermission } from "@/lib/auth";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatMonth, formatEuro } from "@/lib/format";
import { redactieSettings } from "@/lib/redactie/settings";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cijfers" };

const PERIODS = [
  { key: "30", days: 30, label: "30 dagen" },
  { key: "90", days: 90, label: "90 dagen" },
  { key: "365", days: 365, label: "Jaar" },
] as const;

const KIND_LABELS: Record<string, string> = { piece: "Stuk of editie", quote: "Eigen citaat", passage: "Eigen passage (MD-update)" };

const TASK_LABELS: Record<string, string> = {
  analyzeMessage: "Bericht beoordelen",
  triageTip: "Tip beoordelen",
  evaluateStory: "Verhaal beoordelen",
  generateInterviewQuestions: "Interviewvragen opstellen",
  nextInterviewTurn: "Interview voeren",
  summarizeInterview: "Interview samenvatten",
  generateContent: "Concept schrijven",
  reviseContent: "Tekst aanpassen op verzoek",
  generateSocialPost: "Social post schrijven",
  generateNewsletterFraming: "Nieuwsbrief inleiden",
  composeMdUpdate: "MD-update samenstellen",
  answerInfoRequest: "Informatieverzoek beantwoorden",
};

const number = (value: number) => value.toLocaleString("nl-NL");
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "");

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A duration in the unit a person would use for it. */
function duration(ms: number | null): string {
  if (ms === null) return "Geen gegevens";
  const minutes = ms / 60_000;
  if (minutes < 1) return "Minder dan een minuut";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur`;
  return `${(hours / 24).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} dagen`;
}

/** A neutral proportion bar: a measure, not a state. */
function Bar({ part, whole, className }: { part: number; whole: number; className?: string }) {
  const width = whole > 0 ? Math.max(part > 0 ? 2 : 0, Math.min(100, (part / whole) * 100)) : 0;
  return (
    <span className={cn("block h-1 w-full overflow-hidden rounded-full bg-border", className)} aria-hidden>
      <span className="block h-full rounded-full bg-foreground/45" style={{ width: `${width}%` }} />
    </span>
  );
}

const HEAD = "border-b text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium";
const ROW = "text-[0.8125rem] [&>td]:px-4 [&>td]:py-2.5";

export default async function FiguresPage({
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
  const period = PERIODS.find((p) => p.key === params.periode) ?? PERIODS[0];
  const now = new Date();
  const since = subDays(now, period.days).toISOString();
  const settings = redactieSettings(session.organization.settings);
  const db = await createClient();

  const [signalsResult, topicsResult, declinedResult, interviewsResult, approvalsResult, usageResult] = await Promise.all([
    db.from("content_signals").select("id, origin, status").gte("detected_at", since).limit(5000),
    db.from("content_opportunities").select("id, status, article_id").gte("created_at", since).limit(5000),
    db.from("content_opportunities").select("decline_reason").eq("status", "declined").gte("updated_at", since).limit(2000),
    db.from("interviews").select("id, status, invite_choice, requested_at, completed_at").gte("requested_at", since).limit(2000),
    db.from("approvals").select("kind, decision, requested_at, decided_at, due_at, escalated_at").gte("requested_at", since).limit(5000),
    db.from("ai_usage").select("task, model, input_tokens, output_tokens, cost_eur").gte("created_at", monthStart(now).toISOString()).limit(10000),
  ]);
  for (const result of [signalsResult, topicsResult, declinedResult, interviewsResult, approvalsResult, usageResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const signals = signalsResult.data ?? [];
  const topics = topicsResult.data ?? [];
  const interviews = interviewsResult.data ?? [];
  const approvals = approvalsResult.data ?? [];
  const usage = usageResult.data ?? [];

  // --- Signals per origin -------------------------------------------------------
  const realSignals = signals.filter((s) => s.status !== "duplicate");
  const duplicates = signals.length - realSignals.length;
  const byOrigin = new Map<string, number>();
  for (const signal of realSignals) byOrigin.set(signal.origin, (byOrigin.get(signal.origin) ?? 0) + 1);
  const origins = [...byOrigin.entries()].sort((a, b) => b[1] - a[1]);

  // --- From signal to publication -------------------------------------------------
  const articleIds = topics.map((t) => t.article_id).filter((id): id is string => Boolean(id));
  const { data: articles } = articleIds.length
    ? await db.from("articles").select("id, status").in("id", articleIds)
    : { data: [] as { id: string; status: string }[] };
  const articleStatus = new Map((articles ?? []).map((a) => [a.id, a.status]));
  const pickedUp = topics.filter((t) => t.article_id).length;
  const ready = topics.filter((t) => t.article_id && ["approved", "scheduled", "published"].includes(articleStatus.get(t.article_id) ?? "")).length;
  const published = topics.filter((t) => t.article_id && articleStatus.get(t.article_id) === "published").length;
  const funnel = [
    { label: "Signalen", hint: "Opgevangen, zonder duplicaten", value: realSignals.length },
    { label: "Voorstellen", hint: "Voorgelegd aan de redactie", value: topics.length },
    { label: "Opgepakt", hint: "De redactie startte een stuk", value: pickedUp },
    { label: "Klaar voor publicatie", hint: "Alle akkoorden binnen", value: ready },
    { label: "Gepubliceerd", hint: "Door een mens geplaatst", value: published },
  ];
  const funnelMax = Math.max(...funnel.map((step) => step.value));
  const waiting = topics.filter((t) => t.status === "proposed" || t.status === "snoozed").length;

  // --- Decline reasons -------------------------------------------------------------
  const reasons = new Map<string, number>();
  for (const row of declinedResult.data ?? []) {
    const reason = row.decline_reason?.trim() || "Geen reden opgegeven";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const declinedTotal = declinedResult.data?.length ?? 0;
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // --- Interviews: how fast people react ---------------------------------------------
  const interviewIds = interviews.map((i) => i.id);
  const { data: answers } = interviewIds.length
    ? await db.from("interview_messages").select("interview_id, created_at").eq("role", "interviewee").in("interview_id", interviewIds).order("created_at", { ascending: true }).limit(10000)
    : { data: [] as { interview_id: string; created_at: string }[] };
  const firstAnswer = new Map<string, string>();
  for (const answer of answers ?? []) if (!firstAnswer.has(answer.interview_id)) firstAnswer.set(answer.interview_id, answer.created_at);
  const reactionTimes: number[] = [];
  let reacted = 0;
  let declinedInvites = 0;
  let noReply = 0;
  for (const interview of interviews) {
    const first = firstAnswer.get(interview.id) ?? interview.completed_at;
    if (first && interview.requested_at) {
      reacted++;
      reactionTimes.push(Math.max(0, new Date(first).getTime() - new Date(interview.requested_at).getTime()));
    } else if (interview.invite_choice === "declined" || interview.invite_choice === "redirect") {
      declinedInvites++;
    } else if (interview.status !== "cancelled") {
      noReply++;
    }
  }
  const reactionMedian = median(reactionTimes);

  // --- Approvals: how long a decision takes ---------------------------------------------
  const kinds = ["piece", "quote", "passage"].map((kind) => {
    const rows = approvals.filter((a) => a.kind === kind && a.decision !== "withdrawn");
    const decided = rows.filter((a) => a.decided_at && a.decision !== "pending");
    const open = rows.filter((a) => a.decision === "pending");
    const overdue = rows.filter((a) => a.escalated_at || (a.decision === "pending" && a.due_at && new Date(a.due_at) < now)).length;
    return {
      kind,
      total: rows.length,
      decided: decided.length,
      open: open.length,
      overdue,
      median: median(decided.map((a) => new Date(a.decided_at as string).getTime() - new Date(a.requested_at).getTime())),
    };
  });
  const allDecided = approvals.filter((a) => a.decided_at && !["pending", "withdrawn"].includes(a.decision));
  const approvalMedian = median(allDecided.map((a) => new Date(a.decided_at as string).getTime() - new Date(a.requested_at).getTime()));
  const approvalsTotal = kinds.reduce((sum, k) => sum + k.total, 0);
  const overdueTotal = kinds.reduce((sum, k) => sum + k.overdue, 0);

  // --- AI usage this month ------------------------------------------------------------------
  const usageRows = new Map<string, { task: string; model: string; calls: number; input: number; output: number; cost: number }>();
  for (const row of usage) {
    const key = `${row.task}|${row.model}`;
    const entry = usageRows.get(key) ?? { task: row.task, model: row.model, calls: 0, input: 0, output: 0, cost: 0 };
    entry.calls++;
    entry.input += row.input_tokens;
    entry.output += row.output_tokens;
    entry.cost += Number(row.cost_eur);
    usageRows.set(key, entry);
  }
  const usageList = [...usageRows.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  const cost = usageList.reduce((sum, row) => sum + row.cost, 0);
  const calls = usage.length;
  const ceiling = settings.aiBudgetEur;
  const overCeiling = ceiling > 0 && cost >= ceiling;
  const onlyDemo = usageList.length > 0 && usageList.every((row) => row.model === "demo-regels");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cijfers"
        description="Wat er binnenkomt, wat ervan terechtkomt en hoe lang mensen erover doen. Bij kleine aantallen zegt een percentage weinig; daarom staat het aantal er altijd bij."
        actions={
          <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="Periode">
            {PERIODS.map((option) => (
              <Link
                key={option.key}
                href={option.key === "30" ? "/figures" : `/figures?periode=${option.key}`}
                scroll={false}
                aria-current={period.key === option.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  period.key === option.key ? "bg-secondary text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Signalen" value={number(realSignals.length)} hint={duplicates ? `${duplicates} ${duplicates === 1 ? "duplicaat" : "duplicaten"} niet meegeteld` : `Laatste ${period.days} dagen`} />
        <StatCard label="Voorstellen" value={number(topics.length)} hint={waiting ? `${waiting} wachten op de redactie` : "Geen wachtende voorstellen"} href="/inbox" />
        <StatCard
          label="Gepubliceerd"
          value={number(published)}
          hint={topics.length ? `${percent(published, topics.length)} van de voorstellen` : "Nog geen voorstellen"}
        />
        <StatCard
          label="Reactie op interview"
          value={reactionMedian === null ? "-" : duration(reactionMedian)}
          hint={reactionMedian === null ? "Geen gegevens" : `Mediaan over ${reacted} interview(s)`}
        />
        <StatCard
          label="Duur van een akkoord"
          value={approvalMedian === null ? "-" : duration(approvalMedian)}
          hint={approvalMedian === null ? "Geen gegevens" : `Mediaan over ${allDecided.length} besluit(en)`}
        />
        <StatCard
          label={`AI-kosten ${formatMonth(now)}`}
          value={formatEuro(cost)}
          hint={ceiling > 0 ? `Plafond ${formatEuro(ceiling)}` : "Geen plafond ingesteld"}
          href="/bot?weergave=instellingen"
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Van signaal tot publicatie" description={`Signalen en voorstellen uit de laatste ${period.days} dagen, en hoe ver ze nu zijn.`} flush>
          {funnelMax === 0 ? (
            <EmptyState title="Geen gegevens" description="In deze periode is er niets opgevangen of voorgesteld." />
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className={HEAD}>
                  <th scope="col">Stap</th>
                  <th scope="col" className="text-right">
                    Aantal
                  </th>
                  <th scope="col" className="hidden text-right sm:table-cell">
                    Van de vorige stap
                  </th>
                  <th scope="col" className="hidden w-32 md:table-cell">
                    <span className="sr-only">Verhouding</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {funnel.map((step, index) => {
                  const previous = index > 0 ? funnel[index - 1].value : 0;
                  return (
                    <tr key={step.label} className={ROW}>
                      <td>
                        <span className="block text-sm font-medium">{step.label}</span>
                        <span className="block text-xs text-muted-foreground">{step.hint}</span>
                      </td>
                      <td className="text-right text-sm font-medium tabular-nums">{number(step.value)}</td>
                      <td className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                        {/* A signal can lead to several proposals, so that step is not a share of the one before. */}
                        {index < 2 ? "" : previous > 0 ? `${percent(step.value, previous)} (${step.value} van ${previous})` : "Geen gegevens"}
                      </td>
                      <td className="hidden md:table-cell">
                        <Bar part={step.value} whole={funnelMax} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {funnelMax > 0 && (
            <p className="border-t px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Een signaal kan meer dan één voorstel opleveren (één per bureau), en een opdracht van de redactie is een voorstel zonder
              signaal. De stappen na “Voorstellen” tellen de voorstellen uit deze periode.
            </p>
          )}
        </Panel>

        <Panel title="Waar signalen vandaan komen" description={`${number(realSignals.length)} signalen in de laatste ${period.days} dagen.`} flush>
          {origins.length === 0 ? (
            <EmptyState title="Geen gegevens" description="In deze periode zijn er geen signalen opgevangen." />
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className={HEAD}>
                  <th scope="col">Herkomst</th>
                  <th scope="col" className="text-right">
                    Aantal
                  </th>
                  <th scope="col" className="text-right">
                    Aandeel
                  </th>
                  <th scope="col" className="hidden w-32 sm:table-cell">
                    <span className="sr-only">Verhouding</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {origins.map(([origin, count]) => (
                  <tr key={origin} className={ROW}>
                    <td className="text-sm">{ORIGIN_LABELS[origin] ?? origin}</td>
                    <td className="text-right text-sm font-medium tabular-nums">{number(count)}</td>
                    <td className="text-right text-muted-foreground tabular-nums">{percent(count, realSignals.length)}</td>
                    <td className="hidden sm:table-cell">
                      <Bar part={count} whole={origins[0][1]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Waarom voorstellen worden afgewezen" description={`${number(declinedTotal)} afgewezen in de laatste ${period.days} dagen.`} flush>
          {topReasons.length === 0 ? (
            <EmptyState title="Geen gegevens" description="In deze periode is er geen voorstel afgewezen." />
          ) : (
            <ol className="divide-y">
              {topReasons.map(([reason, count]) => (
                <li key={reason} className="flex items-baseline justify-between gap-6 px-4 py-2.5">
                  <span className="min-w-0 text-[0.8125rem] leading-relaxed text-pretty">{reason}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {number(count)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">keer</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Interviews" description={`${number(interviews.length)} uitgenodigd in de laatste ${period.days} dagen.`} flush>
          {interviews.length === 0 ? (
            <EmptyState title="Geen gegevens" description="In deze periode is er niemand uitgenodigd voor een interview." />
          ) : (
            <dl className="divide-y">
              {[
                {
                  label: "Mediane tijd tot de eerste reactie",
                  value: duration(reactionMedian),
                  hint: reacted ? `Van uitnodiging tot het eerste antwoord, over ${reacted} interview(s)` : "Nog niemand heeft gereageerd",
                },
                { label: "Gereageerd", value: `${number(reacted)} van ${number(interviews.length)}`, hint: percent(reacted, interviews.length) },
                { label: "Nog geen reactie", value: number(noReply), hint: "De bot stuurt één herinnering; daarna beslist de redactie" },
                { label: "Nee gezegd of doorverwezen", value: number(declinedInvites), hint: "De bot vraagt het niet opnieuw" },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-6 px-4 py-2.5">
                  <dt className="min-w-0">
                    <span className="block text-[0.8125rem]">{row.label}</span>
                    {row.hint && <span className="block text-xs text-muted-foreground">{row.hint}</span>}
                  </dt>
                  <dd className="shrink-0 text-sm font-medium tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>

      <Panel
        title="Goedkeuringen"
        description={`${number(approvalsTotal)} verzoeken in de laatste ${period.days} dagen, ${number(overdueTotal)} over de termijn.`}
        flush
      >
        {approvalsTotal === 0 ? (
          <EmptyState title="Geen gegevens" description="In deze periode is er niets ter goedkeuring voorgelegd." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className={HEAD}>
                  <th scope="col">Soort akkoord</th>
                  <th scope="col" className="text-right">
                    Gevraagd
                  </th>
                  <th scope="col" className="text-right">
                    Besloten
                  </th>
                  <th scope="col" className="text-right">
                    Open
                  </th>
                  <th scope="col" className="text-right">
                    Over de termijn
                  </th>
                  <th scope="col" className="text-right">
                    Mediane duur
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {kinds.map((row) => (
                  <tr key={row.kind} className={cn(ROW, row.total === 0 && "text-muted-foreground")}>
                    <td className="text-sm whitespace-nowrap">{KIND_LABELS[row.kind]}</td>
                    <td className="text-right tabular-nums">{number(row.total)}</td>
                    <td className="text-right tabular-nums">{number(row.decided)}</td>
                    <td className="text-right tabular-nums">{number(row.open)}</td>
                    <td className="text-right tabular-nums">
                      {row.overdue > 0 ? <span className="font-medium text-warning">{number(row.overdue)}</span> : number(row.overdue)}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">{row.decided === 0 ? "Geen gegevens" : duration(row.median)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {approvalsTotal > 0 && (
          <p className="border-t px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
            De duur loopt van het verzoek tot het besluit. Ingetrokken verzoeken tellen niet mee. Over de termijn betekent dat de
            deadline is verstreken zonder besluit; de redactie is dan ingelicht.
          </p>
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            AI-gebruik in {formatMonth(now)}
            {overCeiling && <ToneBadge tone="red">Plafond bereikt</ToneBadge>}
          </span>
        }
        description={
          ceiling > 0
            ? `${formatEuro(cost)} van ${formatEuro(ceiling)} gebruikt in ${number(calls)} aanroepen. Een schatting op basis van tokens.`
            : `${formatEuro(cost)} gebruikt in ${number(calls)} aanroepen. Er is geen plafond ingesteld.`
        }
        flush
      >
        {usageList.length === 0 ? (
          <EmptyState title="Geen gegevens" description="Deze maand is er nog geen model aangeroepen." />
        ) : (
          <>
            {ceiling > 0 && (
              <div className="border-b px-4 py-3">
                <span className="block h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden>
                  <span
                    className={cn("block h-full rounded-full", overCeiling ? "bg-danger-solid" : "bg-foreground/45")}
                    style={{ width: `${Math.min(100, cost > 0 ? Math.max(1, (cost / ceiling) * 100) : 0)}%` }}
                  />
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className={HEAD}>
                    <th scope="col">Taak</th>
                    <th scope="col">Model</th>
                    <th scope="col" className="text-right">
                      Aanroepen
                    </th>
                    <th scope="col" className="hidden text-right sm:table-cell">
                      Tokens in
                    </th>
                    <th scope="col" className="hidden text-right sm:table-cell">
                      Tokens uit
                    </th>
                    <th scope="col" className="text-right">
                      Kosten
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usageList.map((row) => (
                    <tr key={`${row.task}|${row.model}`} className={ROW}>
                      <td className="text-sm whitespace-nowrap">{TASK_LABELS[row.task] ?? row.task}</td>
                      <td>
                        <code className="font-mono text-xs text-muted-foreground">{row.model}</code>
                      </td>
                      <td className="text-right tabular-nums">{number(row.calls)}</td>
                      <td className="hidden text-right tabular-nums sm:table-cell">{number(row.input)}</td>
                      <td className="hidden text-right tabular-nums sm:table-cell">{number(row.output)}</td>
                      <td className="text-right tabular-nums">{formatEuro(row.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t text-[0.8125rem] font-medium [&>td]:px-4 [&>td]:py-2.5">
                    <td colSpan={2}>Totaal</td>
                    <td className="text-right tabular-nums">{number(calls)}</td>
                    <td className="hidden text-right tabular-nums sm:table-cell">{number(usageList.reduce((sum, r) => sum + r.input, 0))}</td>
                    <td className="hidden text-right tabular-nums sm:table-cell">{number(usageList.reduce((sum, r) => sum + r.output, 0))}</td>
                    <td className="text-right tabular-nums">{formatEuro(cost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {onlyDemo && (
              <p className="border-t px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
                Alle aanroepen gingen naar de regelgebaseerde stand-in (demo-regels): er is geen API-sleutel ingesteld, dus er zijn geen
                tokens verbruikt en geen kosten gemaakt.
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
