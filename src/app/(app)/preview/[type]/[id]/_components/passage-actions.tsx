"use client";

import { useState } from "react";
import { Check, MessageSquareText } from "lucide-react";
import { approveMine, requestChange } from "@/actions/approvals";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Akkoord or a change request on one passage of an edition, by the person it is based on. */
export function PassageActions({ approvalId }: { approvalId: string }) {
  const { run, pending, fieldErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveMine({ approvalId }))}>
        <Check />
        Akkoord
      </Button>
      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => setOpen(true)}>
        <MessageSquareText />
        Aanpassing vragen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => requestChange({ approvalId, note }), {
                onSuccess: () => {
                  setOpen(false);
                  setNote("");
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Aanpassing vragen</DialogTitle>
              <DialogDescription>
                Zeg wat er anders moet aan deze passage. De redactie past haar aan en legt haar opnieuw aan je voor.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Wat moet er anders?" htmlFor={`passage-note-${approvalId}`} error={fieldErrors.note} required>
              <Textarea
                id={`passage-note-${approvalId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                minLength={5}
                maxLength={2000}
                required
                autoFocus
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Versturen</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
