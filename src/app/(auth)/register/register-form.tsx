"use client";

import { useState } from "react";
import Link from "next/link";
import { register } from "@/actions/auth";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const { run, pending, fieldErrors } = useAction();
  const [form, setForm] = useState({ organizationName: "", fullName: "", email: "", password: "" });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-[-0.014em]">Omgeving aanmaken</h1>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          Je krijgt een eigen, afgeschermde omgeving met beide agents en standaardrollen. Jij wordt de eerste beheerder.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => register(form));
        }}
      >
        <FormField label="Naam van de organisatie" htmlFor="organizationName" error={fieldErrors.organizationName} required>
          <Input id="organizationName" required value={form.organizationName} onChange={set("organizationName")} className="h-9" />
        </FormField>
        <FormField label="Je naam" htmlFor="fullName" error={fieldErrors.fullName} required>
          <Input id="fullName" required autoComplete="name" value={form.fullName} onChange={set("fullName")} className="h-9" />
        </FormField>
        <FormField label="E-mailadres" htmlFor="email" error={fieldErrors.email} required>
          <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} className="h-9" />
        </FormField>
        <FormField label="Wachtwoord" htmlFor="password" error={fieldErrors.password} help="Minimaal 10 tekens." required>
          <Input
            id="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            className="h-9"
          />
        </FormField>
        <SubmitButton pending={pending} className="h-9 w-full">
          Omgeving aanmaken
        </SubmitButton>
      </form>
      <p className="text-[0.8125rem] text-muted-foreground">
        Al een account?{" "}
        <Link href="/login" className="font-medium text-info underline-offset-4 hover:underline">
          Inloggen
        </Link>
      </p>
    </div>
  );
}
