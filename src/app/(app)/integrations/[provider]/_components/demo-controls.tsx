"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { runDemoSyncAction, toggleDemoMode } from "@/actions/integrations";
import { useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { IntegrationStatus } from "@/lib/types";

export function DemoControls({
  provider,
  status,
  canManage,
}: {
  provider: string;
  status: IntegrationStatus;
  canManage: boolean;
}) {
  const toggle = useAction();
  const sync = useAction();
  const enabled = status === "demo";
  const live = status === "connected";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="demo-mode" className="text-sm font-medium">
            Demo-simulatie inschakelen
          </Label>
          <p className="max-w-xl text-[0.8125rem] leading-relaxed text-muted-foreground">
            {live
              ? "Deze integratie is live verbonden. Ontkoppel eerst om de demo-simulatie te gebruiken, zodat echte en gesimuleerde gegevens niet door elkaar lopen."
              : "De status wordt ‘Demo-simulatie’. Er wordt geen verbinding gemaakt met het echte systeem."}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          {toggle.pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Switch
            id="demo-mode"
            checked={enabled}
            disabled={!canManage || live || toggle.pending}
            onCheckedChange={(checked) => toggle.run(() => toggleDemoMode({ provider, enabled: checked }))}
          />
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={!enabled || sync.pending}
            aria-busy={sync.pending}
            onClick={() => sync.run(() => runDemoSyncAction({ provider }))}
          >
            {sync.pending ? <Loader2 className="animate-spin" /> : <FlaskConical />}
            {sync.pending ? "Berichten verwerken…" : "Demo-synchronisatie uitvoeren"}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {enabled
              ? "Levert maximaal twee nieuwe voorbeeldberichten aan en laat de Intelligence Engine ze analyseren."
              : "Schakel eerst de demo-simulatie in."}
          </p>
        </div>
      )}
    </div>
  );
}
