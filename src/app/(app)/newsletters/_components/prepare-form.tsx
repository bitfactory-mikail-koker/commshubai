"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { prepareNewsletterAction } from "@/actions/newsletters";
import { useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentKind } from "@/lib/types";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function PrepareNewsletterForm({ kind }: { kind: AgentKind }) {
  const { run, pending } = useAction();
  const [month, setMonth] = useState(currentMonth);
  const inputId = `newsletter-month-${kind}`;

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => prepareNewsletterAction({ kind, month }), {
          redirectTo: (result) => `/newsletters/${result.data.id}`,
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="text-[0.8125rem] font-medium">
          Maand
        </Label>
        <Input
          id={inputId}
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required
          pattern="\d{4}-\d{2}"
          placeholder="JJJJ-MM"
          className="w-44"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending || !month} aria-busy={pending}>
        <Sparkles />
        {pending ? "Agent stelt samen…" : "Nieuwsbrief voorbereiden"}
      </Button>
    </form>
  );
}
