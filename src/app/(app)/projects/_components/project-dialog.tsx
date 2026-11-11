"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveProject } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ExternalNaming } from "@/lib/types";
import { listColleagues } from "../../inbox/_components/people-action";
import { PeoplePicker, type PickablePerson } from "../../inbox/_components/people-picker";

export type EditableProject = {
  id: string;
  name: string;
  clientName: string;
  externalNaming: ExternalNaming;
  anonymousLabel: string;
  notes: string;
  members: { profileId: string; name: string; jobTitle: string | null; role: string }[];
  channelIds: string[];
};

export type ChannelOption = { id: string; name: string; linkedTo: string | null };
export type RoleOption = { key: string; name: string };

const NAMING_OPTIONS: { value: ExternalNaming; label: string; help: string }[] = [
  { value: "unknown", label: "Nog niet bekend", help: "Externe stukken over dit project kunnen nog niet worden gepubliceerd." },
  { value: "allowed", label: "Mag bij naam", help: "De klant mag in externe stukken bij naam worden genoemd." },
  { value: "anonymous", label: "Alleen anoniem", help: "Externe stukken omschrijven de klant, zonder naam of herkenbare details." },
  { value: "not_allowed", label: "Alleen intern", help: "Over dit project verschijnt niets extern." },
];

const DEFAULT_ROLE = "betrokkene";

