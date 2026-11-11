"use client";

import { useState } from "react";
import { CalendarClock, XCircle } from "lucide-react";
import { cancelInterview, scheduleInterview } from "@/actions/interviews";
import { ActionButton, FormField, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toDateTimeLocal } from "@/lib/format";

export function PlanningPanel({ interviewId, scheduledAt }: { interviewId: string; scheduledAt: string | null }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState(toDateTimeLocal(scheduledAt));

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value) return;
          run(() => scheduleInterview({ id: interviewId, scheduledAt: new Date(value).toISOString() }));
        }}
      >
        <FormField label="Datum en tijd" htmlFor="interview-scheduled-at">
          <Input
            id="interview-scheduled-at"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" variant="outline" size="sm" disabled={pending || !value}>
          <CalendarClock />
          {pending ? "Opslaan…" : scheduledAt ? "Planning wijzigen" : "Interview inplannen"}
        </Button>
      </form>
      <div className="border-t pt-3">
        <ActionButton
          action={cancelInterview.bind(null, { id: interviewId })}
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          confirm={{
            title: "Interview annuleren?",
            description:
              "Het interview wordt geannuleerd en van de contentkalender gehaald. Antwoorden die al zijn gegeven blijven bewaard.",
            confirmLabel: "Interview annuleren",
            destructive: true,
          }}
        >
          <XCircle />
          Interview annuleren
        </ActionButton>
      </div>
    </div>
  );
}
