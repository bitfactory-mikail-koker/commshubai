"use client";

import { useState } from "react";
import { Check, Copy, Download, Link2 } from "lucide-react";
import { toast } from "sonner";
import { markPublished } from "@/actions/approvals";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Klaarzetten. An approved piece is ready for publication: a person copies or
 * downloads it, publishes it where it belongs, and records the link here. The
 * system publishes nothing by itself.
 */
export function ReadyPanel({
  type,
  id,
  text,
  canMarkPublished,
  blockedReason,
  publishedLabel = "Gepubliceerd",
}: {
  type: "article" | "social_post" | "newsletter";
  id: string;
  /** Plain text for the clipboard. */
  text: string;
  canMarkPublished: boolean;
  /** Why it cannot be marked as published yet (e.g. permission or final check missing). */
  blockedReason?: string | null;
  publishedLabel?: string;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Kopiëren is niet gelukt. Download de tekst in plaats daarvan.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Gekopieerd" : "Tekst kopiëren"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/${type}/${id}?format=txt`} download>
            <Download />
            Tekst
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/${type}/${id}?format=html`} download>
            <Download />
            HTML
          </a>
        </Button>
      </div>

      {type !== "newsletter" && canMarkPublished && (
        <form
          className="space-y-2.5 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => markPublished({ type, id, url }), { onSuccess: () => setUrl("") });
          }}
        >
          <FormField
            label="Link naar de publicatie"
            htmlFor={`published-url-${id}`}
            error={fieldErrors.url}
            help="Optioneel. Zo is later terug te vinden waar het stuk staat."
          >
            <div className="relative">
              <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`published-url-${id}`}
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className="pl-8"
              />
            </div>
          </FormField>
          <SubmitButton pending={pending} size="sm" disabled={Boolean(blockedReason)}>
            <Check />
            Afvinken als {publishedLabel.toLowerCase()}
          </SubmitButton>
          {blockedReason && <p className="text-xs leading-relaxed text-muted-foreground">{blockedReason}</p>}
        </form>
      )}
    </div>
  );
}
