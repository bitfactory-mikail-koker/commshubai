"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteFunctionalRole, deleteTeam, saveFunctionalRole, saveTeam } from "@/actions/redactie";
import { ActionButton, FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { EmptyState } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type FunctionalRoleRow = { id: string; name: string; description: string; members: string[] };
export type TeamRow = { id: string; name: string; members: string[] };

function memberLine(members: string[]): string {
  if (members.length === 0) return "Nog niemand";
  if (members.length <= 4) return members.join(", ");
  return `${members.slice(0, 4).join(", ")} en ${members.length - 4} anderen`;
}

/** Create or rename a role (name + description) or a team (name only). */
function NameDialog({
  kind,
  row,
  trigger,
}: {
  kind: "role" | "team";
  row?: { id: string; name: string; description?: string };
  trigger: React.ReactNode;
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const noun = kind === "role" ? "rol" : "team";

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setName(row?.name ?? "");
      setDescription(row?.description ?? "");
    } else clearErrors();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (kind === "role" ? saveFunctionalRole({ id: row?.id, name, description }) : saveTeam({ id: row?.id, name })), {
              onSuccess: () => setOpen(false),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{row ? `${kind === "role" ? "Rol" : "Team"} wijzigen` : `Nieuw${kind === "role" ? "e" : ""} ${noun}`}</DialogTitle>
            <DialogDescription>
              {kind === "role"
                ? "Een rol in de organisatie, zoals DM of Strateeg. Goedkeuringsregels en groepen verwijzen ernaar."
                : "Een team heeft een DM en een Team Lead als aanspreekpunt voor de bot."}
            </DialogDescription>
          </DialogHeader>
          <FormField label="Naam" htmlFor={`${kind}-name`} error={fieldErrors.name} required>
            <Input id={`${kind}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoComplete="off" />
          </FormField>
          {kind === "role" && (
            <FormField label="Omschrijving" htmlFor="role-description" error={fieldErrors.description}>
              <Input
                id="role-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                placeholder="Bijv. Eindverantwoordelijk voor een klantproject"
                autoComplete="off"
              />
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending} disabled={name.trim().length < 2}>
              Opslaan
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddButton({ kind }: { kind: "role" | "team" }) {
  return (
    <NameDialog
      kind={kind}
      trigger={
        <Button variant="outline" size="sm">
          <Plus />
          {kind === "role" ? "Rol toevoegen" : "Team toevoegen"}
        </Button>
      }
    />
  );
}

export function AddRoleButton() {
  return <AddButton kind="role" />;
}

export function AddTeamButton() {
  return <AddButton kind="team" />;
}

export function FunctionalRolesList({ roles, canManage }: { roles: FunctionalRoleRow[]; canManage: boolean }) {
  if (roles.length === 0) {
    return <EmptyState title="Nog geen rollen" description="Voeg rollen toe zoals DM, Team Lead of Strateeg." />;
  }
  return (
    <ul className="divide-y">
      {roles.map((role) => (
        <li key={role.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {role.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{role.members.length}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {role.description ? `${role.description} · ` : ""}
              {memberLine(role.members)}
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-0.5">
              <NameDialog
                kind="role"
                row={role}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Rol ${role.name} wijzigen`}>
                    <Pencil />
                  </Button>
                }
              />
              <ActionButton
                variant="ghost"
                size="icon-sm"
                aria-label={`Rol ${role.name} verwijderen`}
                action={deleteFunctionalRole.bind(null, { id: role.id })}
                confirm={{
                  title: `Rol ${role.name} verwijderen?`,
                  description:
                    role.members.length > 0
                      ? `${role.members.length} ${role.members.length === 1 ? "persoon verliest" : "personen verliezen"} deze rol. Goedkeuringsregels die de rol noemen vallen terug op de redactie.`
                      : "Goedkeuringsregels die de rol noemen vallen terug op de redactie.",
                  confirmLabel: "Verwijderen",
                  destructive: true,
                }}
              >
                <Trash2 />
              </ActionButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TeamsList({ teams, canManage }: { teams: TeamRow[]; canManage: boolean }) {
  if (teams.length === 0) {
    return <EmptyState title="Nog geen teams" description="Een team bundelt een DM, een Team Lead en developers." />;
  }
  return (
    <ul className="divide-y">
      {teams.map((team) => (
        <li key={team.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {team.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground tabular-nums">{team.members.length}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{memberLine(team.members)}</p>
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-0.5">
              <NameDialog
                kind="team"
                row={team}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Team ${team.name} hernoemen`}>
                    <Pencil />
                  </Button>
                }
              />
              <ActionButton
                variant="ghost"
                size="icon-sm"
                aria-label={`Team ${team.name} verwijderen`}
                action={deleteTeam.bind(null, { id: team.id })}
                confirm={{
                  title: `Team ${team.name} verwijderen?`,
                  description:
                    team.members.length > 0
                      ? `${team.members.length} ${team.members.length === 1 ? "persoon staat" : "personen staan"} daarna in geen team. Groepen die dit team gebruiken hebben dan geen leden meer.`
                      : "Groepen die dit team gebruiken hebben dan geen leden meer.",
                  confirmLabel: "Verwijderen",
                  destructive: true,
                }}
              >
                <Trash2 />
              </ActionButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
