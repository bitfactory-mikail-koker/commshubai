"use client";

import { useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { assignTopicAction } from "@/actions/topics";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_TYPE_LABELS } from "@/lib/constants";
import type { Classification, ContentType } from "@/lib/types";
import { listColleagues } from "../../inbox/_components/people-action";
import { PeoplePicker, type PickablePerson } from "../../inbox/_components/people-picker";

/** The forms each bureau makes. */
const FORMS: Record<Classification, ContentType[]> = {
  external: ["customer_case", "news_article", "website_article", "interview", "social_post"],
  internal: ["internal_update", "employee_introduction", "management_update", "interview"],
};

const NO_PROJECT = "none";
const EMPTY = {
  title: "",
  briefing: "",
  classification: "internal" as Classification,
  contentType: "internal_update" as ContentType,
  projectId: NO_PROJECT,
};

/** Opdracht geven: an editor creates a topic and tells the bot whom to interview. */
export function AssignDialog({ projects }: { projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [people, setPeople] = useState<PickablePerson[] | null>(null);
  const [interviewees, setInterviewees] = useState<string[]>([]);
  const { run, pending, fieldErrors, clearErrors } = useAction();

  useEffect(() => {
    if (!open || people) return;
    let active = true;
    listColleagues()
      .then((all) => active && setPeople(all))
      .catch(() => active && setPeople([]));
    return () => {
      active = false;
    };
  }, [open, people]);

  const noInterview = form.contentType === "social_post";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      () =>
        assignTopicAction({
          title: form.title,
          briefing: form.briefing,
          classification: form.classification,
          contentType: form.contentType,
          intervieweeIds: noInterview ? [] : interviewees,
          projectId: form.projectId === NO_PROJECT ? null : form.projectId,
        }),
      {
        onSuccess: () => {
          setOpen(false);
          setForm(EMPTY);
          setInterviewees([]);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PenLine data-icon="inline-start" />
          Opdracht geven
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Opdracht geven</DialogTitle>
            <DialogDescription>
              Zeg waar het stuk over moet gaan en wie de bot moet interviewen. Het onderwerp is meteen opgepakt: er start een stuk en de
              bot nodigt de gekozen mensen uit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Titel" htmlFor="assign-title" error={fieldErrors.title} required>
              <Input
                id="assign-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Bijvoorbeeld: Terugblik op de hackathon"
                maxLength={160}
                required
                aria-invalid={Boolean(fieldErrors.title)}
              />
            </FormField>
            <FormField
              label="Waar moet het over gaan?"
              htmlFor="assign-briefing"
              error={fieldErrors.briefing}
              help="Een paar zinnen: de invalshoek, wat erin moet staan en voor wie het is. De bot gebruikt dit voor de interviewvragen en het concept."
              required
            >
              <Textarea
                id="assign-briefing"
                value={form.briefing}
                onChange={(e) => setForm((f) => ({ ...f, briefing: e.target.value }))}
                rows={4}
                maxLength={3000}
                required
                aria-invalid={Boolean(fieldErrors.briefing)}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Bureau" error={fieldErrors.classification}>
                <Select
                  value={form.classification}
                  onValueChange={(value) => {
                    const classification = value as Classification;
                    setForm((f) => ({ ...f, classification, contentType: FORMS[classification][0] }));
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Bureau">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Intern</SelectItem>
                    <SelectItem value="external">Extern</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Vorm" error={fieldErrors.contentType}>
                <Select value={form.contentType} onValueChange={(value) => setForm((f) => ({ ...f, contentType: value as ContentType }))}>
                  <SelectTrigger className="w-full" aria-label="Vorm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMS[form.classification].map((type) => (
                      <SelectItem key={type} value={type}>
                        {CONTENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {projects.length > 0 && (
              <FormField label="Project" help="Optioneel. Bepaalt bij een klantcase wie er moet goedkeuren.">
                <Select value={form.projectId} onValueChange={(value) => setForm((f) => ({ ...f, projectId: value }))}>
                  <SelectTrigger className="w-full" aria-label="Project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>Geen project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            {noInterview ? (
              <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                Een social post heeft geen interview nodig. De tekst loopt via de redactie.
              </p>
            ) : (
              <FormField
                label="Wie interviewt de bot?"
                error={fieldErrors.intervieweeIds}
                help="Maximaal drie mensen. Zonder keuze start het stuk zonder interview."
              >
                {people === null ? (
                  <p className="rounded-md border px-3 py-2.5 text-[0.8125rem] text-muted-foreground">Collega&apos;s laden…</p>
                ) : (
                  <PeoplePicker id="assign-people" people={people} value={interviewees} onChange={setInterviewees} max={3} />
                )}
              </FormField>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>{pending ? "Opdracht wordt gestart…" : "Opdracht geven"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
