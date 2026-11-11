"use client";

import { Loader2, Pencil, Send, Trash2 } from "lucide-react";
import { deleteGroup, saveGroup } from "@/actions/redactie";
import { runGroupNow } from "@/actions/topics";
import { ActionButton, useAction } from "@/components/shared/actions";
import { ClassificationBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FREQUENCY_OPTIONS, WEEKDAY_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GroupDialog } from "./group-dialog";
import { groupInput, namesLine, type GroupRow, type Option } from "./types";

const KIND_LABEL = { role: "Rol", team: "Team", persons: "Personen" } as const;

function when(group: GroupRow): { main: string; sub: string } {
  if (group.frequency === "rhythm_only") {
    return {
      main: "Via een vast ritme",
      sub: group.usedBy.length > 0 ? group.usedBy.join(", ") : "Nog aan geen ritme gekoppeld",
    };
  }
  const frequency = FREQUENCY_OPTIONS.find((f) => f.value === group.frequency)?.label ?? group.frequency;
  return {
    main: `${frequency} op ${WEEKDAY_LABELS[group.weekday - 1].toLowerCase()}`,
    sub: `Tussen ${group.windowStart} en ${group.windowEnd}`,
  };
}

function reminder(group: GroupRow): { main: string; sub: string } {
  const after = group.afterNoReply === "notify_editors" ? "Daarna redactie inlichten" : "Daarna niets";
  if (group.reminderCount === 0) return { main: "Geen herinnering", sub: after };
  return {
    main: `${group.reminderCount === 1 ? "Eén herinnering" : `${group.reminderCount} herinneringen`} na ${group.reminderAfterDays} ${group.reminderAfterDays === 1 ? "dag" : "dagen"}`,
    sub: after,
  };
}

function GroupRowView({
  group,
  roles,
  teams,
  people,
  canManage,
  canRun,
}: {
  group: GroupRow;
  roles: Option[];
  teams: Option[];
  people: Option[];
  canManage: boolean;
  canRun: boolean;
}) {
  const toggle = useAction();
  const timing = when(group);
  const remind = reminder(group);
  const source =
    group.memberKind === "role"
      ? `Rol ${roles.find((r) => r.id === group.functionalRoleId)?.name ?? "onbekend"}`
      : group.memberKind === "team"
        ? `Team ${teams.find((t) => t.id === group.teamId)?.name ?? "onbekend"}`
        : KIND_LABEL.persons;

  return (
    <TableRow className={cn(!group.enabled && "bg-muted/30")}>
      <TableCell className="w-[30%] min-w-[17rem] py-3 pl-5 align-top whitespace-normal">
        <p className={cn("flex flex-wrap items-center gap-2 text-sm font-medium", !group.enabled && "text-muted-foreground")}>
          {group.name}
          <ClassificationBadge classification={group.bureau} />
        </p>
        <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-muted-foreground">
          {group.goal || "Standaardvraag van het bureau"}
        </p>
      </TableCell>
      <TableCell className="max-w-[15rem] min-w-[11rem] align-top text-[0.8125rem] whitespace-normal">
        <span className="tabular-nums">
          {group.resolved.length} {group.resolved.length === 1 ? "persoon" : "personen"}
        </span>
        {group.memberKind !== "persons" && <span className="text-muted-foreground"> · {source}</span>}
        <span className="block text-xs leading-snug text-muted-foreground">{namesLine(group.resolved)}</span>
      </TableCell>
      <TableCell className="align-top text-[0.8125rem]">
        {timing.main}
        <span className="block text-xs text-muted-foreground">{timing.sub}</span>
      </TableCell>
      <TableCell className="align-top text-[0.8125rem]">
        {remind.main}
        <span className="block text-xs text-muted-foreground">{remind.sub}</span>
      </TableCell>
      <TableCell className="align-top text-xs text-muted-foreground tabular-nums">
        {group.lastRunAt ? formatDateTime(group.lastRunAt) : "Nog niet"}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center gap-2 text-[0.8125rem]">
          {canManage && (
            <Switch
              size="sm"
              checked={group.enabled}
              disabled={toggle.pending}
              aria-label={group.enabled ? `${group.name} uitzetten` : `${group.name} aanzetten`}
              onCheckedChange={(enabled) => toggle.run(() => saveGroup({ ...groupInput(group), enabled }), { silent: true })}
            />
          )}
          {toggle.pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : group.enabled ? "Aan" : "Uit"}
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
                action={runGroupNow.bind(null, { id: group.id })}
                disabled={group.resolved.length === 0}
                confirm={{
                  title: `Nu een ronde sturen aan ${group.name}?`,
                  description: `De bot vraagt ${group.resolved.length} ${group.resolved.length === 1 ? "persoon" : "personen"} om input. Wie afwezig is, gepauzeerd heeft of kortgeleden al een verzoek kreeg, wordt overgeslagen. In schaduwmodus gaat er niets echt uit.`,
                  confirmLabel: "Versturen",
                }}
              >
                <Send />
                Nu versturen
              </ActionButton>
            )}
            {canManage && (
              <>
                <GroupDialog
                  group={group}
                  roles={roles}
                  teams={teams}
                  people={people}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`${group.name} wijzigen`}>
                      <Pencil />
                    </Button>
                  }
                />
                <ActionButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${group.name} verwijderen`}
                  action={deleteGroup.bind(null, { id: group.id })}
                  confirm={{
                    title: `Groep ${group.name} verwijderen?`,
                    description:
                      group.usedBy.length > 0
                        ? `Deze groep wordt gebruikt door: ${group.usedBy.join(", ")}. Dat ritme heeft daarna geen groep meer.`
                        : "De groep wordt niet meer benaderd. Eerdere berichten blijven in het postvak van de bot staan.",
                    confirmLabel: "Verwijderen",
                    destructive: true,
                  }}
                >
                  <Trash2 />
                </ActionButton>
              </>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

export function GroupsTable({
  groups,
  roles,
  teams,
  people,
  canManage,
  canRun,
}: {
  groups: GroupRow[];
  roles: Option[];
  teams: Option[];
  people: Option[];
  canManage: boolean;
  canRun: boolean;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Nog geen groepen"
        description="Maak een groep van de mensen die de bot om input mag vragen, bijvoorbeeld de DM's en Team Leads voor de maandelijkse teamronde."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1080px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Groep en doel</TableHead>
            <TableHead>Leden</TableHead>
            <TableHead>Frequentie en moment</TableHead>
            <TableHead>Herinnering</TableHead>
            <TableHead>Laatste ronde</TableHead>
            <TableHead>Actief</TableHead>
            {(canManage || canRun) && (
              <TableHead className="pr-3">
                <span className="sr-only">Acties</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <GroupRowView key={group.id} group={group} roles={roles} teams={teams} people={people} canManage={canManage} canRun={canRun} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
