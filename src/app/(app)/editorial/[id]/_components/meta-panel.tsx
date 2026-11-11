"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { updateArticleMeta } from "@/actions/articles";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_OPTIONS, CONTENT_TYPE_LABELS, CONTENT_TYPES } from "@/lib/constants";
import type { Classification, ContentType } from "@/lib/types";
import type { ProfileOption } from "./types";

const NONE = "none";

export type MetaValues = {
  id: string;
  contentType: ContentType;
  classification: Classification;
  channel: string | null;
  targetAudience: string | null;
  excerpt: string | null;
  tags: string[];
  reviewerId: string | null;
};

export function MetaPanel({
  values,
  profiles,
  canEdit,
  classificationLocked,
}: {
  values: MetaValues;
  profiles: ProfileOption[];
  canEdit: boolean;
  /** Classification cannot change once content is approved. */
  classificationLocked: boolean;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [contentType, setContentType] = useState(values.contentType);
  const [classification, setClassification] = useState(values.classification);
  const [channel, setChannel] = useState(values.channel ?? NONE);
  const [audience, setAudience] = useState(values.targetAudience ?? "");
  const [excerpt, setExcerpt] = useState(values.excerpt ?? "");
  const [tags, setTags] = useState(values.tags);
  const [tagInput, setTagInput] = useState("");
  const [reviewerId, setReviewerId] = useState(values.reviewerId ?? NONE);

  const addTags = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim().toLowerCase().slice(0, 40))
      .filter(Boolean);
    if (next.length > 0) setTags((current) => Array.from(new Set([...current, ...next])).slice(0, 12));
    setTagInput("");
  };

  const dirty =
    contentType !== values.contentType ||
    classification !== values.classification ||
    channel !== (values.channel ?? NONE) ||
    audience !== (values.targetAudience ?? "") ||
    excerpt !== (values.excerpt ?? "") ||
    reviewerId !== (values.reviewerId ?? NONE) ||
    tagInput.trim() !== "" ||
    tags.join("|") !== values.tags.join("|");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const pendingTags = tagInput
          .split(",")
          .map((t) => t.trim().toLowerCase().slice(0, 40))
          .filter(Boolean);
        const allTags = Array.from(new Set([...tags, ...pendingTags])).slice(0, 12);
        setTags(allTags);
        setTagInput("");
        run(() =>
          updateArticleMeta({
            id: values.id,
            contentType,
            classification,
            channel: channel === NONE ? null : channel,
            targetAudience: audience.trim() || null,
            excerpt: excerpt.trim() || null,
            tags: allTags,
            reviewerId: reviewerId === NONE ? null : reviewerId,
          }),
        );
      }}
    >
      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-80">
        <FormField label="Contenttype" htmlFor="meta-type" error={fieldErrors.contentType}>
          <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)} disabled={!canEdit}>
            <SelectTrigger id="meta-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Classificatie"
          htmlFor="meta-classification"
          error={fieldErrors.classification}
          help={
            classificationLocked
              ? "Niet te wijzigen bij goedgekeurde content."
              : classification !== values.classification && classification === "external"
                ? "Let op: bij wisselen naar extern wordt de toestemming voor externe publicatie teruggezet naar ‘nog niet geverifieerd’."
                : undefined
          }
        >
          <Select
            value={classification}
            onValueChange={(v) => setClassification(v as Classification)}
            disabled={!canEdit || classificationLocked}
          >
            <SelectTrigger id="meta-classification" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="external">Extern</SelectItem>
              <SelectItem value="internal">Intern</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Kanaal" htmlFor="meta-channel" error={fieldErrors.channel}>
          <Select value={channel} onValueChange={setChannel} disabled={!canEdit}>
            <SelectTrigger id="meta-channel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nog niet bepaald</SelectItem>
              {CHANNEL_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Doelgroep" htmlFor="meta-audience" error={fieldErrors.targetAudience}>
          <Input id="meta-audience" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={120} />
        </FormField>

        <FormField label="Samenvatting" htmlFor="meta-excerpt" error={fieldErrors.excerpt} help="Wordt gebruikt in nieuwsbrieven en als invalshoek voor de agent.">
          <Textarea id="meta-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} maxLength={500} />
        </FormField>

        <FormField label="Tags" htmlFor="meta-tags" error={fieldErrors.tags} help="Scheid tags met een komma of druk op Enter.">
          {tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted pr-1 pl-2.5 text-xs font-medium">
                  {tag}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setTags((current) => current.filter((t) => t !== tag))}
                      aria-label={`Tag ${tag} verwijderen`}
                      className="flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Input
            id="meta-tags"
            value={tagInput}
            onChange={(e) => (e.target.value.includes(",") ? addTags(e.target.value) : setTagInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTags(tagInput);
              }
            }}
            placeholder={tags.length >= 12 ? "Maximaal 12 tags" : "Tag toevoegen…"}
            disabled={tags.length >= 12}
          />
        </FormField>

        <FormField label="Reviewer" htmlFor="meta-reviewer" error={fieldErrors.reviewerId}>
          <Select value={reviewerId} onValueChange={setReviewerId} disabled={!canEdit}>
            <SelectTrigger id="meta-reviewer" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Geen reviewer</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </fieldset>

      {canEdit ? (
        <SubmitButton pending={pending} variant="outline" className="w-full" disabled={!dirty}>
          Eigenschappen opslaan
        </SubmitButton>
      ) : (
        <p className="text-xs text-muted-foreground">Je hebt geen rechten om de eigenschappen te wijzigen.</p>
      )}
    </form>
  );
}
