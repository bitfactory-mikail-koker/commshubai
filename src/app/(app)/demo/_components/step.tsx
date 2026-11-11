import { Check } from "lucide-react";
import { AgentBadge } from "@/components/shared/badges";
import type { AgentKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export type StepState = "done" | "current" | "upcoming";

const STATE_LABELS: Record<StepState, string> = { done: "Afgerond", current: "Nu aan de beurt", upcoming: "Volgt" };

/** One step of the vertical demo stepper. */
export function Step({
  index,
  state,
  title,
  actor,
  agent,
  last = false,
  children,
}: {
  index: number;
  state: StepState;
  title: string;
  actor: string;
  agent?: AgentKind;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 sm:gap-5" aria-current={state === "current" ? "step" : undefined}>
      {/* Rail */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold tabular-nums ring-1 ring-inset",
            state === "done" && "bg-success-soft text-success ring-success/25",
            state === "current" && "bg-primary text-primary-foreground ring-primary",
            state === "upcoming" && "bg-card text-muted-foreground ring-border",
          )}
        >
          {state === "done" ? <Check className="size-4" strokeWidth={2.5} /> : index}
        </span>
        {!last && <span className={cn("my-1.5 w-px flex-1", state === "done" ? "bg-success-soft" : "bg-border")} aria-hidden />}
      </div>

      {/* Content */}
      <div className={cn("min-w-0 flex-1 space-y-3", last ? "pb-1" : "pb-8")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <h2 className={cn("text-[0.95rem] font-semibold tracking-tight", state === "upcoming" && "text-muted-foreground")}>{title}</h2>
          {agent ? <AgentBadge kind={agent} /> : <span className="text-xs font-medium text-muted-foreground">{actor}</span>}
          <span
            className={cn(
              "ml-auto text-xs font-medium",
              state === "done" && "text-success",
              state === "current" && "text-foreground",
              state === "upcoming" && "text-muted-foreground/70",
            )}
          >
            {STATE_LABELS[state]}
          </span>
        </div>
        <div
          className={cn(
            "max-w-3xl space-y-3 text-[0.875rem] leading-relaxed text-muted-foreground",
            state === "upcoming" && "opacity-70",
          )}
        >
          {children}
        </div>
      </div>
    </li>
  );
}
