"use client";

import { useState } from "react";
import { updateOwnProfile } from "@/actions/settings";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";

type Values = { fullName: string; jobTitle: string; department: string };

export function ProfileForm({ initial, email, role }: { initial: Values; email: string; role: string }) {
  const { run, pending, fieldErrors } = useAction();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== saved[k]);
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateOwnProfile(values), { onSuccess: () => setSaved(values) });
      }}
    >
      <FormField label="Naam" htmlFor="profile-name" error={fieldErrors.fullName} required>
        <Input id="profile-name" required value={values.fullName} onChange={set("fullName")} autoComplete="name" className="h-9" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Functie" htmlFor="profile-job" error={fieldErrors.jobTitle}>
          <Input id="profile-job" value={values.jobTitle} onChange={set("jobTitle")} className="h-9" />
        </FormField>
        <FormField label="Afdeling" htmlFor="profile-department" error={fieldErrors.department}>
          <Input id="profile-department" value={values.department} onChange={set("department")} className="h-9" />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="E-mailadres" htmlFor="profile-email" help="Wijzigen kan via een beheerder.">
          <Input id="profile-email" value={email} readOnly disabled className="h-9" />
        </FormField>
        <FormField label="Rol" htmlFor="profile-role" help="Toegekend onder Mensen en rollen.">
          <Input id="profile-role" value={role} readOnly disabled className="h-9" />
        </FormField>
      </div>
      <SubmitButton pending={pending} disabled={!dirty}>
        Profiel opslaan
      </SubmitButton>
    </form>
  );
}
