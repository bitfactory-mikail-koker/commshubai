"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { submitTip } from "@/actions/redactie";
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
import { Textarea } from "@/components/ui/textarea";

const EMPTY = { subject: "", text: "" };

const OUTCOME_LABELS: Record<string, string> = {
  new_proposal: "Nieuw voorstel voor de redactie",
  addition: "Toegevoegd aan een onderwerp dat al loopt",
  rubric: "Item voor een vaste rubriek",
  nothing: "Geen nieuws voor de redactie",
};

/**
 * The tip form. Open to every signed-in colleague. The bot sorts the tip and
 * answers at once: a new proposal, an addition to a topic that is already
 * running, an item for a fixed rubric, or not news.
 */
export function TipDialog({ variant = "default" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [answer, setAnswer] = useState<{ outcome: string; reply: string } | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const { run, pending, fieldErrors, clearErrors } = useAction();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.text.trim().length < 20) {
      setTextError("Vertel in minimaal 20 tekens wat er speelt.");
      return;
    }
    setTextError(null);
    run(() => submitTip({ text: form.text, subject: form.subject || undefined }), {
      silent: true,
      onSuccess: (result) => {
        setAnswer(result.data);
        setForm(EMPTY);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          clearErrors();
          setTextError(null);
          setAnswer(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant}>
          <PenLine data-icon="inline-start" />
          Tip doorgeven
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {answer ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>{OUTCOME_LABELS[answer.outcome] ?? "Tip ontvangen"}</DialogTitle>
              <DialogDescription>Het antwoord van de bot op je tip.</DialogDescription>
            </DialogHeader>
            <p className="rounded-md border bg-subtle px-3.5 py-3 text-sm leading-relaxed" role="status">
              {answer.reply}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {answer.outcome === "nothing"
                ? "Je bericht is niet bewaard."
                : "De redactie beslist of er een stuk van komt. Er verschijnt niets van jou zonder jouw akkoord."}
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAnswer(null)}>
                Nog een tip
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Sluiten
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Tip doorgeven</DialogTitle>
              <DialogDescription>
                Heb je nieuws, een mooi resultaat of een idee voor een verhaal? De bot beoordeelt je tip en zegt meteen wat ermee
                gebeurt. De redactie beslist of er een stuk van komt.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <FormField label="Onderwerp" htmlFor="tip-subject" error={fieldErrors.subject} help="Optioneel. Een paar woorden zijn genoeg.">
                <Input
                  id="tip-subject"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Bijvoorbeeld: livegang nieuwe website"
                  maxLength={160}
                  aria-invalid={Boolean(fieldErrors.subject)}
                />
              </FormField>
              <FormField
                label="Wat speelt er?"
                htmlFor="tip-text"
                error={textError ?? fieldErrors.text}
                help="Vertel wat er is gebeurd, wie erbij betrokken is en welke resultaten bekend zijn. Minimaal 20 tekens."
                required
              >
                <Textarea
                  id="tip-text"
                  value={form.text}
                  onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                  rows={6}
                  maxLength={6000}
                  required
                  aria-invalid={Boolean(textError ?? fieldErrors.text)}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>{pending ? "Tip wordt beoordeeld…" : "Versturen"}</SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
