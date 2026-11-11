"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createInterviewAction } from "@/actions/interviews";
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
import { INTERVIEW_KIND_LABELS } from "@/lib/constants";
import type { Classification, InterviewKind } from "@/lib/types";

type ProfileOption = { id: string; full_name: string; job_title: string | null };
type ArticleOption = { id: string; title: string; classification: Classification };

const EXTERNAL_PERSON = "external";
const NO_ARTICLE = "none";
const KINDS = Object.keys(INTERVIEW_KIND_LABELS) as InterviewKind[];

export function NewInterviewDialog({
  profiles,
  articles,
  defaultArticleId,
  defaultOpen,
}: {
  profiles: ProfileOption[];
  articles: ArticleOption[];
  defaultArticleId: string | null;
  defaultOpen: boolean;
}) {
  const preselected = articles.find((a) => a.id === defaultArticleId) ?? null;
  const [open, setOpen] = useState(defaultOpen);
  const { run, pending, fieldErrors, clearErrors } = useAction();

  const [title, setTitle] = useState(preselected ? `Interview: ${preselected.title}` : "");
  const [purpose, setPurpose] = useState("");
  const [kind, setKind] = useState<InterviewKind>("other");
  const [classification, setClassification] = useState<Classification>(preselected?.classification ?? "internal");
  const [interviewee, setInterviewee] = useState<string>(EXTERNAL_PERSON);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [articleId, setArticleId] = useState<string>(preselected?.id ?? NO_ARTICLE);
  const [scheduledAt, setScheduledAt] = useState("");

  const isExternalPerson = interviewee === EXTERNAL_PERSON;

  const selectArticle = (value: string) => {
    setArticleId(value);
    const article = articles.find((a) => a.id === value);
    if (article) {
      setClassification(article.classification);
      if (!title.trim()) setTitle(`Interview: ${article.title}`);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      () =>
        createInterviewAction({
          title,
          purpose,
          kind,
          classification,
          intervieweeProfileId: isExternalPerson ? null : interviewee,
          intervieweeName: isExternalPerson ? name : "",
          intervieweeRole: isExternalPerson ? role : undefined,
          articleId: articleId === NO_ARTICLE ? null : articleId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      {
        redirectTo: (result) => `/interviews/${result.data.id}`,
        onSuccess: () => setOpen(false),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nieuw interview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nieuw interview</DialogTitle>
          <DialogDescription>
            De agent stelt op basis van het doel de interviewvragen op. Je kunt de vragen daarna nog aanpassen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <FormField label="Titel" htmlFor="interview-title" error={fieldErrors.title} required>
            <Input
              id="interview-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijv. Klantcase Rijnmond Logistiek"
              required
            />
          </FormField>

          <FormField
            label="Doel van het interview"
            htmlFor="interview-purpose"
            error={fieldErrors.purpose}
            help="Wat wil je ophalen en waarvoor wordt het gebruikt?"
            required
          >
            <Textarea
              id="interview-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="Bijv. het verhaal achter de livegang ophalen voor een klantcase: aanleiding, aanpak en resultaat"
              required
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type" error={fieldErrors.kind}>
              <Select value={kind} onValueChange={(v) => setKind(v as InterviewKind)}>
                <SelectTrigger className="w-full" aria-label="Type interview">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {INTERVIEW_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Classificatie"
              error={fieldErrors.classification}
              help={classification === "external" ? "De externe agent voert het interview." : "De interne agent voert het interview."}
            >
              <Select value={classification} onValueChange={(v) => setClassification(v as Classification)}>
                <SelectTrigger className="w-full" aria-label="Classificatie">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Intern</SelectItem>
                  <SelectItem value="external">Extern</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Geïnterviewde" error={isExternalPerson ? undefined : fieldErrors.intervieweeName}>
            <Select value={interviewee} onValueChange={setInterviewee}>
              <SelectTrigger className="w-full" aria-label="Geïnterviewde">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EXTERNAL_PERSON}>Iemand buiten de hub (naam invullen)</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                    {p.job_title ? ` - ${p.job_title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {isExternalPerson && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Naam" htmlFor="interviewee-name" error={fieldErrors.intervieweeName} required>
                <Input id="interviewee-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Voor- en achternaam" />
              </FormField>
              <FormField label="Functie of rol" htmlFor="interviewee-role" error={fieldErrors.intervieweeRole}>
                <Input id="interviewee-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Bijv. operationeel directeur" />
              </FormField>
            </div>
          )}

          <FormField
            label="Gekoppeld contentitem"
            error={fieldErrors.articleId}
            help="Optioneel. De antwoorden worden gebruikt als materiaal voor dit item."
          >
            <Select value={articleId} onValueChange={selectArticle}>
              <SelectTrigger className="w-full" aria-label="Gekoppeld contentitem">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ARTICLE}>Geen - losstaand interview</SelectItem>
                {articles.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Datum en tijd"
            htmlFor="interview-date"
            error={fieldErrors.scheduledAt}
            help="Optioneel. Met een datum komt het interview op de contentkalender."
          >
            <Input id="interview-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>{pending ? "Vragen worden opgesteld…" : "Interview aanmaken"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
