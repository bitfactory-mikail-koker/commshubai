"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { createCalendarDeadline } from "@/actions/settings";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { zonedInputFromNow, zonedInputToIso } from "../../editorial/_components/zoned-input";

const NONE = "none";

export function AddDeadlineDialog() {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [classification, setClassification] = useState(NONE);
  const [notes, setNotes] = useState("");

  const openDialog = () => {
    setTitle("");
    setNotes("");
    setClassification(NONE);
    setWhen(zonedInputFromNow(7, 17));
    clearErrors();
    setOpen(true);
  };

  return (
    <>
      <Button onClick={openDialog}>
        <CalendarPlus />
        Deadline toevoegen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  createCalendarDeadline({
                    title,
                    // The input holds a wall-clock time in the app timezone; send an absolute timestamp.
                    startsAt: zonedInputToIso(when),
                    notes: notes.trim() || undefined,
                    classification: classification === NONE ? null : (classification as "internal" | "external"),
                  }),
                { onSuccess: () => setOpen(false) },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Deadline toevoegen</DialogTitle>
              <DialogDescription>
                Voor redactionele afspraken die niet aan een contentitem hangen, zoals een kopijdeadline. Geplande artikelen, interviews
                en nieuwsbrieven komen vanzelf op de kalender.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Titel" htmlFor="deadline-title" error={fieldErrors.title} required>
              <Input
                id="deadline-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bijvoorbeeld: kopij interne nieuwsbrief aanleveren"
                required
                minLength={3}
                maxLength={160}
                autoFocus
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Datum en tijd"
                htmlFor="deadline-when"
                error={fieldErrors.startsAt}
                help="Nederlandse tijd."
                required
              >
                <Input id="deadline-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
              </FormField>
              <FormField label="Soort communicatie" htmlFor="deadline-classification">
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger id="deadline-classification" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Algemeen</SelectItem>
                    <SelectItem value="external">Extern</SelectItem>
                    <SelectItem value="internal">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Notitie" htmlFor="deadline-notes" error={fieldErrors.notes}>
              <Textarea id="deadline-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={600} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Toevoegen</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
