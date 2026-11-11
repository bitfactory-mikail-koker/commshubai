"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updatePerson } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";
import type { TeamUser } from "./users-table";

export type FunctionalRoleOption = { id: string; name: string };
export type TeamOption = { id: string; name: string };

const NO_TEAM = "none";

function initial(user: TeamUser) {
  return {
    teamId: user.teamId ?? NO_TEAM,
    functionalRoleIds: user.functionalRoleIds,
    botMayContact: user.botMayContact,
    botFollows: user.botFollows,
    inPilot: user.inPilot,
    absentUntil: user.absentUntil ?? "",
    slackUserId: user.slackUserId ?? "",
  };
}

function ToggleRow({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{help}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

/** Roles in the organization, team and what the bot may do with this person. */
export function PersonDialog({
  user,
  functionalRoles,
  teams,
  today,
}: {
  user: TeamUser;
  functionalRoles: FunctionalRoleOption[];
  teams: TeamOption[];
  today: string;
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initial(user));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setForm(initial(user));
    else clearErrors();
  };

  const toggleRole = (id: string, checked: boolean) =>
    setForm((f) => ({
      ...f,
      functionalRoleIds: checked ? [...f.functionalRoleIds, id] : f.functionalRoleIds.filter((r) => r !== id),
    }));

  const paused = user.contactPausedUntil && user.contactPausedUntil.slice(0, 10) >= today;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${user.name} bewerken`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                updatePerson({
                  userId: user.id,
                  teamId: form.teamId === NO_TEAM ? null : form.teamId,
                  functionalRoleIds: form.functionalRoleIds,
                  botMayContact: form.botMayContact,
                  botFollows: form.botFollows,
                  inPilot: form.inPilot,
                  absentUntil: form.absentUntil || null,
                  slackUserId: form.slackUserId.trim() || null,
                }),
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{user.name}</DialogTitle>
            <DialogDescription>
              Rollen en team bepalen voor welke rondes en goedkeuringen de bot iemand benadert. Toegang tot de hub regel je met de
              toegangsrol in de tabel.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="text-[0.8rem] font-medium">Rollen in de organisatie</legend>
            {functionalRoles.length === 0 ? (
              <p className="text-xs text-muted-foreground">Er zijn nog geen rollen. Voeg ze toe onder Rollen in de organisatie.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {functionalRoles.map((role) => {
                  const id = `person-role-${user.id}-${role.id}`;
                  return (
                    <div key={role.id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={form.functionalRoleIds.includes(role.id)}
                        onCheckedChange={(value) => toggleRole(role.id, value === true)}
                      />
                      <label htmlFor={id} className="text-sm">
                        {role.name}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Team" htmlFor={`person-team-${user.id}`} error={fieldErrors.teamId}>
              <Select value={form.teamId} onValueChange={(teamId) => setForm((f) => ({ ...f, teamId }))}>
                <SelectTrigger id={`person-team-${user.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>Geen team</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Slack-ID"
              htmlFor={`person-slack-${user.id}`}
              error={fieldErrors.slackUserId}
              help="Het lid-ID uit Slack, bijvoorbeeld U02ABC123."
            >
              <Input
                id={`person-slack-${user.id}`}
                value={form.slackUserId}
                onChange={(e) => setForm((f) => ({ ...f, slackUserId: e.target.value }))}
                autoComplete="off"
                maxLength={40}
                className="font-mono text-[0.8125rem]"
              />
            </FormField>
          </div>

          <div className="divide-y border-y">
            <ToggleRow
              id={`person-contact-${user.id}`}
              label="De bot mag deze persoon benaderen"
              help="Uit: geen interviews, vragen om input of herinneringen van de bot."
              checked={form.botMayContact}
              onChange={(botMayContact) => setForm((f) => ({ ...f, botMayContact }))}
            />
            <ToggleRow
              id={`person-follow-${user.id}`}
              label="Berichten altijd beoordelen"
              help="De bot beoordeelt elk bericht van deze persoon in gevolgde kanalen, ook waar hij anders alleen op emoji's reageert."
              checked={form.botFollows}
              onChange={(botFollows) => setForm((f) => ({ ...f, botFollows }))}
            />
            <ToggleRow
              id={`person-pilot-${user.id}`}
              label="Hoort bij de proefgroep"
              help="Als de bot alleen de proefgroep benadert, krijgt deze persoon wel berichten."
              checked={form.inPilot}
              onChange={(inPilot) => setForm((f) => ({ ...f, inPilot }))}
            />
          </div>

          <FormField
            label="Afwezig tot en met"
            htmlFor={`person-absent-${user.id}`}
            error={fieldErrors.absentUntil}
            help="Tot en met deze dag stuurt de bot niets. Leeg laten als iemand er gewoon is."
          >
            <div className="flex items-center gap-2">
              <Input
                id={`person-absent-${user.id}`}
                type="date"
                min={today}
                value={form.absentUntil}
                onChange={(e) => setForm((f) => ({ ...f, absentUntil: e.target.value }))}
                className="w-44"
              />
              {form.absentUntil && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, absentUntil: "" }))}>
                  Wissen
                </Button>
              )}
            </div>
          </FormField>

          {(user.contactOptOut || paused) && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {user.contactOptOut
                ? `${user.name.split(" ")[0]} heeft zelf aangegeven niet door de bot benaderd te willen worden.`
                : `${user.name.split(" ")[0]} heeft de bot zelf gepauzeerd tot ${formatDate(user.contactPausedUntil)}.`}{" "}
              Alleen de persoon zelf kan dit terugdraaien.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Opslaan</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
