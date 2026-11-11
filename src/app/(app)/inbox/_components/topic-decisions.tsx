"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock, Share2, Undo2 } from "lucide-react";
import { declineOpportunity } from "@/actions/signals";
import { pickUpTopicAction, releaseTopicAction, reopenTopicAction, snoozeTopicAction } from "@/actions/topics";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listColleagues } from "./people-action";
import { PeoplePicker, type PickablePerson } from "./people-picker";

/**
 * Beoordelen: what an editor can do with a proposal. One component, used in
 * the inbox, on the bureau pages and on a signal, so the decisions and their
 * wording are the same everywhere.
 */

export type DecisionTopic = {
  id: string;
  title: string;
  status: string;
  classification: "internal" | "external";
  /** Picking up starts an interview, except for a social post. */
  needsInterview: boolean;
  internalOnly: boolean;
  released: boolean;
  hasArticle: boolean;
};

const DECLINE_REASONS = ["Geen nieuws", "Al eerder over geschreven", "Te vertrouwelijk", "Komt nu niet uit"];

const pad = (n: number) => String(n).padStart(2, "0");
const dateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

type DialogKind = "pickup" | "snooze" | "decline" | "release" | null;

export function TopicDecisions({
  topic,
  suggested,
  canManage,
  canRelease,
}: {
  topic: DecisionTopic;
  /** The people the bot would interview if nothing is changed. */
  suggested: PickablePerson[];
  canManage: boolean;
  /** Releasing an internal topic for external use needs the right to approve content. */
  canRelease: boolean;
}) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const { run, pending } = useAction();
  const close = () => setDialog(null);

  if (!canManage) return null;

  const open = topic.status === "proposed" && !topic.hasArticle;
  const parked = (topic.status === "snoozed" || topic.status === "declined") && !topic.hasArticle;
  // Internal stays internal: an external proposal from an internal source waits for an editor's release.
  const blocked = topic.classification === "external" && topic.internalOnly && !topic.released;
  const releasable = !topic.released && (topic.classification === "internal" || blocked) && topic.status !== "declined";

  return (
    <div className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
      {releasable && canRelease && (
        <Button variant="ghost" size="sm" onClick={() => setDialog("release")}>
          <Share2 data-icon="inline-start" />
          Vrijgeven voor extern
        </Button>
      )}
      {parked && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => run(() => reopenTopicAction({ id: topic.id }))}
        >
          <Undo2 data-icon="inline-start" />
          Terug naar de inbox
        </Button>
      )}
      {open && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setDialog("decline")}>
            Afwijzen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialog("snooze")}>
            <Clock data-icon="inline-start" />
            Later
          </Button>
          {!blocked && (
            <Button size="sm" onClick={() => setDialog("pickup")}>
              Oppakken
              <ArrowRight data-icon="inline-end" />
            </Button>
          )}
        </>
      )}

      {dialog === "pickup" && <PickUpDialog topic={topic} suggested={suggested} onClose={close} />}
      {dialog === "snooze" && <SnoozeDialog topic={topic} onClose={close} />}
      {dialog === "decline" && <DeclineDialog topic={topic} onClose={close} />}
      {dialog === "release" && <ReleaseDialog topic={topic} blocked={blocked} onClose={close} />}
    </div>
  );
}

