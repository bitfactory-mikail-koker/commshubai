"use client";

import { useState } from "react";
import { Check, Clock, Play, UserRoundX } from "lucide-react";
import { confirmSummaryAction, respondToInviteAction } from "@/actions/interviews";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** The interviewee's answer to the invitation: now, later, or "I am not the right person". Saying no is fine too. */
export function InviteChoices({ interviewId, questionCount }: { interviewId: string; questionCount: number }) {
  const { run, pending } = useAction();
  const [redirectOpen, setRedirectOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">
        De redactie wil je {questionCount} korte vragen stellen. Je krijgt ze één voor één en antwoordt in je eigen woorden. Er verschijnt
        niets van jou zonder dat jij het hebt goedgekeurd.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(() => respondToInviteAction({ id: interviewId, choice: "now" }))}>
          <Play />
          Nu beginnen
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(() => respondToInviteAction({ id: interviewId, choice: "later" }))}>
          <Clock />
          Later
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setRedirectOpen(true)}>
          <UserRoundX />
          Ik ben niet de juiste persoon
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() => run(() => respondToInviteAction({ id: interviewId, choice: "declined" }))}
        >
          Liever niet
        </Button>
      </div>

      <Dialog open={redirectOpen} onOpenChange={setRedirectOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => respondToInviteAction({ id: interviewId, choice: "redirect", redirectTo }), { onSuccess: () => setRedirectOpen(false) });
            }}
          >
            <DialogHeader>
              <DialogTitle>Niet de juiste persoon</DialogTitle>
              <DialogDescription>De redactie hoort dat jij hier niet over gaat en kiest wie er wel wordt gevraagd.</DialogDescription>
            </DialogHeader>
            <FormField label="Wie weet er meer van? (optioneel)" htmlFor="redirect-to">
              <Input id="redirect-to" value={redirectTo} onChange={(e) => setRedirectTo(e.target.value)} maxLength={200} autoFocus />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRedirectOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Doorgeven</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "Klopt dit?": the interviewee confirms what the bot understood, or corrects it. */
export function ConfirmSummary({ interviewId }: { interviewId: string }) {
  const { run, pending, fieldErrors } = useAction();
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState("");

  if (!correcting) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(() => confirmSummaryAction({ id: interviewId }))}>
          <Check />
          Ja, dit klopt
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setCorrecting(true)}>
          Er klopt iets niet
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => confirmSummaryAction({ id: interviewId, correction }));
      }}
    >
      <FormField label="Wat moet er anders of ontbreekt er?" htmlFor="summary-correction" error={fieldErrors.correction} required>
        <Textarea
          id="summary-correction"
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          rows={4}
          minLength={3}
          maxLength={4000}
          required
          autoFocus
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending}>Correctie doorgeven</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setCorrecting(false)} disabled={pending}>
          Annuleren
        </Button>
      </div>
    </form>
  );
}
