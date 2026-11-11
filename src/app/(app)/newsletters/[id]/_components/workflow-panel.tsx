"use client";

import { useState } from "react";
import { Archive, CalendarClock, Check, MessageSquareWarning, RotateCcw, Send, SendHorizonal } from "lucide-react";
import { newsletterWorkflow } from "@/actions/newsletters";
import { ActionButton, FormField, SubmitButton, useAction } from "@/components/shared/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { toDateTimeLocal } from "@/lib/format";
import type { NewsletterStatus } from "@/lib/types";

export type WorkflowPermissions = { canEdit: boolean; canReview: boolean; canApprove: boolean; canPublish: boolean };

function RequestChangesDialog({ id }: { id: string }) {
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquareWarning />
          Wijzigingen vragen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wijzigingen vragen</DialogTitle>
          <DialogDescription>De nieuwsbrief gaat terug naar de redactie. Beschrijf wat er moet veranderen.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => newsletterWorkflow({ id, action: "request_changes", note }), { onSuccess: () => setOpen(false) });
          }}
        >
          <FormField label="Toelichting" htmlFor="newsletter-change-note" required>
            <Textarea
              id="newsletter-change-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              required
              minLength={3}
              maxLength={2000}
              placeholder="Bijv. de inleiding noemt een item dat niet meer is geselecteerd."
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending} disabled={note.trim().length < 3}>
              Wijzigingen vragen
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ id, sendAt }: { id: string; sendAt: string | null }) {
  const { run, pending } = useAction();
  const [value, setValue] = useState(toDateTimeLocal(sendAt));
  return (
    <form
      className="flex basis-full flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value) return;
        run(() => newsletterWorkflow({ id, action: "schedule", sendAt: new Date(value).toISOString() }));
      }}
    >
      <FormField label="Verzendmoment" htmlFor="newsletter-send-at" className="min-w-52 flex-1">
        <Input id="newsletter-send-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} required />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending || !value}>
        <CalendarClock />
        {pending ? "Inplannen…" : sendAt ? "Opnieuw inplannen" : "Verzending inplannen"}
      </Button>
    </form>
  );
}

const SEND_CONFIRM = {
  title: "Nieuwsbrief verzenden (gesimuleerd)?",
  description:
    "Er is geen e-mailintegratie verbonden. De nieuwsbrief wordt gemarkeerd als verzonden en vastgelegd als gesimuleerde verzending; er gaat geen e-mail de deur uit.",
  confirmLabel: "Markeren als verzonden",
};

export function WorkflowPanel({
  id,
  status,
  sendAt,
  includedCount,
  permissions,
}: {
  id: string;
  status: NewsletterStatus;
  sendAt: string | null;
  includedCount: number;
  permissions: WorkflowPermissions;
}) {
  const { canEdit, canReview, canApprove, canPublish } = permissions;
  const act = (action: "submit" | "approve" | "reopen" | "send" | "archive") => newsletterWorkflow.bind(null, { id, action });

  const reopen = canEdit && (
    <ActionButton
      action={act("reopen")}
      variant="ghost"
      confirm={{
        title: "Heropenen als concept?",
        description:
          "De nieuwsbrief wordt weer bewerkbaar. Een eerdere goedkeuring en planning vervallen; voor verzending is een nieuwe goedkeuring nodig.",
        confirmLabel: "Heropenen",
      }}
    >
      <RotateCcw />
      Heropenen als concept
    </ActionButton>
  );

  const send = canPublish && (
    <ActionButton action={act("send")} confirm={SEND_CONFIRM} pendingLabel="Verzenden…">
      <SendHorizonal />
      Verzenden (gesimuleerd)
    </ActionButton>
  );

  let hint: string;
  let controls: React.ReactNode = null;

  switch (status) {
    case "draft":
    case "changes_requested":
      hint =
        status === "changes_requested"
          ? "Er zijn wijzigingen gevraagd. Verwerk ze en dien de nieuwsbrief opnieuw in."
          : "Selecteer en bewerk de inhoud en dien de nieuwsbrief daarna in ter goedkeuring.";
      controls = canEdit && (
        <>
          <ActionButton action={act("submit")} disabled={includedCount === 0} pendingLabel="Indienen…">
            <Send />
            Indienen ter goedkeuring
          </ActionButton>
          <ActionButton
            action={act("archive")}
            variant="ghost"
            confirm={{
              title: "Nieuwsbrief archiveren?",
              description: "De nieuwsbrief verdwijnt uit de planning. Je kunt hem later heropenen als concept.",
              confirmLabel: "Archiveren",
            }}
          >
            <Archive />
            Archiveren
          </ActionButton>
        </>
      );
      if (canEdit && includedCount === 0) hint = "Selecteer minimaal één item voordat je de nieuwsbrief indient.";
      break;
    case "in_review":
      hint = canApprove
        ? "Controleer het voorbeeld. Met je goedkeuring mag deze versie worden ingepland of verzonden."
        : canReview
          ? "Je kunt wijzigingen vragen. Goedkeuren kan alleen iemand met het recht ‘Content goedkeuren’."
          : "De nieuwsbrief wacht op een besluit van een goedkeurder.";
      controls = (
        <>
          {canApprove && (
            <ActionButton action={act("approve")} pendingLabel="Goedkeuren…">
              <Check />
              Goedkeuren
            </ActionButton>
          )}
          {(canReview || canApprove) && <RequestChangesDialog id={id} />}
          {canEdit && (
            <ActionButton action={act("reopen")} variant="ghost">
              <RotateCcw />
              Intrekken en verder bewerken
            </ActionButton>
          )}
        </>
      );
      break;
    case "approved":
      hint = canPublish
        ? "Goedgekeurd. Plan de verzending in of verzend direct."
        : "Goedgekeurd. Iemand met het recht ‘Content publiceren’ kan de verzending inplannen.";
      controls = (
        <>
          {canPublish && <ScheduleForm id={id} sendAt={sendAt} />}
          <div className="flex basis-full flex-wrap gap-2">
            {send}
            {reopen}
          </div>
        </>
      );
      break;
    case "scheduled":
      hint = "De verzending is ingepland. Op het geplande moment wordt de nieuwsbrief als (gesimuleerd) verzonden gemarkeerd.";
      controls = (
        <>
          {canPublish && <ScheduleForm id={id} sendAt={sendAt} />}
          <div className="flex basis-full flex-wrap gap-2">
            {send}
            {reopen}
          </div>
        </>
      );
      break;
    case "sent":
      hint = "Deze nieuwsbrief is verzonden en kan niet meer worden gewijzigd.";
      controls = canEdit && (
        <ActionButton action={act("archive")} variant="outline">
          <Archive />
          Archiveren
        </ActionButton>
      );
      break;
    default:
      hint = "Deze nieuwsbrief is gearchiveerd.";
      controls = canEdit && (
        <ActionButton action={act("reopen")} variant="outline">
          <RotateCcw />
          Heropenen als concept
        </ActionButton>
      );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
      {controls && <div className="flex flex-wrap items-end gap-2">{controls}</div>}
    </div>
  );
}
