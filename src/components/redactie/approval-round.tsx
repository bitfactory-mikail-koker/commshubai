import { MetaBadge, ToneBadge } from "@/components/shared/badges";
import { APPROVAL_DECISION_META } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RoundItem = {
  id: string;
  kind: string;
  step: number;
  step_label: string | null;
  decision: string;
  decision_note: string | null;
  eligible_profile_ids: string[];
  decided_by: string | null;
  decided_at: string | null;
  due_at: string | null;
  quote_text: string | null;
  requested_at: string;
};

const KIND_LABEL: Record<string, string> = { quote: "Citaat", passage: "Passage", piece: "Stuk" };

const isOverdue = (row: RoundItem) => row.decision === "pending" && row.due_at !== null && new Date(row.due_at).getTime() < Date.now();

/**
 * The approval round of one version: who was asked for what, in the order of
 * the rule, and what they decided. Steps that have not started are not listed;
 * they follow from the approval rule once the step before them is complete.
 */
export function ApprovalRound({
  items,
  names,
  className,
}: {
  items: RoundItem[];
  /** Profile id → name. People the viewer may not see are left out by RLS. */
  names: Record<string, string>;
  className?: string;
}) {
  const live = items.filter((item) => item.decision !== "withdrawn");
  if (live.length === 0) return null;
  const steps = Array.from(new Set(live.map((item) => item.step))).sort((a, b) => a - b);

  return (
    <ol className={cn("space-y-4", className)}>
      {steps.map((step) => {
        const rows = live.filter((item) => item.step === step).sort((a, b) => a.requested_at.localeCompare(b.requested_at));
        return (
          <li key={step} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {step === 0 ? "Eerst" : `Stap ${step}`}
              {rows[0].kind === "piece" && rows[0].step_label ? `: ${rows[0].step_label}` : rows[0].kind === "quote" ? ": eigen citaten" : ": eigen passages"}
            </p>
            <ul className="divide-y rounded-md border">
              {rows.map((row) => {
                const who = row.eligible_profile_ids.length
                  ? row.eligible_profile_ids.map((id) => names[id] ?? "een collega").join(row.kind === "piece" ? " of " : ", ")
                  : row.kind === "piece"
                    ? "De redactie"
                    : "Geen account: de redactie legt het akkoord vast";
                const overdue = isOverdue(row);
                return (
                  <li key={row.id} className="space-y-1 px-3 py-2 text-[0.8125rem]">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 font-medium">{who}</span>
                      <span className="flex items-center gap-1.5">
                        {overdue && <ToneBadge tone="red">Termijn verstreken</ToneBadge>}
                        <MetaBadge meta={APPROVAL_DECISION_META} value={row.decision} />
                      </span>
                    </div>
                    {row.quote_text && (
                      <p className="line-clamp-2 text-muted-foreground">
                        {KIND_LABEL[row.kind]}: “{row.quote_text}”
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {row.decided_at
                        ? `${row.decided_by ? (names[row.decided_by] ?? "Iemand") : "Iemand"} besliste op ${formatDay(row.decided_at)}`
                        : `Gevraagd op ${formatDay(row.requested_at)}${row.due_at ? `, uiterlijk ${formatDay(row.due_at)}` : ""}`}
                    </p>
                    {row.decision_note && <p className="rounded-md bg-muted px-2.5 py-1.5 whitespace-pre-line">{row.decision_note}</p>}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