function PickUpDialog({ topic, suggested, onClose }: { topic: DecisionTopic; suggested: PickablePerson[]; onClose: () => void }) {
  const { run, pending } = useAction();
  const [people, setPeople] = useState<PickablePerson[]>(suggested);
  const [chosen, setChosen] = useState<string[]>(suggested.map((p) => p.id));

  useEffect(() => {
    if (!topic.needsInterview) return;
    let active = true;
    listColleagues()
      .then((all) => {
        if (active && all.length > 0) setPeople(all);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [topic.needsInterview]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => pickUpTopicAction({ id: topic.id, intervieweeIds: topic.needsInterview ? chosen : undefined }), {
      onSuccess: onClose,
      redirectTo: (result) => `/editorial/${result.data.articleId}`,
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Onderwerp oppakken</DialogTitle>
            <DialogDescription>
              {topic.needsInterview
                ? `Er wordt een stuk gestart voor “${topic.title}”. De bot nodigt de mensen hieronder uit voor een kort interview. Of een bericht echt uitgaat, hangt af van de gedragsregels van de bot (schaduwmodus, afwezigheid, limiet per persoon).`
                : `Er wordt een stuk gestart voor “${topic.title}”. Een social post heeft geen interview nodig; de tekst loopt via de redactie.`}
            </DialogDescription>
          </DialogHeader>

          {topic.needsInterview && (
            <FormField
              label="Wie interviewt de bot?"
              help={
                chosen.length === 0
                  ? "Niemand gekozen: het stuk start zonder interview. Je kunt later alsnog een interview aanvragen."
                  : "Maximaal drie mensen. Developers worden normaal niet geïnterviewd; kies liever de DM of de Team Lead."
              }
            >
              <PeoplePicker id={`pickup-${topic.id}`} people={people} value={chosen} onChange={setChosen} max={3} />
            </FormField>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>{pending ? "Stuk wordt gestart…" : "Oppakken"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SnoozeDialog({ topic, onClose }: { topic: DecisionTopic; onClose: () => void }) {
  const { run, pending } = useAction();
  const [date, setDate] = useState(() => dateIn(7));
  const inputId = `snooze-${topic.id}`;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => snoozeTopicAction({ id: topic.id, until: `${date}T09:00` }), { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Later beoordelen</DialogTitle>
            <DialogDescription>
              “{topic.title}” verdwijnt uit de inbox en komt op de gekozen dag vanzelf terug. Er wordt niets gestart.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Terug in de inbox op" htmlFor={inputId} required>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={inputId}
                type="date"
                value={date}
                min={dateIn(1)}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-44"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setDate(dateIn(7))}>
                Over een week
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDate(dateIn(30))}>
                Over een maand
              </Button>
            </div>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Op later zetten</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({ topic, onClose }: { topic: DecisionTopic; onClose: () => void }) {
  const { run, pending } = useAction();
  const [reason, setReason] = useState("");
  const inputId = `decline-${topic.id}`;
  const tooShort = reason.trim().length < 3;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (tooShort) return;
    run(() => declineOpportunity({ id: topic.id, reason: reason.trim() }), { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Voorstel afwijzen</DialogTitle>
            <DialogDescription>
              “{topic.title}” wordt niet opgepakt. Het signaal blijft bewaard. De reden wordt vastgelegd in het logboek, zodat de bot later
              van afwijzingen kan leren.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Waarom niet?" htmlFor={inputId} required>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {DECLINE_REASONS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={reason === preset}
                    className="aria-pressed:bg-secondary aria-pressed:ring-1 aria-pressed:ring-border aria-pressed:ring-inset"
                    onClick={() => setReason(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              <Textarea
                id={inputId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Kies een reden of schrijf er zelf een"
                required
              />
            </div>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending} variant="destructive" disabled={tooShort}>
              Afwijzen
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({ topic, blocked, onClose }: { topic: DecisionTopic; blocked: boolean; onClose: () => void }) {
  const { run, pending, fieldErrors } = useAction();
  const [reason, setReason] = useState("");
  const inputId = `release-${topic.id}`;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => releaseTopicAction({ id: topic.id, reason }), { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Vrijgeven voor extern gebruik</DialogTitle>
            <DialogDescription>
              Intern blijft intern, tenzij een redacteur een onderwerp vrijgeeft. Je geeft “{topic.title}” vrij. Jouw naam en de reden
              komen in het logboek.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 text-[0.8125rem] leading-relaxed">
            <p className="font-medium">Wat er daarna gebeurt</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                {blocked
                  ? "Dit externe voorstel kan worden opgepakt."
                  : "Het externe bureau krijgt een eigen voorstel in de inbox. De interne tekst gaat niet naar buiten."}
              </li>
              <li>Het externe bureau schrijft een nieuwe tekst.</li>
              <li>Iedereen die geciteerd wordt, keurt opnieuw goed, nu voor extern gebruik.</li>
              <li>Voor publicatie legt een redacteur een eindcontrole vast, zin voor zin.</li>
            </ol>
          </div>

          <FormField
            label="Waarom mag dit naar buiten?"
            htmlFor={inputId}
            error={fieldErrors.reason}
            help="Minimaal één zin, bijvoorbeeld wie akkoord gaf of waarom het niet meer vertrouwelijk is."
            required
          >
            <Textarea
              id={inputId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              required
              aria-invalid={Boolean(fieldErrors.reason)}
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Vrijgeven</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
