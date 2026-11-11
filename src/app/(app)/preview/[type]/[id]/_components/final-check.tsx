"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { recordFinalCheck } from "@/actions/topics";
import { SubmitButton, useAction } from "@/components/shared/actions";
import { Checkbox } from "@/components/ui/checkbox";
import type { TracedBlock } from "@/lib/redactie/sources";
import { cn } from "@/lib/utils";

/**
 * The final check of a piece that came from an internal topic: every sentence
 * is ticked off by a person before the check can be recorded.
 */
export function FinalCheck({ articleId, sentences }: { articleId: string; sentences: TracedBlock[] }) {
  const { run, pending } = useAction();
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const all = checked.size === sentences.length;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordFinalCheck({ articleId }));
      }}
    >
      <ul className="divide-y rounded-md border">
        {sentences.map((sentence, index) => (
          <li key={index}>
            <label
              htmlFor={`sentence-${index}`}
              className={cn("flex items-start gap-2.5 px-3 py-2 text-[0.8125rem] leading-relaxed", sentence.internalOnly && "bg-warning-soft/45")}
            >
              <Checkbox
                id={`sentence-${index}`}
                className="mt-0.5"
                checked={checked.has(index)}
                onCheckedChange={(value) =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (value) next.add(index);
                    else next.delete(index);
                    return next;
                  })
                }
              />
              <span className="min-w-0">
                {sentence.text}
                {sentence.internalOnly && (
                  <span className="mt-0.5 block text-xs font-medium text-warning">Steunt op een interne bron: {sentence.sources.join(", ")}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} size="sm" disabled={!all}>
          <ShieldCheck />
          Eindcontrole vastleggen
        </SubmitButton>
        <span className="text-xs text-muted-foreground tabular-nums">
          {checked.size} van {sentences.length} zinnen nagelopen
        </span>
      </div>
    </form>
  );
}
