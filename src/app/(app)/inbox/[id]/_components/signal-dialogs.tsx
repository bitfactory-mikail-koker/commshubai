"use client";

import { useState } from "react";
import { FilePlus2, ListPlus } from "lucide-react";
import { createArticle } from "@/actions/articles";
import { addSignalInformation } from "@/actions/signals";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

/** Adds missing information to a signal as an extra, manually supplied source. */
export function AddInformationDialog({ signalId, missing }: { signalId: string; missing: string[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [resolved, setResolved] = useState<string[]>([]);
  const { run, pending, fieldErrors, clearErrors } = useAction();

  const toggle = (item: string, checked: boolean) =>
    setResolved((current) => (checked ? [...current, item] : current.filter((i) => i !== item)));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListPlus data-icon="inline-start" />
          Informatie aanvullen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => addSignalInformation({ id: signalId, text, resolved }), {
              onSuccess: () => {
                setOpen(false);
                setText("");
                setResolved([]);
              },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Informatie aanvullen</DialogTitle>
            <DialogDescription>
              Je aanvulling wordt als extra bron aan dit signaal gekoppeld, met jouw naam en het tijdstip. De agents gebruiken haar bij
              het beoordelen en schrijven.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Aanvullende informatie" htmlFor="info-text" error={fieldErrors.text} required>
            <Textarea
              id="info-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={4000}
              required
              placeholder="Bijvoorbeeld: de klant heeft op 3 november per mail toestemming gegeven voor publicatie."
              aria-invalid={Boolean(fieldErrors.text)}
            />
          </FormField>

          {missing.length > 0 && (
            <fieldset className="space-y-2.5">
              <legend className="text-[0.8125rem] font-medium">Welke ontbrekende punten zijn hiermee afgehandeld?</legend>
              {missing.map((item, index) => (
                <label key={item} htmlFor={`missing-${index}`} className="flex items-start gap-2.5 text-sm leading-snug">
                  <Checkbox
                    id={`missing-${index}`}
                    checked={resolved.includes(item)}
                    onCheckedChange={(checked) => toggle(item, checked === true)}
                    className="mt-0.5"
                  />
                  {item}
                </label>
              ))}
            </fieldset>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Toevoegen</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DIRECT_TYPES: ContentType[] = [
  "news_article",
  "website_article",
  "customer_case",
  "interview",
  "internal_update",
  "employee_introduction",
  "management_update",
];

/** Starts a content item straight from a signal (status "Nieuw signaal"). */
export function CreateArticleDialog({
  signalId,
  defaultTitle,
  defaultClassification,
  defaultType,
}: {
  signalId: string;
  defaultTitle: string;
  defaultClassification: Classification;
  defaultType: ContentType;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [contentType, setContentType] = useState<ContentType>(defaultType);
  const [classification, setClassification] = useState<Classification>(defaultClassification);
  const { run, pending, fieldErrors, clearErrors } = useAction();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FilePlus2 data-icon="inline-start" />
          Maak contentitem
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createArticle({ title, contentType, classification, signalId }), {
              onSuccess: () => setOpen(false),
              redirectTo: (result) => `/editorial/${result.data.id}`,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Contentitem maken van dit signaal</DialogTitle>
            <DialogDescription>
              Je start zelf een contentitem, zonder beoordeling door een agent. Het signaal wordt als bron gekoppeld.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Werktitel" htmlFor="article-title" error={fieldErrors.title} required>
              <Input
                id="article-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                aria-invalid={Boolean(fieldErrors.title)}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Contenttype" htmlFor="article-type" error={fieldErrors.contentType}>
                <Select value={contentType} onValueChange={(value) => setContentType(value as ContentType)}>
                  <SelectTrigger id="article-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {CONTENT_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Classificatie" htmlFor="article-classification" error={fieldErrors.classification}>
                <Select value={classification} onValueChange={(value) => setClassification(value as Classification)}>
                  <SelectTrigger id="article-classification" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Intern</SelectItem>
                    <SelectItem value="external">Extern</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            {classification === "external" && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Externe content kan pas worden ingepland nadat een mens de toestemming voor externe publicatie heeft bevestigd.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Contentitem maken</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
