"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { saveApprovalRule } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RULE_WHO_LABELS } from "@/lib/constants";
import type { RuleStep } from "@/lib/types";
import { autoLabel, MAX_STEPS, QUOTE_KEYS, type PersonOption, type RoleOption, type RuleRow } from "./describe";

type Who = RuleStep["who"];
/** One step as the form holds it. An empty label means: use the automatic name. */
type StepForm = { uid: number; who: Who; roles: string[]; profileIds: string[]; min: number; label: string };

const WHO_ORDER: Who[] = ["interviewees", "project_roles", "functional_roles", "persons", "editors"];

let nextUid = 1;

function toForm(step: RuleStep, roles: RoleOption[], people: PersonOption[]): StepForm {
  const stored = step.label?.trim() ?? "";
  return {
    uid: nextUid++,
    who: step.who,
    roles: step.roles ?? [],
    profileIds: step.profile_ids ?? [],
    min: Math.max(1, step.min ?? 1),
    // A stored name that equals the automatic one was never typed by a person.
    label: stored === autoLabel(step, roles, people) ? "" : stored,
  };
}

function toStep(step: StepForm, roles: RoleOption[], people: PersonOption[]): RuleStep {
  const base: RuleStep = {
    who: step.who,
    ...(step.who === "project_roles" || step.who === "functional_roles" ? { roles: step.roles } : {}),
    ...(step.who === "persons" ? { profile_ids: step.profileIds } : {}),
    ...(step.who === "interviewees" ? {} : { min: step.min }),
  };
  return { ...base, label: step.label.trim() || autoLabel(base, roles, people) };
}

function stepProblem(step: StepForm): string | null {
  if ((step.who === "project_roles" || step.who === "functional_roles") && step.roles.length === 0) return "Kies minimaal één rol.";
  if (step.who === "persons" && step.profileIds.length === 0) return "Kies minimaal één persoon.";
  if (step.who === "persons" && step.min > step.profileIds.length) return "Er zijn meer akkoorden gevraagd dan er personen zijn gekozen.";
  return null;
}

