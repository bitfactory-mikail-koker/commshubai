"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-5" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Deze pagina kon niet worden geladen</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Er ging iets mis bij het ophalen van de gegevens. Controleer of de database bereikbaar is en probeer het opnieuw.
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Referentie: {error.digest}</p>}
      </div>
      <Button onClick={reset}>Opnieuw proberen</Button>
    </div>
  );
}
