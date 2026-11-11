"use client";

import { Loader2, Play } from "lucide-react";
import { saveRhythm } from "@/actions/redactie";
import { runRhythmNow } from "@/actions/topics";
import { ActionButton, useAction } from "@/components/shared/actions";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RHYTHM_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RHYTHM_HELP, RhythmDialog } from "./rhythm-dialog";
import { rhythmInput, type Option, type RhythmRow } from "./types";

function schedule(rhythm: RhythmRow): string {
  if (rhythm.weekday) return `Elke ${WEEKDAY_LABELS[rhythm.weekday - 1].toLowerCase()} om ${rhythm.timeOfDay}`;
  if (rhythm.daysOfMonth.length === 0) return "Geen dag gekozen";
  const days = rhythm.daysOfMonth.map((d) => `${d}e`);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} en ${days[days.length - 1]}` : days[0];
  return `Op de ${list} van de maand om ${rhythm.timeOfDay}`;
}

function RhythmRowView({ rhythm, groups, canManage, canRun }: { rhythm: RhythmRow; groups: Option[]; canManage: boolean; canRun: boolean }) {
  const toggle = useAction();
  const help = RHYTHM_HELP[rhythm.key];
  const group = groups.find((g) => g.id === rhythm.groupId);
  const label = RHYTHM_LABELS[rhythm.key];

  return (
    <TableRow className={cn(!rhythm.enabled && "bg-muted/30")}>
      <TableCell className="max-w-[26rem] min-w-[17rem] py-3 pl-5 align-top whitespace-normal">
        <p className={cn("text-sm font-medium", !rhythm.enabled && "text-muted-foreground")}>{label}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">{help.what}</p>
      </TableCell>
      <TableCell className="align-top text-[0.8125rem]">
        {schedule(rhythm)}
        {help.deadline && (
          <span className="block text-xs text-muted-foreground">
            Nieuwsbrief voorbereiden na {rhythm.deadlineDays} {rhythm.deadlineDays === 1 ? "dag" : "dagen"}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top text-[0.8125rem]">
        {!help.group ? (
          <span className="text-muted-foreground">De redactie</span>
        ) : group ? (
          group.name
        ) : rhythm.key === "md_update" ? (
          <span className="text-muted-foreground">Iedereen met de rol MD</span>
        ) : (
          <span className="text-muted-foreground">Geen groep</span>
        )}
      </TableCell>
      <TableCell className="align-top text-xs text-muted-foreground tabular-nums">
        {rhythm.lastRunAt ? formatDateTime(rhythm.lastRunAt) : "Nog niet"}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center gap-2 text-[0.8125rem]">
          {canManage && (
            <Switch
              size="sm"
              checked={rhythm.enabled}
              disabled={toggle.pending}
              aria-label={rhythm.enabled ? `${label} uitzetten` : `${label} aanzetten`}
              onCheckedChange={(enabled) => toggle.run(() => saveRhythm({ ...rhythmInput(rhythm), enabled }), { silent: true })}
            />
          )}
          {toggle.pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : rhythm.enabled ? "Aan" : "Uit"}
        </div>
      </TableCell>
      {(canManage || canRun) && (
        <TableCell className="pr-3 align-top">
          <div className="flex items-center justify-end gap-0.5">
            {canRun && (
              <ActionButton
                variant="outline"
                size="sm"
                className="mr-1"
                action={runRhythmNow.bind(null, { key: rhythm.key })}
                confirm={{
                  title: `${label} nu uitvoeren?`,
                  description: `${help.what} In schaduwmodus gaat er niets echt uit; je ziet in het postvak van de bot wat hij zou sturen.`,
                  confirmLabel: "Uitvoeren",
                }}
              >
                <Play />
                Nu uitvoeren
              </ActionButton>
            )}
            {canManage && <RhythmDialog rhythm={rhythm} groups={groups} />}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

export function RhythmsTable({ rhythms, groups, canManage, canRun }: { rhythms: RhythmRow[]; groups: Option[]; canManage: boolean; canRun: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Ritme</TableHead>
            <TableHead>Wanneer</TableHead>
            <TableHead>Groep</TableHead>
            <TableHead>Laatst uitgevoerd</TableHead>
            <TableHead>Actief</TableHead>
            {(canManage || canRun) && (
              <TableHead className="pr-3">
                <span className="sr-only">Acties</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rhythms.map((rhythm) => (
            <RhythmRowView key={rhythm.id} rhythm={rhythm} groups={groups} canManage={canManage} canRun={canRun} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
