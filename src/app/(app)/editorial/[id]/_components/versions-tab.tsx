"use client";

import { useState } from "react";
import { Eye, History, RotateCcw } from "lucide-react";
import { restoreVersion } from "@/actions/articles";
import { ActionButton } from "@/components/shared/actions";
import { AgentAvatar, ToneBadge } from "@/components/shared/badges";
import { EmptyState, HtmlContent, UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, wordCount } from "@/lib/format";
import type { VersionItem } from "./types";

export function VersionsTab({
  articleId,
  currentVersion,
  versions,
  canRestore,
}: {
  articleId: string;
  currentVersion: number;
  versions: VersionItem[];
  canRestore: boolean;
}) {
  const [viewing, setViewing] = useState<VersionItem | null>(null);

  if (versions.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={History}
          title="Nog geen versies"
          description="Elke keer dat de tekst wordt opgeslagen of door een agent wordt geschreven, ontstaat een nieuwe versie."
        />
      </div>
    );
  }

  return (
    <>
      <ol className="divide-y rounded-lg border bg-card">
        {versions.map((v) => {
          const author = v.agent?.name ?? v.profile?.full_name ?? "Onbekend";
          return (
            <li key={v.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {v.agent ? (
                  <AgentAvatar kind={v.agent.kind} className="mt-0.5" />
                ) : (
                  <UserAvatar name={v.profile?.full_name} color={v.profile?.avatar_color} className="mt-0.5" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    Versie {v.version}
                    {v.version === currentVersion && <ToneBadge tone="green">Huidige versie</ToneBadge>}
                  </p>
                  <p className="text-sm text-muted-foreground">{v.change_summary ?? "Geen toelichting"}</p>
                  <p className="text-xs text-muted-foreground">
                    {author} · <time dateTime={v.created_at}>{formatDateTime(v.created_at)}</time> · {wordCount(v.body_html)} woorden
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewing(v)}>
                  <Eye />
                  Bekijken
                </Button>
                {canRestore && v.version !== currentVersion && (
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    action={() => restoreVersion({ id: articleId, version: v.version })}
                    confirm={{
                      title: `Versie ${v.version} terugzetten?`,
                      description:
                        "De tekst van deze versie wordt als nieuwe versie opgeslagen. De huidige tekst blijft bewaard in de versiegeschiedenis.",
                      confirmLabel: "Terugzetten",
                    }}
                  >
                    <RotateCcw />
                    Terugzetten
                  </ActionButton>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>Versie {viewing.version}</DialogTitle>
                <DialogDescription>
                  {viewing.agent?.name ?? viewing.profile?.full_name ?? "Onbekend"} · {formatDateTime(viewing.created_at)}
                  {viewing.change_summary ? ` · ${viewing.change_summary}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-2xl leading-tight font-semibold tracking-tight">{viewing.title}</h3>
                {viewing.subtitle && <p className="text-muted-foreground">{viewing.subtitle}</p>}
                <HtmlContent html={viewing.body_html} compact />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
