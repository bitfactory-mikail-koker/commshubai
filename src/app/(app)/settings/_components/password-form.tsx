"use client";

import { useState } from "react";
import { changePassword } from "@/actions/settings";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";

export function PasswordForm() {
  const { run, pending, fieldErrors } = useAction();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (mismatch) return;
        run(() => changePassword({ password, confirm }), {
          onSuccess: () => {
            setPassword("");
            setConfirm("");
          },
        });
      }}
    >
      <FormField label="Nieuw wachtwoord" htmlFor="new-password" help="Minimaal 10 tekens." required>
        <Input
          id="new-password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9"
        />
      </FormField>
      <FormField
        label="Herhaal nieuw wachtwoord"
        htmlFor="confirm-password"
        error={mismatch ? "De wachtwoorden komen niet overeen." : fieldErrors.confirm}
        required
      >
        <Input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          aria-invalid={mismatch}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-9"
        />
      </FormField>
      <SubmitButton pending={pending} disabled={password.length < 10 || mismatch || confirm.length === 0}>
        Wachtwoord wijzigen
      </SubmitButton>
    </form>
  );
}
