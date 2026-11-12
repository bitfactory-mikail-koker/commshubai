"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { saveRhythm } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RHYTHM_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import type { RhythmKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Option, RhythmRow } from "./types";

const NO_GROUP = "none";

/** What the rhythm does when it runs, and what the two numbers mean for it. */
export const RHYTHM_HELP: Record<RhythmKey, { what: string; group: string | null; deadline: string | null }> = {
  team_round: {
    what: "De bot vraagt de groep wat er in hun team speelt. Antwoorden komen als tip in de inbox.",
    group: "Wie krijgt de vraag",
    deadline: null,
  },
  md_update: {
    what: "De bot nodigt elke MD uit voor een kort interview en maakt een nieuwe editie. Wie niet antwoordt, staat er niet in.",
    group: "Welke MD's (leeg: iedereen met de rol MD)",
    deadline: null,
  },
  internal_newsletter: {
    what: "De bot vraagt de groep om input en bereidt daarna de interne nieuwsbrief voor als concept.",
    group: "Wie wordt om input gevraagd",
    deadline: "Dagen tussen de vraag om input en het voorbereiden van de nieuwsbrief",
  },
  external_newsletter: {
    what: "De bot vraagt de groep om input en bereidt daarna de externe nieuwsbrief voor als concept.",
    group: "Wie wordt om input gevraagd",
    deadline: "Dagen tussen de vraag om input en het voorbereiden van de nieuwsbrief",
  },
  weekly_overview: {
    what: "De redactie krijgt een overzicht: open voorstellen, lopende interviews, wachtende goedkeuringen en wat klaar is.",
    group: null,
    deadline: null,
  },
};

function parseDays(value: string): number[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((part) => Number(part))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 28),
    ),
  ).sort((a, b) => a - b);
}

export function RhythmDialog({ rhythm, groups }: { rhythm: RhythmRow; groups: Option[] }) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const initial = () => ({
    mode: rhythm.weekday ? ("weekly" as const) : ("monthly" as const),
    days: rhythm.daysOfMonth.join(", "),
    weekday: rhythm.weekday ?? 1,
    timeOfDay: rhythm.timeOfDay,
    deadlineDays: rhythm.deadlineDays,
    groupId: rhythm.groupId ?? NO_GROUP,
    enabled: rhythm.enabled,
  });
  const [form, setForm] = useState(initial);
  const help = RHYTHM_HELP[rhythm.key];
  const days = parseDays(form.days);
  const valid = form.mode === "weekly" || (days.length > 0 && days.length <= 4);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setForm(initial());
    else clearErrors();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${RHYTHM_LABELS[rhythm.key]} wijzigen`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                saveRhythm({
                  id: rhythm.id,
                  daysOfMonth: form.mode === "monthly" ? days : [],
                  weekday: form.mode === "weekly" ? form.weekday : null,
                  timeOfDay: form.timeOfDay,
                  deadlineDays: help.deadline ? form.deadlineDays : rhythm.deadlineDays,
                  groupId: help.group && form.groupId !== NO_GROUP ? form.groupId : null,
                  enabled: form.enabled,
                }),
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{RHYTHM_LABELS[rhythm.key]}</DialogTitle>
            <DialogDescription>{help.what}</DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2.5">
            <legend className="text-[0.8rem] font-medium">Wanneer</legend>
            <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Soort ritme">
              {(
                [
                  { value: "monthly", label: "Op dagen van de maand" },
                  { value: "weekly", label: "Elke week" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={form.mode === mode.value}
                  onClick={() => setForm((f) => ({ ...f, mode: mode.value }))}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[0.8125rem] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    form.mode === mode.value
                      ? "bg-secondary font-medium text-foreground ring-1 ring-border ring-inset"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {form.mode === "monthly" ? (
                <FormField
                  label="Dagen van de maand"
                  htmlFor="rhythm-days"
                  error={fieldErrors.daysOfMonth ?? (form.days.trim() && !valid ? "Geef één tot vier dagen tussen 1 en 28." : undefined)}
                  help="Gescheiden door komma's, bijvoorbeeld 1, 15. Tot en met de 28e, zodat elke maand meedoet."
                >
                  <Input
                    id="rhythm-days"
                    value={form.days}
                    onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular-nums"
                  />
                </FormField>
              ) : (
                <FormField label="Dag van de week" htmlFor="rhythm-weekday" error={fieldErrors.weekday}>
                  <Select value={String(form.weekday)} onValueChange={(v) => setForm((f) => ({ ...f, weekday: Number(v) }))}>
                    <SelectTrigger id="rhythm-weekday" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_LABELS.map((label, index) => (
                        <SelectItem key={label} value={String(index + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
              <FormField label="Tijdstip" htmlFor="rhythm-time" error={fieldErrors.timeOfDay} help="De bot start op of na dit tijdstip.">
                <Input
                  id="rhythm-time"
                  type="time"
                  value={form.timeOfDay}
                  onChange={(e) => setForm((f) => ({ ...f, timeOfDay: e.target.value }))}
                  required
                />
              </FormField>
            </div>
          </fieldset>

          {help.group && (
            <FormField label="Groep" htmlFor="rhythm-group" error={fieldErrors.groupId} help={help.group}>
              <Select value={form.groupId} onValueChange={(groupId) => setForm((f) => ({ ...f, groupId }))}>
                <SelectTrigger id="rhythm-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP}>Geen groep</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          {help.deadline && (
            <FormField label="Termijn in dagen" htmlFor="rhythm-deadline" error={fieldErrors.deadlineDays} help={help.deadline}>
              <Input
                id="rhythm-deadline"
                type="number"
                min={0}
                max={31}
                value={form.deadlineDays}
                onChange={(e) => setForm((f) => ({ ...f, deadlineDays: Number(e.target.value) }))}
                className="w-28 tabular-nums"
              />
            </FormField>
          )}

          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <label htmlFor="rhythm-enabled" className="space-y-0.5">
              <span className="block text-sm font-medium">Actief</span>
              <span className="block text-xs text-muted-foreground">Een ritme dat uit staat start niet vanzelf. Handmatig starten kan wel.</span>
            </label>
            <Switch id="rhythm-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending} disabled={!valid}>
              Opslaan
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
