"use client";

import { ListRestart, Play } from "lucide-react";
import { composeMdUpdateAction, startMdUpdateAction } from "@/actions/topics";
import { ActionButton } from "@/components/shared/actions";

/** Starts today's MD-update: a new edition and a short interview with every MD. */
export function StartMdUpdateButton() {
  return (
    <ActionButton
      size="sm"
      action={startMdUpdateAction}
      redirectTo={(result) => {
        const data = result.data as { id?: string } | undefined;
        return data?.id ? `/newsletters/${data.id}` : null;
      }}
      pendingLabel="Starten…"
      confirm={{
        title: "MD-update starten?",
        description:
          "Er komt een nieuwe editie en de bot nodigt elke MD uit voor een kort interview. Of de uitnodigingen echt worden verstuurd hangt af van de botinstellingen.",
        confirmLabel: "Starten",
      }}
    >
      <Play />
      MD-update starten
    </ActionButton>
  );
}

/** Compiles the edition from the interviews that are done: by theme, with who said it. */
export function ComposeMdUpdateButton({ id, hasPassages }: { id: string; hasPassages: boolean }) {
  return (
    <ActionButton
      variant={hasPassages ? "outline" : "default"}
      size="sm"
      action={() => composeMdUpdateAction({ id })}
      pendingLabel="Samenstellen…"
      confirm={
        hasPassages
          ? {
              title: "Opnieuw samenstellen?",
              description: "De passages worden opnieuw opgebouwd uit de afgeronde interviews. Handmatige wijzigingen in passages gaan verloren.",
              confirmLabel: "Opnieuw samenstellen",
            }
          : undefined
      }
    >
      <ListRestart />
      {hasPassages ? "Opnieuw samenstellen" : "Samenstellen uit de interviews"}
    </ActionButton>
  );
}
