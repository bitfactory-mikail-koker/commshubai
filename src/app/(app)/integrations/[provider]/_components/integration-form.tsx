"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { saveIntegration } from "@/actions/integrations";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";
import type { IntegrationField } from "@/lib/integrations/registry";

export function IntegrationForm({
  provider,
  configFields,
  secretFields,
  initialConfig,
  hasCredentials,
  canManage,
  implemented,
}: {
  provider: string;
  configFields: IntegrationField[];
  secretFields: IntegrationField[];
  initialConfig: Record<string, string>;
  hasCredentials: boolean;
  canManage: boolean;
  implemented: boolean;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [config, setConfig] = useState(initialConfig);
  // Secrets are write-only: the form never receives stored values.
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const dirty =
    Object.keys(initialConfig).some((k) => (config[k] ?? "") !== (initialConfig[k] ?? "")) ||
    Object.values(secrets).some((v) => v.trim());

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveIntegration({ provider, config, secrets }), { onSuccess: () => setSecrets({}) });
      }}
    >
      {configFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {configFields.map((field) => (
            <FormField
              key={field.key}
              label={field.label}
              htmlFor={`config-${field.key}`}
              help={field.help}
              error={fieldErrors[field.key]}
              required={field.required}
              className={configFields.length % 2 === 1 && field === configFields[configFields.length - 1] ? "sm:col-span-2" : undefined}
            >
              <Input
                id={`config-${field.key}`}
                type={field.type === "url" ? "url" : "text"}
                value={config[field.key] ?? ""}
                placeholder={canManage ? field.placeholder : "Niet ingesteld"}
                readOnly={!canManage}
                aria-invalid={Boolean(fieldErrors[field.key])}
                onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                className="h-9"
              />
            </FormField>
          ))}
        </div>
      )}

      {secretFields.length > 0 && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <KeyRound className="size-3.5" />
            {hasCredentials
              ? "Er zijn inloggegevens opgeslagen. Laat een veld leeg om de opgeslagen waarde te behouden."
              : "Er zijn nog geen inloggegevens opgeslagen."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {secretFields.map((field) => (
              <FormField
                key={field.key}
                label={field.label}
                htmlFor={`secret-${field.key}`}
                help={field.help}
                error={fieldErrors[field.key]}
                required={field.required && !hasCredentials}
              >
                <Input
                  id={`secret-${field.key}`}
                  type="password"
                  autoComplete="off"
                  value={secrets[field.key] ?? ""}
                  placeholder={hasCredentials ? "•••• opgeslagen" : canManage ? field.placeholder : "Niet ingesteld"}
                  disabled={!canManage}
                  onChange={(e) => setSecrets((s) => ({ ...s, [field.key]: e.target.value }))}
                  className="h-9 bg-background"
                />
              </FormField>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending} disabled={!dirty}>
            Instellingen opslaan
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            {implemented
              ? "Na het opslaan is een geslaagde verbindingstest nodig om de koppeling te activeren."
              : "Opslaan legt de gegevens vast; een live verbinding is voor deze integratie nog niet mogelijk."}
          </p>
        </div>
      )}
    </form>
  );
}
