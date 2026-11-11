"use client";

import { useState } from "react";
import { saveChannel } from "@/actions/redactie";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BUREAU_LABELS, CHANNEL_CONFIDENTIALITY_LABELS, FOLLOW_MODE_OPTIONS } from "@/lib/constants";
import type { ChannelBureau, ChannelConfidentiality, FollowMode } from "@/lib/types";
import { explanationText, type ExplanationRule } from "./explanation";

export type ChannelValues = {
  id?: string;
  slackChannelId: string;
  name: string;
  isPrivate: boolean;
  hasExternalMembers: boolean;
  followed: boolean;
  expectation: string;
  followMode: FollowMode;
  bureau: ChannelBureau;
  confidentiality: ChannelConfidentiality;
  projectId: string | null;
  explainEveryDays: number;
  lookbackDays: number;
};

export const NEW_CHANNEL: ChannelValues = {
  slackChannelId: "",
  name: "",
  isPrivate: false,
  hasExternalMembers: false,
  followed: true,
  expectation: "",
  followMode: "emoji_only",
  bureau: "both",
  confidentiality: "internal_only",
  projectId: null,
  explainEveryDays: 30,
  lookbackDays: 30,
};

const NO_PROJECT = "none";

export function ChannelDialog({
  channel,
  projects,
  rules,
  botName,
  contactPerson,
  lookbackMaxDays,
  slackConnected,
  canManage,
  children,
}: {
  channel: ChannelValues;
  projects: { id: string; name: string }[];
  rules: ExplanationRule[];
  botName: string;
  contactPerson: string;
  lookbackMaxDays: number;
  slackConnected: boolean;
  canManage: boolean;
  children: React.ReactNode;
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(channel);
  const [explain, setExplain] = useState(String(channel.explainEveryDays));
  const [lookback, setLookback] = useState(String(channel.lookbackDays));
  const set = <K extends keyof ChannelValues>(key: K, value: ChannelValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const isNew = !channel.id;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setValues(channel);
      setExplain(String(channel.explainEveryDays));
      setLookback(String(channel.lookbackDays));
      clearErrors();
    }
  };

  // The bot never follows a private channel or a channel with customers or guests.
  const blocked = values.isPrivate || values.hasExternalMembers;
  const blockedReason = values.isPrivate
    ? "Dit is een besloten kanaal. De bot volgt nooit besloten kanalen."
    : "In dit kanaal zitten klanten of gasten. De bot volgt nooit kanalen met externen.";
  const followed = values.followed && !blocked;

  const explainDays = Number(explain);
  const lookbackDays = Number(lookback);
  const explainError = explain.trim() === "" || !Number.isInteger(explainDays) || explainDays < 0 || explainDays > 365 ? "Vul 0 tot 365 dagen in." : undefined;
  const lookbackError =
    lookback.trim() === "" || !Number.isInteger(lookbackDays) || lookbackDays < 0
      ? "Vul een heel aantal dagen in."
      : lookbackDays > lookbackMaxDays
        ? `Maximaal ${lookbackMaxDays} dagen (ingesteld bij Gedrag en postvak).`
        : undefined;
  const valid = values.slackChannelId.trim().length >= 2 && values.name.trim().length >= 1 && !explainError && !lookbackError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Kanaal toevoegen" : canManage ? `#${channel.name} bewerken` : `#${channel.name}`}</DialogTitle>
          <DialogDescription>
            {slackConnected
              ? "Slack is verbonden: de naam en of het kanaal besloten is of externen bevat, worden bij het opslaan uit Slack overgenomen."
              : "Er is geen Slack-workspace verbonden. Je vult de gegevens van het kanaal hier zelf in."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canManage || !valid) return;
            run(() => saveChannel({ ...values, followed, explainEveryDays: explainDays, lookbackDays }), { onSuccess: () => setOpen(false) });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Kanaal-ID in Slack"
              htmlFor="channel-id"
              error={fieldErrors.slackChannelId}
              help="Begint met een C. Te vinden onder ‘Kanaalgegevens’ in Slack."
              required
            >
              <Input
                id="channel-id"
                required
                value={values.slackChannelId}
                readOnly={!canManage}
                placeholder="C0123ABCD"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => set("slackChannelId", e.target.value.trim())}
              />
            </FormField>
            <FormField label="Naam" htmlFor="channel-name" error={fieldErrors.name} required>
              <Input
                id="channel-name"
                required
                value={values.name}
                readOnly={!canManage}
                placeholder="project-rijnmond"
                onChange={(e) => set("name", e.target.value.replace(/^#/, ""))}
              />
            </FormField>
          </div>

          <div className="space-y-2.5 border-t pt-4">
            <p className="text-[0.8rem] font-medium">Wat voor kanaal is dit?</p>
            <label className="flex items-start gap-2.5 text-[0.8125rem]" htmlFor="channel-private">
              <Checkbox
                id="channel-private"
                checked={values.isPrivate}
                disabled={!canManage}
                onCheckedChange={(checked) => set("isPrivate", checked === true)}
                className="mt-0.5"
              />
              <span>Dit is een besloten kanaal</span>
            </label>
            <label className="flex items-start gap-2.5 text-[0.8125rem]" htmlFor="channel-external">
              <Checkbox
                id="channel-external"
                checked={values.hasExternalMembers}
                disabled={!canManage}
                onCheckedChange={(checked) => set("hasExternalMembers", checked === true)}
                className="mt-0.5"
              />
              <span>In dit kanaal zitten klanten, gasten of een andere organisatie (Slack Connect)</span>
            </label>
          </div>

          <div className="flex items-start justify-between gap-6 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="channel-followed" className="text-sm font-medium">
                De bot volgt dit kanaal
              </Label>
              <p className="max-w-[56ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                {blocked
                  ? `${blockedReason} De database weigert het ook als iemand het toch probeert.`
                  : "Zodra je dit aanzet stelt de bot zich in het kanaal voor met het bericht hieronder."}
              </p>
            </div>
            <Switch
              id="channel-followed"
              checked={followed}
              disabled={!canManage || blocked}
              onCheckedChange={(checked) => set("followed", checked)}
              className="mt-0.5"
            />
          </div>

          <fieldset className="space-y-4 border-t pt-4 disabled:opacity-60" disabled={!followed}>
            <legend className="sr-only">Hoe de bot dit kanaal volgt</legend>
            <FormField
              label="Verwachting"
              htmlFor="channel-expectation"
              error={fieldErrors.expectation}
              help="Waarom volgt de bot dit kanaal? Komt letterlijk in het uitlegbericht, na “Ik volg dit kanaal om”."
            >
              <Textarea
                id="channel-expectation"
                rows={2}
                value={values.expectation}
                readOnly={!canManage}
                placeholder="opleveringen op te pikken voor klantcases"
                onChange={(e) => set("expectation", e.target.value)}
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Manier van volgen"
                htmlFor="channel-mode"
                error={fieldErrors.followMode}
                help={FOLLOW_MODE_OPTIONS.find((o) => o.value === values.followMode)?.help}
              >
                <Select value={values.followMode} disabled={!canManage} onValueChange={(v) => set("followMode", v as FollowMode)}>
                  <SelectTrigger id="channel-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Bureau" htmlFor="channel-bureau" error={fieldErrors.bureau} help="Welk bureau krijgt de voorstellen uit dit kanaal.">
                <Select value={values.bureau} disabled={!canManage} onValueChange={(v) => set("bureau", v as ChannelBureau)}>
                  <SelectTrigger id="channel-bureau" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BUREAU_LABELS) as ChannelBureau[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {BUREAU_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label="Vertrouwelijkheid"
                htmlFor="channel-confidentiality"
                error={fieldErrors.confidentiality}
                help={
                  values.confidentiality === "internal_only"
                    ? "Wat hier vandaan komt blijft intern, tot een redacteur een onderwerp vrijgeeft voor extern gebruik."
                    : "Een verhaal uit dit kanaal mag extern worden gebruikt, na akkoord van de betrokkenen."
                }
              >
                <Select value={values.confidentiality} disabled={!canManage} onValueChange={(v) => set("confidentiality", v as ChannelConfidentiality)}>
                  <SelectTrigger id="channel-confidentiality" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CHANNEL_CONFIDENTIALITY_LABELS) as ChannelConfidentiality[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CHANNEL_CONFIDENTIALITY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Project" htmlFor="channel-project" error={fieldErrors.projectId} help="Signalen uit dit kanaal worden aan dit project gekoppeld.">
                <Select value={values.projectId ?? NO_PROJECT} disabled={!canManage} onValueChange={(v) => set("projectId", v === NO_PROJECT ? null : v)}>
                  <SelectTrigger id="channel-project" className="w-full">
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
              <FormField
                label="Uitlegbericht herhalen (dagen)"
                htmlFor="channel-explain"
                error={explainError ?? fieldErrors.explainEveryDays}
                help="Om de zoveel dagen zegt de bot opnieuw waarom hij er is. 0 betekent alleen bij de start."
              >
                <Input
                  id="channel-explain"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={explain}
                  readOnly={!canManage}
                  aria-invalid={Boolean(explainError)}
                  onChange={(e) => setExplain(e.target.value)}
                  className="w-28"
                />
              </FormField>
              <FormField
                label="Terugkijken (dagen)"
                htmlFor="channel-lookback"
                error={lookbackError ?? fieldErrors.lookbackDays}
                help={`Na een nieuw signaal mag de bot zo ver terugzoeken naar hetzelfde onderwerp. Maximaal ${lookbackMaxDays}; 0 betekent niet terugkijken.`}
              >
                <Input
                  id="channel-lookback"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={lookbackMaxDays}
                  value={lookback}
                  readOnly={!canManage}
                  aria-invalid={Boolean(lookbackError)}
                  onChange={(e) => setLookback(e.target.value)}
                  className="w-28"
                />
              </FormField>
            </div>

            <div className="space-y-1.5">
              <p className="text-[0.8rem] font-medium">Dit zegt de bot in het kanaal</p>
              <p className="rounded-md bg-subtle px-3 py-2.5 text-[0.8125rem] leading-relaxed text-pretty">
                {explanationText({ botName, contactPerson, expectation: values.expectation, followMode: values.followMode, rules })}
              </p>
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {canManage ? "Annuleren" : "Sluiten"}
            </Button>
            {canManage && (
              <SubmitButton pending={pending} disabled={!valid}>
                {isNew ? "Kanaal toevoegen" : "Opslaan"}
              </SubmitButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
