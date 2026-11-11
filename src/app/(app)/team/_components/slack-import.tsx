"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { importSlackMembers } from "@/actions/redactie";
import { useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * People come from Slack. The outcome of the last attempt stays on screen, so
 * a refusal (no connection, no own domain set) can be read and acted on.
 */
export function SlackImport() {
  const { run, pending } = useAction();
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-2 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 text-[0.8125rem] leading-relaxed">
        <p className="text-muted-foreground">
          Personen komen uit Slack: elk volwaardig lid met een adres op het eigen e-maildomein. Gasten en bots worden overgeslagen. Wie
          nieuw is, krijgt de toegangsrol Medewerker en logt in met Slack.
        </p>
        {outcome && (
          <p role="status" className={cn("mt-1 font-medium", outcome.ok ? "text-foreground" : "text-danger")}>
            {outcome.text}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-auto"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          run(() => importSlackMembers(), {
            silent: true,
            onSuccess: (result) => setOutcome({ ok: true, text: `Opgehaald uit Slack: ${result.message ?? "klaar."}` }),
            onError: (result) => setOutcome({ ok: false, text: result.error }),
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Download />}
        Personen ophalen uit Slack
      </Button>
    </div>
  );
}
