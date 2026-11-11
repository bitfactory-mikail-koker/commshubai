"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { inviteUser } from "@/actions/team";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Notice } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
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

type RoleOption = { id: string; key: string; label: string };

const EMPTY = { fullName: "", email: "", roleId: "", jobTitle: "", department: "" };

export function InviteDialog({ roles }: { roles: RoleOption[] }) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // The temporary password is shown once: closing the dialog discards it.
      setForm(EMPTY);
      setCreated(null);
      setCopied(false);
      clearErrors();
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
      toast.success("Tijdelijk wachtwoord gekopieerd.");
    } catch {
      toast.error("Kopiëren is niet gelukt. Selecteer het wachtwoord handmatig.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          Gebruiker toevoegen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>{created.name} is toegevoegd</DialogTitle>
              <DialogDescription>
                Het account is aangemaakt. Deel de inloggegevens via een veilig kanaal, bijvoorbeeld een wachtwoordmanager of
                persoonlijk.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <dl className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">E-mailadres</dt>
                  <dd className="text-sm font-medium">{created.email}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">Tijdelijk wachtwoord</dt>
                  <dd className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border bg-background px-2.5 py-1.5 font-mono text-sm select-all">
                      {created.temporaryPassword}
                    </code>
                    <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Wachtwoord kopiëren">
                      {copied ? <Check className="text-success" /> : <Copy />}
                    </Button>
                  </dd>
                </div>
              </dl>
              <Notice tone="warning" icon={KeyRound} title="Dit wachtwoord wordt maar één keer getoond">
                Na het sluiten van dit venster is het niet meer op te vragen. Vraag de gebruiker het wachtwoord direct te wijzigen
                onder Instellingen.
              </Notice>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Sluiten
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => inviteUser(form), {
                silent: true,
                onSuccess: (result) => {
                  setCreated({ ...result.data, name: form.fullName.trim() });
                  toast.success("Gebruiker toegevoegd.");
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Gebruiker toevoegen</DialogTitle>
              <DialogDescription>
                De gebruiker krijgt een account in deze organisatie met een tijdelijk wachtwoord dat je daarna één keer te zien
                krijgt.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Naam" htmlFor="invite-name" error={fieldErrors.fullName} required className="sm:col-span-2">
                <Input id="invite-name" required value={form.fullName} onChange={set("fullName")} autoComplete="off" className="h-9" />
              </FormField>
              <FormField label="E-mailadres" htmlFor="invite-email" error={fieldErrors.email} required className="sm:col-span-2">
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="off"
                  placeholder="naam@organisatie.nl"
                  className="h-9"
                />
              </FormField>
              <FormField label="Rol" htmlFor="invite-role" error={fieldErrors.roleId} required className="sm:col-span-2">
                <Select value={form.roleId} onValueChange={(roleId) => setForm((f) => ({ ...f, roleId }))}>
                  <SelectTrigger id="invite-role" className="h-9 w-full">
                    <SelectValue placeholder="Kies een rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Functie" htmlFor="invite-job" error={fieldErrors.jobTitle}>
                <Input id="invite-job" value={form.jobTitle} onChange={set("jobTitle")} placeholder="Bijv. Projectleider" className="h-9" />
              </FormField>
              <FormField label="Afdeling" htmlFor="invite-department" error={fieldErrors.department}>
                <Input id="invite-department" value={form.department} onChange={set("department")} placeholder="Bijv. Delivery" className="h-9" />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending} disabled={!form.roleId}>
                Gebruiker toevoegen
              </SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
