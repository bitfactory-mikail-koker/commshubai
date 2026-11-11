"use client";

import { useState } from "react";
import { updateOrganization } from "@/actions/settings";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Values = { name: string; timezone: string; requireFourEyes: boolean; retentionDays: number };

const TIMEZONES = [
  { value: "Europe/Amsterdam", label: "Amsterdam (Europe/Amsterdam)" },
  { value: "Europe/Brussels", label: "Brussel (Europe/Brussels)" },
  { value: "Europe/Berlin", label: "Berlijn (Europe/Berlin)" },
  { value: "Europe/London", label: "Londen (Europe/London)" },
  { value: "America/Paramaribo", label: "Paramaribo (America/Paramaribo)" },
  { value: "America/Curacao", label: "Curaçao (America/Curacao)" },
  { value: "UTC", label: "UTC" },
];

export function OrganizationForm({ initial, canManage }: { initial: Values; canManage: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [values, setValues] = useState(initial);
  const [retention, setRetention] = useState(String(initial.retentionDays));
  const retentionDays = Number.parseInt(retention, 10);
  const retentionValid = Number.isInteger(retentionDays) && retentionDays >= 30 && retentionDays <= 3650;
  const dirty =
    values.name !== initial.name ||
    values.timezone !== initial.timezone ||
    values.requireFourEyes !== initial.requireFourEyes ||
    retentionDays !== initial.retentionDays;

  // Keep the stored timezone selectable even when it is not in the short list.
  const timezones = TIMEZONES.some((t) => t.value === initial.timezone)
    ? TIMEZONES
    : [{ value: initial.timezone, label: initial.timezone }, ...TIMEZONES];

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canManage || !retentionValid) return;
        run(() => updateOrganization({ ...values, retentionDays }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Naam van de organisatie" htmlFor="org-name" error={fieldErrors.name} required>
          <Input
            id="org-name"
            required
            value={values.name}
            readOnly={!canManage}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            className="h-9"
          />
        </FormField>
        <FormField label="Tijdzone" htmlFor="org-timezone" error={fieldErrors.timezone} help="Gebruikt voor planning en de contentkalender.">
          <Select value={values.timezone} disabled={!canManage} onValueChange={(timezone) => setValues((v) => ({ ...v, timezone }))}>
            <SelectTrigger id="org-timezone" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="flex items-start justify-between gap-6 border-y py-4">
        <div className="space-y-1">
          <Label htmlFor="four-eyes" className="text-sm font-medium">
            Vier-ogenprincipe
          </Label>
          <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-muted-foreground">
            Wie content ter review indient, kan dezelfde versie niet zelf goedkeuren. Aanbevolen zodra meer dan één persoon mag
            goedkeuren. Staat dit uit, dan kan één persoon indienen én goedkeuren; ook dan is altijd een menselijke goedkeuring
            nodig.
          </p>
        </div>
        <Switch
          id="four-eyes"
          checked={values.requireFourEyes}
          disabled={!canManage}
          onCheckedChange={(requireFourEyes) => setValues((v) => ({ ...v, requireFourEyes }))}
          className="mt-0.5"
        />
      </div>

      <FormField
        label="Bewaartermijn bronberichten (dagen)"
        htmlFor="retention"
        error={!retentionValid ? "Vul een aantal dagen in tussen 30 en 3650." : fieldErrors.retentionDays}
        help="Hoe lang berichten uit gekoppelde systemen volgens het beleid van de organisatie bewaard mogen worden. Wordt getoond bij elke integratie."
        className="max-w-sm"
      >
        <Input
          id="retention"
          type="number"
          inputMode="numeric"
          min={30}
          max={3650}
          value={retention}
          readOnly={!canManage}
          aria-invalid={!retentionValid}
          onChange={(e) => setRetention(e.target.value)}
          className="h-9 w-32"
        />
      </FormField>

      {canManage && (
        <SubmitButton pending={pending} disabled={!dirty || !retentionValid}>
          Organisatie-instellingen opslaan
        </SubmitButton>
      )}
    </form>
  );
}
