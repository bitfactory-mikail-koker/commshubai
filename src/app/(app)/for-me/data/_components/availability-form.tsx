"use client";

import { useState } from "react";
import { updateOwnAvailability } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** What everyone decides for themselves about the bot: absence, a pause, or no contact at all. */
export function AvailabilityForm({
  absentUntil,
  contactOptOut,
  pausedUntil,
}: {
  absentUntil: string | null;
  contactOptOut: boolean;
  /** Formatted date when a pause is running, otherwise null. */
  pausedUntil: string | null;
}) {
  const { run, pending } = useAction();
  const [absent, setAbsent] = useState(absentUntil ?? "");
  const [optOut, setOptOut] = useState(contactOptOut);
  const [pause, setPause] = useState(pausedUntil ? "keep" : "0");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pause === "keep") {
          // An unchanged, running pause is left as it is: only the other two settings are saved.
          run(() => updateOwnAvailability({ absentUntil: absent || null, contactOptOut: optOut, pauseWeeks: -1 }));
        } else {
          run(() => updateOwnAvailability({ absentUntil: absent || null, contactOptOut: optOut, pauseWeeks: Number(pause) }));
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Afwezig tot en met" htmlFor="absent-until" help="Tijdens je afwezigheid stuurt de bot je niets.">
          <Input id="absent-until" type="date" value={absent} onChange={(e) => setAbsent(e.target.value)} />
        </FormField>
        <FormField label="Pauze" htmlFor="pause-weeks" help="De bot benadert je in die tijd niet voor interviews of input.">
          <Select value={pause} onValueChange={setPause}>
            <SelectTrigger id="pause-weeks" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pausedUntil && <SelectItem value="keep">Loopt tot {pausedUntil}</SelectItem>}
              <SelectItem value="0">Geen pauze</SelectItem>
              <SelectItem value="1">Een week</SelectItem>
              <SelectItem value="4">Een maand</SelectItem>
              <SelectItem value="13">Drie maanden</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <div className="flex items-start gap-3 border-t pt-4">
        <Switch id="opt-out" checked={optOut} onCheckedChange={setOptOut} className="mt-0.5" />
        <label htmlFor="opt-out" className="min-w-0 text-sm">
          <span className="font-medium">Benader mij niet</span>
          <span className="block text-[0.8125rem] leading-relaxed text-muted-foreground">
            De bot vraagt je niet meer voor interviews of input. Een goedkeuringsverzoek voor een stuk waarin je zelf voorkomt krijg je
            nog wel, want zonder jouw akkoord gaat het niet uit. De redactie kan zien dat je dit hebt ingesteld.
          </span>
        </label>
      </div>
      <SubmitButton pending={pending} size="sm">
        Opslaan
      </SubmitButton>
    </form>
  );
}
