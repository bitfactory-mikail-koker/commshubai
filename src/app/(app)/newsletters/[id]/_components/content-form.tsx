"use client";

import { useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { regenerateFraming, updateNewsletter } from "@/actions/newsletters";
import { ActionButton, FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { HtmlContent, Field } from "@/components/shared/layout";
import type { SafeHtml } from "@/lib/safe-html";
import { Input } from "@/components/ui/input";
import { MiniEditor } from "./mini-editor";

export function ContentForm({
  newsletterId,
  title: initialTitle,
  subject: initialSubject,
  introHtml: initialIntro,
  outroHtml: initialOutro,
  editable,
}: {
  newsletterId: string;
  title: string;
  subject: string;
  introHtml: SafeHtml;
  outroHtml: SafeHtml;
  editable: boolean;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [title, setTitle] = useState(initialTitle);
  const [subject, setSubject] = useState(initialSubject);
  const [introHtml, setIntroHtml] = useState<string>(initialIntro);
  const [outroHtml, setOutroHtml] = useState<string>(initialOutro);
  const [touched, setTouched] = useState(false);

  if (!editable) {
    return (
      <dl className="space-y-5">
        <Field label="Titel">{initialTitle}</Field>
        <Field label="Onderwerpregel">{initialSubject || "-"}</Field>
        <Field label="Inleiding">
          <HtmlContent html={initialIntro} compact />
        </Field>
        <Field label="Afsluiting">
          <HtmlContent html={initialOutro} compact />
        </Field>
      </dl>
    );
  }

  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setTouched(true);
    };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateNewsletter({ id: newsletterId, title, subject, introHtml, outroHtml }), {
          onSuccess: () => setTouched(false),
        });
      }}
    >
      <FormField label="Titel" htmlFor="newsletter-title" error={fieldErrors.title} help="Interne naam van deze editie." required>
        <Input id="newsletter-title" value={title} onChange={(e) => change(setTitle)(e.target.value)} required maxLength={160} />
      </FormField>
      <FormField
        label="Onderwerpregel"
        htmlFor="newsletter-subject"
        error={fieldErrors.subject}
        help="Wat ontvangers in hun inbox zien."
        required
      >
        <Input id="newsletter-subject" value={subject} onChange={(e) => change(setSubject)(e.target.value)} required maxLength={160} />
      </FormField>
      <FormField label="Inleiding" error={fieldErrors.introHtml}>
        <MiniEditor value={introHtml} onChange={change(setIntroHtml)} ariaLabel="Inleiding" disabled={pending} />
      </FormField>
      <FormField label="Afsluiting" error={fieldErrors.outroHtml}>
        <MiniEditor value={outroHtml} onChange={change(setOutroHtml)} ariaLabel="Afsluiting" disabled={pending} />
      </FormField>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <SubmitButton pending={pending} disabled={!touched}>
          {!pending && <Save />}
          Opslaan
        </SubmitButton>
        <ActionButton
          type="button"
          action={regenerateFraming.bind(null, { id: newsletterId })}
          variant="outline"
          pendingLabel="Agent schrijft…"
          confirm={{
            title: "Inleiding en afsluiting opnieuw schrijven?",
            description:
              "De agent schrijft de onderwerpregel, inleiding en afsluiting opnieuw op basis van de geselecteerde items. De huidige teksten worden overschreven, ook wijzigingen die je nog niet hebt opgeslagen.",
            confirmLabel: "Opnieuw schrijven",
          }}
        >
          <RefreshCw />
          Inleiding en afsluiting opnieuw schrijven
        </ActionButton>
        {touched && !pending && <span className="text-xs font-medium text-warning">Niet-opgeslagen wijzigingen</span>}
      </div>
    </form>
  );
}