export function ProjectDialog({
  project,
  roles,
  channels,
  canLinkChannels,
}: {
  /** Leave out to add a new project. */
  project?: EditableProject;
  roles: RoleOption[];
  channels: ChannelOption[];
  canLinkChannels: boolean;
}) {
  const initial = () => ({
    name: project?.name ?? "",
    clientName: project?.clientName ?? "",
    externalNaming: project?.externalNaming ?? ("unknown" as ExternalNaming),
    anonymousLabel: project?.anonymousLabel ?? "",
    notes: project?.notes ?? "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [roleOf, setRoleOf] = useState<Record<string, string>>(() => Object.fromEntries((project?.members ?? []).map((m) => [m.profileId, m.role])));
  const [memberIds, setMemberIds] = useState<string[]>(() => (project?.members ?? []).map((m) => m.profileId));
  const [channelIds, setChannelIds] = useState<string[]>(() => project?.channelIds ?? []);
  const [people, setPeople] = useState<PickablePerson[] | null>(null);
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const uid = project?.id ?? "new";

  useEffect(() => {
    if (!open || people) return;
    let active = true;
    listColleagues()
      .then((all) => active && setPeople(all))
      .catch(() => active && setPeople([]));
    return () => {
      active = false;
    };
  }, [open, people]);

  const known: PickablePerson[] =
    people ?? (project?.members ?? []).map((m) => ({ id: m.profileId, name: m.name, jobTitle: m.jobTitle }));
  const chosen = memberIds.map((id) => known.find((p) => p.id === id)).filter((p) => p !== undefined);
  const naming = NAMING_OPTIONS.find((o) => o.value === form.externalNaming) ?? NAMING_OPTIONS[0];
  const roleOptions: RoleOption[] = [...roles, { key: DEFAULT_ROLE, name: "Betrokkene" }];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      () =>
        saveProject({
          id: project?.id,
          name: form.name,
          clientName: form.clientName,
          externalNaming: form.externalNaming,
          anonymousLabel: form.externalNaming === "anonymous" ? form.anonymousLabel : "",
          notes: form.notes,
          members: memberIds.map((id) => ({ profileId: id, role: roleOf[id] ?? DEFAULT_ROLE })),
          channelIds,
        }),
      {
        onSuccess: () => {
          setOpen(false);
          if (!project) {
            setForm(initial());
            setMemberIds([]);
            setRoleOf({});
            setChannelIds([]);
          }
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) clearErrors();
      }}
    >
      <DialogTrigger asChild>
        {project ? (
          <Button variant="outline" size="sm">
            <Pencil data-icon="inline-start" />
            Bewerken
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" />
            Project toevoegen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{project ? "Project bewerken" : "Project toevoegen"}</DialogTitle>
            <DialogDescription>
              Wie bij een project hoort, bepaalt wie er wordt geïnterviewd voor een klantcase en wie die moet goedkeuren.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Naam" htmlFor={`project-name-${uid}`} error={fieldErrors.name} required>
                <Input
                  id={`project-name-${uid}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  maxLength={120}
                  required
                  aria-invalid={Boolean(fieldErrors.name)}
                />
              </FormField>
              <FormField label="Klant" htmlFor={`project-client-${uid}`} error={fieldErrors.clientName}>
                <Input
                  id={`project-client-${uid}`}
                  value={form.clientName}
                  onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                  maxLength={120}
                />
              </FormField>
            </div>

            <FormField
              label="Mag het extern?"
              help={`${naming.help} Het akkoord van de klant zelf regel je buiten dit systeem; hier leg je vast wat is afgesproken. Het logboek bewaart wie dit instelde.`}
            >
              <Select value={form.externalNaming} onValueChange={(value) => setForm((f) => ({ ...f, externalNaming: value as ExternalNaming }))}>
                <SelectTrigger className="w-full" aria-label="Mag het extern?">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NAMING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {form.externalNaming === "anonymous" && (
              <FormField
                label="Anonieme omschrijving"
                htmlFor={`project-anon-${uid}`}
                error={fieldErrors.anonymousLabel}
                help="Zo noemt de bot de klant in externe stukken, bijvoorbeeld: een landelijke retailer."
                required
              >
                <Input
                  id={`project-anon-${uid}`}
                  value={form.anonymousLabel}
                  onChange={(e) => setForm((f) => ({ ...f, anonymousLabel: e.target.value }))}
                  maxLength={120}
                  required
                  aria-invalid={Boolean(fieldErrors.anonymousLabel)}
                />
              </FormField>
            )}

            <FormField label="Mensen" help="Kies wie bij het project hoort en geef daarna ieders rol in het project aan.">
              {people === null && chosen.length === 0 ? (
                <p className="rounded-md border px-3 py-2.5 text-[0.8125rem] text-muted-foreground">Collega&apos;s laden…</p>
              ) : (
                <PeoplePicker id={`project-people-${uid}`} people={known} value={memberIds} onChange={setMemberIds} />
              )}
            </FormField>

            {chosen.length > 0 && (
              <ul className="divide-y rounded-md border">
                {chosen.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="min-w-0 truncate text-[0.8125rem] font-medium">{person.name}</span>
                    <Select
                      value={roleOf[person.id] ?? DEFAULT_ROLE}
                      onValueChange={(value) => setRoleOf((current) => ({ ...current, [person.id]: value }))}
                    >
                      <SelectTrigger size="sm" className="w-40 shrink-0" aria-label={`Rol van ${person.name} in het project`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((role) => (
                          <SelectItem key={role.key} value={role.key}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}

            {canLinkChannels && channels.length > 0 && (
              <FormField
                label="Slack-kanalen"
                help="Een emoji in een gekoppeld kanaal levert een voorstel op dat meteen bij dit project hoort. Besloten kanalen en kanalen met klanten staan hier niet: de bot volgt ze nooit."
              >
                <ul className="divide-y rounded-md border">
                  {channels.map((channel) => {
                    const inputId = `project-channel-${uid}-${channel.id}`;
                    return (
                      <li key={channel.id}>
                        <label htmlFor={inputId} className="flex items-center gap-2.5 px-3 py-1.5 text-[0.8125rem] hover:bg-subtle">
                          <Checkbox
                            id={inputId}
                            checked={channelIds.includes(channel.id)}
                            onCheckedChange={(next) =>
                              setChannelIds((current) => (next === true ? [...current, channel.id] : current.filter((id) => id !== channel.id)))
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">#{channel.name}</span>
                            {channel.linkedTo && <span className="text-muted-foreground">, nu bij {channel.linkedTo}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </FormField>
            )}

            <FormField label="Notities" htmlFor={`project-notes-${uid}`} error={fieldErrors.notes} help="Bijvoorbeeld wie bij de klant het aanspreekpunt is.">
              <Textarea
                id={`project-notes-${uid}`}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                maxLength={2000}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuleren
            </Button>
            <SubmitButton pending={pending}>Opslaan</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