export function RuleDialog({ rule, roles, people }: { rule: RuleRow; roles: RoleOption[]; people: PersonOption[] }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const initial = () => ({
    steps: rule.steps.map((step) => toForm(step, roles, people)),
    quotes: rule.quotesByInterviewee,
    deadline: rule.deadlineDays,
  });
  const [form, setForm] = useState(initial);
  const quotesApply = QUOTE_KEYS.has(rule.contentKey);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setForm(initial());
  };

  const patch = (uid: number, change: Partial<StepForm>) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.uid === uid ? { ...s, ...change } : s)) }));
  const move = (index: number, delta: number) =>
    setForm((f) => {
      const steps = [...f.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(index + delta, 0, step);
      return { ...f, steps };
    });
  const toggleIn = (list: string[], value: string, checked: boolean) => (checked ? [...list, value] : list.filter((v) => v !== value));

  const problems = form.steps.map(stepProblem);
  const valid = form.steps.length > 0 && problems.every((p) => p === null) && form.deadline >= 1 && form.deadline <= 30;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Regel voor ${rule.label} wijzigen`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                saveApprovalRule({
                  contentKey: rule.contentKey,
                  steps: form.steps.map((step) => toStep(step, roles, people)),
                  quotesByInterviewee: form.quotes,
                  deadlineDays: form.deadline,
                }),
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Wie keurt goed: {rule.label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              De stappen lopen op volgorde. Pas als een stap akkoord is, gaat het stuk naar de volgende. Na de laatste stap is het klaar
              voor publicatie.
            </DialogDescription>
          </DialogHeader>

          <ol className="divide-y border-y">
            {form.steps.map((step, index) => {
              const needsRoles = step.who === "project_roles" || step.who === "functional_roles";
              const draft: RuleStep = { who: step.who, roles: step.roles, profile_ids: step.profileIds };
              return (
                <li key={step.uid} className="space-y-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-sm font-semibold tabular-nums">{index + 1}.</span>
                    <Select value={step.who} onValueChange={(who) => patch(step.uid, { who: who as Who })}>
                      <SelectTrigger className="w-56" aria-label={`Wie keurt goed in stap ${index + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WHO_ORDER.map((who) => (
                          <SelectItem key={who} value={who}>
                            {RULE_WHO_LABELS[who]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Stap ${index + 1} eerder zetten`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Stap ${index + 1} later zetten`}
                        disabled={index === form.steps.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Stap ${index + 1} verwijderen`}
                        disabled={form.steps.length === 1}
                        onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.uid !== step.uid) }))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 pl-7">
                    {step.who === "interviewees" && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Iedereen die voor dit stuk is geïnterviewd keurt het hele stuk goed, eigen citaten inbegrepen. Is er niemand
                        geïnterviewd, dan vervalt deze stap.
                      </p>
                    )}
                    {step.who === "editors" && (
                      <p className="text-xs leading-relaxed text-muted-foreground">Iedereen met het recht ‘Content goedkeuren’.</p>
                    )}
                    {needsRoles && (
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-medium text-muted-foreground">
                          {step.who === "project_roles"
                            ? "Mensen die in het project van het stuk een van deze rollen hebben"
                            : "Iedereen in de organisatie met een van deze rollen"}
                        </legend>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                          {roles.map((role) => {
                            const id = `rule-${step.uid}-role-${role.key}`;
                            return (
                              <div key={role.key} className="flex items-center gap-2">
                                <Checkbox
                                  id={id}
                                  checked={step.roles.includes(role.key)}
                                  onCheckedChange={(v) => patch(step.uid, { roles: toggleIn(step.roles, role.key, v === true) })}
                                />
                                <label htmlFor={id} className="truncate text-sm">
                                  {role.name}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                        {step.who === "project_roles" && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Heeft het stuk geen project, of heeft niemand daar deze rol, dan beslist de redactie.
                          </p>
                        )}
                      </fieldset>
                    )}
                    {step.who === "persons" && (
                      <div className="grid max-h-40 grid-cols-1 gap-x-4 gap-y-2 overflow-y-auto sm:grid-cols-2">
                        {people.map((person) => {
                          const id = `rule-${step.uid}-person-${person.id}`;
                          return (
                            <div key={person.id} className="flex items-center gap-2">
                              <Checkbox
                                id={id}
                                checked={step.profileIds.includes(person.id)}
                                onCheckedChange={(v) => patch(step.uid, { profileIds: toggleIn(step.profileIds, person.id, v === true) })}
                              />
                              <label htmlFor={id} className="truncate text-sm">
                                {person.name}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      {step.who !== "interviewees" && (
                        <FormField label="Aantal akkoorden" htmlFor={`rule-${step.uid}-min`}>
                          <Input
                            id={`rule-${step.uid}-min`}
                            type="number"
                            min={1}
                            max={5}
                            value={step.min}
                            onChange={(e) => patch(step.uid, { min: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
                            className="tabular-nums"
                          />
                        </FormField>
                      )}
                      <FormField label="Naam van de stap" htmlFor={`rule-${step.uid}-label`} className={step.who === "interviewees" ? "sm:col-span-2" : undefined}>
                        <Input
                          id={`rule-${step.uid}-label`}
                          value={step.label}
                          onChange={(e) => patch(step.uid, { label: e.target.value })}
                          maxLength={80}
                          placeholder={autoLabel(draft, roles, people)}
                          autoComplete="off"
                        />
                      </FormField>
                    </div>
                    {problems[index] && (
                      <p className="text-xs font-medium text-destructive" role="alert">
                        {problems[index]}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={form.steps.length >= MAX_STEPS}
              onClick={() =>
                setForm((f) => ({ ...f, steps: [...f.steps, { uid: nextUid++, who: "editors", roles: [], profileIds: [], min: 1, label: "" }] }))
              }
            >
              <Plus />
              Stap toevoegen
            </Button>
            {form.steps.length >= MAX_STEPS && <span className="text-xs text-muted-foreground">Een regel heeft maximaal {MAX_STEPS} stappen.</span>}
          </div>

          {quotesApply ? (
            <div className="flex items-start justify-between gap-4 border-t pt-4">
              <label htmlFor="rule-quotes" className="min-w-0 space-y-1">
                <span className="block text-sm font-medium">Citaten eerst naar de geciteerde</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  Aan: elk citaat gaat vóór de stappen hierboven naar wie het gezegd heeft. Dat akkoord kan niemand anders geven, ook de
                  redactie en de beheerder niet. Dit ligt vast in de database en is hier niet uit te zetten. Uit: voor dit soort stukken
                  wordt geen apart citaatakkoord gevraagd.
                </span>
              </label>
              <Switch id="rule-quotes" checked={form.quotes} onCheckedChange={(quotes) => setForm((f) => ({ ...f, quotes }))} className="mt-0.5" />
            </div>
          ) : (
            rule.contentKey === "md_update" && (
              <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                Vóór deze stappen keurt elke MD de eigen passages goed. Dat ligt vast: alleen de MD zelf kan dat akkoord geven, en wie
                niet op tijd reageert, staat niet in de editie.
              </p>
            )
          )}

          <FormField
            label="Termijn in werkdagen"
            htmlFor="rule-deadline"
            help="Na twee werkdagen stuurt de bot één herinnering. Is de termijn voorbij, dan hoort de redactie het en kan zij over het stuk beslissen. Over een citaat nooit."
          >
            <Input
              id="rule-deadline"
              type="number"
              min={1}
              max={30}
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: Number(e.target.value) || 0 }))}
              className="w-28 tabular-nums"
            />
          </FormField>

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
