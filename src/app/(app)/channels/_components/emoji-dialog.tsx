"use client";

import { useState } from "react";
import { saveEmojiRule } from "@/actions/redactie";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EMOJI_ACTION_OPTIONS } from "@/lib/constants";
import type { EmojiAction } from "@/lib/types";

export type EmojiValues = {
  id?: string;
  emoji: string;
  shortcode: string;
  goal: string;
  action: EmojiAction;
  directStart: boolean;
  enabled: boolean;
};

export const NEW_EMOJI: EmojiValues = { emoji: "", shortcode: "", goal: "", action: "internal_newsletter", directStart: false, enabled: true };

export function EmojiDialog({ rule, children }: { rule: EmojiValues; children: React.ReactNode }) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(rule);
  const set = <K extends keyof EmojiValues>(key: K, value: EmojiValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const isNew = !rule.id;
  const excludes = values.action === "exclude";
  const valid = values.emoji.trim().length > 0 && values.shortcode.trim().length > 0 && values.goal.trim().length >= 2;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(rule);
          clearErrors();
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Emoji toevoegen" : "Emoji bewerken"}</DialogTitle>
          <DialogDescription>Een collega zet deze emoji bij een bericht in een gevolgd kanaal. Hier leg je vast wat de bot dan doet.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            run(() => saveEmojiRule({ ...values, directStart: excludes ? false : values.directStart }), { onSuccess: () => setOpen(false) });
          }}
        >
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
            <FormField label="Emoji" htmlFor="emoji-char" error={fieldErrors.emoji} required>
              <Input id="emoji-char" required value={values.emoji} maxLength={16} onChange={(e) => set("emoji", e.target.value)} className="text-center text-base" />
            </FormField>
            <FormField
              label="Naam in Slack"
              htmlFor="emoji-shortcode"
              error={fieldErrors.shortcode}
              help="Zonder dubbele punten, zoals Slack de emoji noemt. Bijvoorbeeld mega."
              required
            >
              <Input
                id="emoji-shortcode"
                required
                value={values.shortcode}
                placeholder="mega"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => set("shortcode", e.target.value.replace(/[:\s]/g, "").toLowerCase())}
              />
            </FormField>
          </div>
          <FormField label="Doel" htmlFor="emoji-goal" error={fieldErrors.goal} help="Zo staat de emoji in het uitlegbericht in elk kanaal." required>
            <Input id="emoji-goal" required value={values.goal} placeholder="Extern nieuws" onChange={(e) => set("goal", e.target.value)} />
          </FormField>
          <FormField
            label="Wat de bot doet"
            htmlFor="emoji-action"
            error={fieldErrors.action}
            help={EMOJI_ACTION_OPTIONS.find((o) => o.value === values.action)?.help}
          >
            <Select value={values.action} onValueChange={(v) => set("action", v as EmojiAction)}>
              <SelectTrigger id="emoji-action" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMOJI_ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="flex items-start justify-between gap-6 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="emoji-direct" className="text-sm font-medium">
                Mag direct starten, zonder besluit van de redactie
              </Label>
              <p className="max-w-[48ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                {excludes
                  ? "Niet van toepassing: deze emoji start niets."
                  : "Staat dit aan, dan pakt de bot het voorstel zelf op en nodigt hij meteen mensen uit voor een interview. Staat dit uit, dan wacht elk voorstel in de inbox tot een redacteur beslist. Publiceren vraagt altijd akkoord."}
              </p>
            </div>
            <Switch
              id="emoji-direct"
              checked={!excludes && values.directStart}
              disabled={excludes}
              onCheckedChange={(checked) => set("directStart", checked)}
              className="mt-0.5"
            />
          </div>
          <div className="flex items-start justify-between gap-6 border-t pt-4">
            <div className="space-y-1">
              <Label htmlFor="emoji-enabled" className="text-sm font-medium">
                In gebruik
              </Label>
              <p className="max-w-[48ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                Een emoji die uit staat heeft voor de bot geen betekenis en staat niet in het uitlegbericht.
              </p>
            </div>
            <Switch id="emoji-enabled" checked={values.enabled} onCheckedChange={(checked) => set("enabled", checked)} className="mt-0.5" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            <SubmitButton pending={pending} disabled={!valid}>
              {isNew ? "Emoji toevoegen" : "Opslaan"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
