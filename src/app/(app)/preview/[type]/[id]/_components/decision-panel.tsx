"use client";

import { useState } from "react";
import { Check, MessageSquareText, PencilLine, X } from "lucide-react";
import { approveMine, editAndApprove, refuseQuote, requestChange } from "@/actions/approvals";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/result";
import { RichTextEditor } from "../../../../editorial/[id]/_components/rich-text-editor";

export type DecisionItem = {
  id: string;
  kind: "piece" | "quote" | "passage";
  label: string;
  quote: string | null;
  /** True when the request is this person's own; false when they decide as an editor. */
  own: boolean;
};

/**
 * The three choices of someone who is asked to approve: akkoord, zelf
 * aanpassen, or ask for a change in their own words. A quote can also be
 * refused; it is then taken out of the text.
 */
export function DecisionPanel({
  items,
  editable,
  title,
  bodyHtml,
  rewriteNote,
}: {
  items: DecisionItem[];
  /** Whether "zelf aanpassen" is offered (articles only). */
  editable: boolean;
  title: string;
  bodyHtml: string;
  /** What happens after "aanpassing vragen", in one sentence. */
  rewriteNote: string;
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [mode, setMode] = useState<"change" | "edit" | "refuse" | null>(null);
  const [target, setTarget] = useState<DecisionItem | null>(null);
  const [note, setNote] = useState("");
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(bodyHtml);

  const quotes = items.filter((item) => item.kind === "quote");
  const first = items.find((item) => item.kind === "piece") ?? items[0];

  const close = () => {
    setMode(null);
    setTarget(null);
    setNote("");
    clearErrors();
  };

  const approveAll = () =>
    run(async () => {
      let last: ActionResult = { ok: true, data: undefined };
      for (const item of items) {
        last = await approveMine({ approvalId: item.id });
        if (!last.ok) return last;
      }
      return last;
    });

  return (
    <div className="space-y-4">
      {quotes.length > 0 && (
        <ul className="divide-y rounded-md border">
          {quotes.map((item) => (
            <li key={item.id} className="space-y-2 px-3 py-2.5">
              <p className="text-[0.8125rem] leading-relaxed">“{item.quote}”</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveMine({ approvalId: item.id }))}>
                  <Check />
                  Akkoord
                </Button>
                {item.own && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={pending}
                    onClick={() => {
                      setTarget(item);
                      setMode("refuse");
                    }}
                  >
                    <X />
                    Niet gebruiken
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Button className="w-full" disabled={pending} onClick={approveAll}>
          <Check />
          {quotes.length > 1 ? "Akkoord met alles" : "Akkoord"}
        </Button>
        <div className={editable ? "grid grid-cols-2 gap-2" : ""}>
          {editable && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setDraftTitle(title);
                setDraftBody(bodyHtml);
                setMode("edit");
              }}
            >
              <PencilLine />
              Zelf aanpassen
            </Button>
          )}
          <Button variant="outline" className="w-full" disabled={pending} onClick={() => setMode("change")}>
            <MessageSquareText />
            Aanpassing vragen
          </Button>
        </div>
      </div>

      {/* Ask for a change in plain words */}
      <Dialog open={mode === "change"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => requestChange({ approvalId: first.id, note }), { onSuccess: close });
            }}
          >
            <DialogHeader>
              <DialogTitle>Aanpassing vragen</DialogTitle>
              <DialogDescription>Zeg in je eigen woorden wat er anders moet. {rewriteNote}</DialogDescription>
            </DialogHeader>
            <FormField label="Wat moet er anders?" htmlFor="change-note" error={fieldErrors.note} required>
              <Textarea
                id="change-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                minLength={5}
                maxLength={2000}
                placeholder="Bijvoorbeeld: mijn functie is projectleider, niet projectmanager."
                required
                autoFocus
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Versturen</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refuse a quote */}
      <Dialog open={mode === "refuse"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (target) run(() => refuseQuote({ approvalId: target.id, note }), { onSuccess: close });
            }}
          >
            <DialogHeader>
              <DialogTitle>Dit citaat niet gebruiken</DialogTitle>
              <DialogDescription>
                Het citaat wordt uit de tekst gehaald. De anderen die al akkoord gaven krijgen alleen die wijziging te zien.
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-md bg-muted px-3 py-2 text-[0.8125rem] leading-relaxed">“{target?.quote}”</p>
            <FormField label="Toelichting (optioneel)" htmlFor="refuse-note">
              <Textarea id="refuse-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending} variant="destructive">
                Citaat weigeren
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit the text yourself */}
      <Dialog open={mode === "edit"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => editAndApprove({ approvalId: first.id, title: draftTitle, bodyHtml: draftBody }), { onSuccess: close });
            }}
          >
            <DialogHeader>
              <DialogTitle>Zelf aanpassen</DialogTitle>
              <DialogDescription>
                Opslaan maakt een nieuwe versie op jouw naam en geldt als jouw akkoord. De anderen krijgen alleen te zien wat jij hebt
                gewijzigd.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Titel" htmlFor="edit-title" error={fieldErrors.title} required>
              <Input id="edit-title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={200} required />
            </FormField>
            <div className="rounded-md border px-4 py-3">
              <RichTextEditor value={draftBody} editable onChange={({ html }) => setDraftBody(html)} onSelectionChange={() => undefined} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Opslaan en akkoord</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
