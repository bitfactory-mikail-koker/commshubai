"use client";

import { toggleFollowUp } from "@/actions/interviews";
import { useAction } from "@/components/shared/actions";
import { EmptyState } from "@/components/shared/layout";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type FollowUp = { id: string; text: string; done: boolean };

export function FollowUps({ interviewId, items, canEdit }: { interviewId: string; items: FollowUp[]; canEdit: boolean }) {
  const { run, pending } = useAction();

  if (items.length === 0) {
    return <EmptyState title="Geen vervolgacties" description="De agent heeft geen open punten gevonden in dit interview." className="py-6" />;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const inputId = `follow-up-${item.id}`;
        return (
          <li key={item.id} className="flex items-start gap-2.5">
            <Checkbox
              id={inputId}
              checked={item.done}
              disabled={!canEdit || pending}
              onCheckedChange={(checked) =>
                run(() => toggleFollowUp({ id: interviewId, followUpId: item.id, done: checked === true }), { silent: true })
              }
              className="mt-0.5"
            />
            <label
              htmlFor={inputId}
              className={cn("text-sm leading-relaxed", item.done && "text-muted-foreground line-through", canEdit && "cursor-pointer")}
            >
              {item.text}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
