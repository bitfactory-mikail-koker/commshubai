"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createArticle } from "@/actions/articles";
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
import { CHANNEL_OPTIONS, CONTENT_TYPE_LABELS, CONTENT_TYPES } from "@/lib/constants";
import type { Classification, ContentType } from "@/lib/types";

const EXTERNAL_CHANNELS = ["website", "linkedin", "external_newsletter"];
const INTERNAL_CHANNELS = ["intranet", "internal_newsletter", "slack", "email"];
const CREATABLE_TYPES = CONTENT_TYPES.filter((t) => t !== "newsletter" && t !== "social_post");

export function NewArticleDialog() {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("news_article");
  const [classification, setClassification] = useState<Classification>("external");
  const [channel, setChannel] = useState("website");
  const [audience, setAudience] = useState("");

  const channels = CHANNEL_OPTIONS.filter((c) =>
    (classification === "external" ? EXTERNAL_CHANNELS : INTERNAL_CHANNELS).includes(c.value),
  );

  const changeClassification = (value: Classification) => {
    setClassification(value);
    setChannel(value === "external" ? "website" : "intranet");
  };

  const reset = () => {
    setTitle("");
    setContentType("news_article");
    setClassification("external");
    setChannel("website");
    setAudience("");
    clearErrors();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nieuw contentitem
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createArticle({
                  title,
                  contentType,
                  classification,
                  channel,
                  targetAudience: audience || undefined,
                }),
              { redirectTo: (result) => `/editorial/${result.data.id}` },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Nieuw contentitem</DialogTitle>
            <DialogDescription>
              Je start met een leeg concept. Schrijf de tekst zelf of laat de verantwoordelijke agent een eerste versie maken.
            </DialogDescription>
          </DialogHeader>

          <FormField label="Titel" htmlFor="new-title" error={fieldErrors.title} required>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijvoorbeeld: Zo werkt ons nieuwe klantportaal"
              required
              minLength={3}
              maxLength={200}
              autoFocus
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Contenttype" htmlFor="new-type" error={fieldErrors.contentType} required>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger id="new-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {CONTENT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Classificatie"
              htmlFor="new-classification"
              error={fieldErrors.classification}
              help={classification === "external" ? "Externe publicatie vereist goedkeuring en toestemming." : undefined}
              required
            >
              <Select value={classification} onValueChange={(v) => changeClassification(v as Classification)}>
                <SelectTrigger id="new-classification" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">Extern</SelectItem>
                  <SelectItem value="internal">Intern</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Kanaal" htmlFor="new-channel" error={fieldErrors.channel}>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="new-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Doelgroep" htmlFor="new-audience" error={fieldErrors.targetAudience}>
              <Input
                id="new-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder={classification === "external" ? "Klanten en relaties" : "Alle medewerkers"}
                maxLength={120}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Aanmaken en openen</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
