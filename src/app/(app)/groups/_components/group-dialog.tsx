"use client";

import { useState } from "react";
import { saveGroup } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FREQUENCY_OPTIONS, WEEKDAY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { groupInput, type GroupRow, type Option } from "./types";

type Form = ReturnType<typeof groupInput> | (Omit<ReturnType<typeof groupInput>, "id"> & { id?: undefined });

const EMPTY: Form = {
  name: "",
  goal: "",
  bureau: "internal",
  memberKind: "role",
  functionalRoleId: null,
  teamId: null,
  memberIds: [],
  frequency: "monthly",
  weekday: 2,
  windowStart: "10:00",
  windowEnd: "12:00",
  reminderCount: 1,
  reminderAfterDays: 2,
  afterNoReply: "notify_editors",
  enabled: true,
};

const MEMBER_KINDS: { value: Form["memberKind"]; label: string }[] = [
  { value: "role", label: "Een rol" },
  { value: "team", label: "Een team" },
  { value: "persons", label: "Personen" },
];

export function GroupDialog({
  group,
  roles,
  teams,
  people,
  trigger,
}: {
  group?: GroupRow;
  roles: Option[];
  teams: Option[];
  people: Option[];
  trigger: React.ReactNode;
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => (group ? groupInput(group) : EMPTY));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setForm(group ? groupInput(group) : EMPTY);
    else clearErrors();
  };

  const togglePerson = (id: string, checked: boolean) =>
    set("memberIds", checked ? [...form.memberIds, id] : form.memberIds.filter((m) => m !== id));

  const membersChosen =
    form.memberKind === "role" ? Boolean(form.functionalRoleId) : form.memberKind === "team" ? Boolean(form.teamId) : form.memberIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveGroup(form), { onSuccess: () => setOpen(false) });
          }}
        >
          <DialogHeader>
            <DialogTitle>{group ? "Groep wijzigen" : "Nieuwe groep"}</DialogTitle>
            <DialogDescription>
              Een groep is wie de bot om input vraagt, waarvoor en hoe vaak. Antwoorden komen als tip bij de redactie.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Naam" htmlFor="group-name" error={fieldErrors.name} required className="sm:col-span-2">
              <Input id="group-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required autoComplete="off" />
            </FormField>
            <FormField label="Bureau" htmlFor="group-bureau" error={fieldErrors.bureau}>
              <Select value={form.bureau} onValueChange={(v) => set("bureau", v as Form["bureau"])}>
                <SelectTrigger id="group-bureau" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Intern</SelectItem>
                  <SelectItem value="external">Extern</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField
            label="Doel"
            htmlFor="group-goal"
            error={fieldErrors.goal}
            help="De vraag die de bot stelt, in jullie eigen woorden. Leeg: een standaardvraag die past bij het bureau."
          >
            <Textarea id="group-goal" value={form.goal} onChange={(e) => set("goal", e.target.value)} maxLength={600} rows={3} />
          </FormField>

          <fieldset className="space-y-2.5">
            <legend className="text-[0.8rem] font-medium">Leden</legend>
            <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label="Soort leden">
              {MEMBER_KINDS.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  role="radio"
                  aria-checked={form.memberKind === kind.value}
                  onClick={() => set("memberKind", kind.value)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[0.8125rem] outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
                    form.memberKind === kind.value
                      ? "bg-secondary font-medium text-foreground ring-1 ring-border ring-inset"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {kind.label}
                </button>
              ))}
            </div>
            {form.memberKind === "role" && (
              <Select value={form.functionalRoleId ?? ""} onValueChange={(v) => set("functionalRoleId", v)}>
                <SelectTrigger className="w-full sm:w-72" aria-label="Rol" aria-invalid={Boolean(fieldErrors.functionalRoleId)}>
                  <SelectValue placeholder="Kies een rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {form.memberKind === "team" && (
              <Select value={form.teamId ?? ""} onValueChange={(v) => set("teamId", v)}>
                <SelectTrigger className="w-full sm:w-72" aria-label="Team" aria-invalid={Boolean(fieldErrors.teamId)}>
                  <SelectValue placeholder="Kies een team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {form.memberKind === "persons" && (
              <div className="grid max-h-44 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {people.map((person) => {
                  const id = `group-person-${person.id}`;
                  return (
                    <div key={person.id} className="flex items-center gap-2">
                      <Checkbox id={id} checked={form.memberIds.includes(person.id)} onCheckedChange={(v) => togglePerson(person.id, v === true)} />
                      <label htmlFor={id} className="truncate text-sm">
                        {person.name}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            {(fieldErrors.functionalRoleId || fieldErrors.teamId) && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {fieldErrors.functionalRoleId ?? fieldErrors.teamId}
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Bij een rol of team volgt de groep vanzelf wie die rol heeft of in dat team zit.
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Frequentie"
              htmlFor="group-frequency"
              error={fieldErrors.frequency}
              help={form.frequency === "rhythm_only" ? "De groep wordt alleen benaderd door een vast ritme dat haar gebruikt." : undefined}
            >
              <Select value={form.frequency} onValueChange={(v) => set("frequency", v as Form["frequency"])}>
                <SelectTrigger id="group-frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Dag" htmlFor="group-weekday" error={fieldErrors.weekday}>
              <Select value={String(form.weekday)} onValueChange={(v) => set("weekday", Number(v))} disabled={form.frequency === "rhythm_only"}>
                <SelectTrigger id="group-weekday" className="w-full">
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
            <FormField label="Moment: vanaf" htmlFor="group-start" error={fieldErrors.windowStart}>
              <Input
                id="group-start"
                type="time"
                value={form.windowStart}
                onChange={(e) => set("windowStart", e.target.value)}
                disabled={form.frequency === "rhythm_only"}
                required
              />
            </FormField>
            <FormField label="Moment: tot" htmlFor="group-end" error={fieldErrors.windowEnd}>
              <Input
                id="group-end"
                type="time"
                value={form.windowEnd}
                onChange={(e) => set("windowEnd", e.target.value)}
                disabled={form.frequency === "rhythm_only"}
                required
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Herinneringen" htmlFor="group-reminders" error={fieldErrors.reminderCount}>
              <Select value={String(form.reminderCount)} onValueChange={(v) => set("reminderCount", Number(v))}>
                <SelectTrigger id="group-reminders" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Geen</SelectItem>
                  <SelectItem value="1">Eén</SelectItem>
                  <SelectItem value="2">Twee</SelectItem>
                  <SelectItem value="3">Drie</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Na hoeveel dagen" htmlFor="group-reminder-days" error={fieldErrors.reminderAfterDays}>
              <Input
                id="group-reminder-days"
                type="number"
                min={1}
                max={14}
                value={form.reminderAfterDays}
                onChange={(e) => set("reminderAfterDays", Number(e.target.value))}
                disabled={form.reminderCount === 0}
                className="tabular-nums"
              />
            </FormField>
            <FormField label="Daarna" htmlFor="group-after" error={fieldErrors.afterNoReply}>
              <Select value={form.afterNoReply} onValueChange={(v) => set("afterNoReply", v as Form["afterNoReply"])}>
                <SelectTrigger id="group-after" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notify_editors">Redactie inlichten</SelectItem>
                  <SelectItem value="nothing">Niets doen</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <label htmlFor="group-enabled" className="space-y-0.5">
              <span className="block text-sm font-medium">Actief</span>
              <span className="block text-xs text-muted-foreground">Uit: de groep krijgt geen rondes op haar eigen frequentie.</span>
            </label>
            <Switch id="group-enabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending} disabled={form.name.trim().length < 2 || !membersChosen}>
              Opslaan
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
