"use client";

import { useState } from "react";
import Link from "next/link";
import { login, loginWithSlack } from "@/actions/auth";
import { Notice } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { DemoBadge } from "@/components/shared/badges";
import { Input } from "@/components/ui/input";

type DemoAccount = { name: string; role: string; email: string };

export function LoginForm({
  next,
  demoAccounts,
  demoPassword,
  slackLogin,
  error,
}: {
  next?: string;
  demoAccounts: DemoAccount[];
  demoPassword: string | null;
  slackLogin: boolean;
  error: string | null;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (credentials?: { email: string; password: string }) =>
    run(() => login({ email: credentials?.email ?? email, password: credentials?.password ?? password, next }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-[-0.014em]">Inloggen</h1>
        <p className="text-[0.8125rem] text-muted-foreground">
          {slackLogin ? "Log in met je Slack-account. Je hebt geen apart wachtwoord nodig." : "Log in met het account van je organisatie."}
        </p>
      </div>

      {error && <Notice tone="warning">{error}</Notice>}

      {slackLogin && (
        <div className="space-y-4">
          <Button type="button" className="h-9 w-full" disabled={pending} onClick={() => run(() => loginWithSlack({ next }))}>
            Inloggen met Slack
          </Button>
          <p className="text-center text-xs text-muted-foreground">of met e-mailadres en wachtwoord (beheerders)</p>
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label="E-mailadres" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@organisatie.nl"
            className="h-9"
          />
        </FormField>
        <FormField label="Wachtwoord" htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9"
          />
        </FormField>
        <SubmitButton pending={pending} className="h-9 w-full">
          Inloggen
        </SubmitButton>
      </form>

      <p className="text-[0.8125rem] text-muted-foreground">
        Nieuwe organisatie?{" "}
        <Link href="/register" className="font-medium text-info underline-offset-4 hover:underline">
          Maak een omgeving aan
        </Link>
      </p>

      {demoAccounts.length > 0 && demoPassword && (
        <div className="space-y-2.5 border-t pt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.8125rem] font-medium">Demo-accounts</p>
            <DemoBadge />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Log direct in als een van de rollen van Noordlicht Digital. Elke rol ziet andere acties en gegevens.
          </p>
          <ul className="divide-y overflow-hidden rounded-lg border">
            {demoAccounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit({ email: account.email, password: demoPassword })}
                  className="flex h-9 w-full items-center justify-between gap-3 px-3 text-left text-[0.8125rem] outline-none transition-colors duration-150 hover:bg-secondary/70 focus-visible:bg-secondary disabled:opacity-60"
                >
                  <span className="font-medium">{account.name}</span>
                  <span className="text-xs text-muted-foreground">{account.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
