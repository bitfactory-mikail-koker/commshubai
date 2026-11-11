"use client";

import { useState } from "react";
import { updateBotSettings } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatEuro } from "@/lib/format";

type Values = {
  botName: string;
  shadowMode: boolean;
  pilotOnly: boolean;
  minDaysBetweenRequests: number;
  workStart: string;
  workEnd: string;
  lookbackMaxDays: number;
  aiBudgetEur: number;
  mailDomain: string;
  mailboxAddress: string;
  contactPerson: string;
  signalRetentionMonths: number;
};


function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-x-10 gap-y-4 border-t pt-5 first:border-t-0 first:pt-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <legend className="sr-only">{title}</legend>
      <div className="space-y-1" aria-hidden>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </fieldset>
  );
}

function Toggle({
  id,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="max-w-[60ch] text-[0.8125rem] leading-relaxed text-muted-foreground">{help}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

export function BotSettingsForm({
  initial,
  canManage,
  spentThisMonth,
  callsThisMonth,
  pilotCount,
}: {
  initial: Values;
  canManage: boolean;
  spentThisMonth: number;
  callsThisMonth: number;
  pilotCount: number;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [values, setValues] = useState(initial);
  // Numbers are kept as text while typing, so an empty field is not silently a zero.
  const [numbers, setNumbers] = useState({
    minDaysBetweenRequests: String(initial.minDaysBetweenRequests),
    lookbackMaxDays: String(initial.lookbackMaxDays),
    aiBudgetEur: String(initial.aiBudgetEur),
    signalRetentionMonths: String(initial.signalRetentionMonths),
  });
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));
  const setNumber = (key: keyof typeof numbers) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNumbers((n) => ({ ...n, [key]: e.target.value }));

  const parsed = {
    minDaysBetweenRequests: Number(numbers.minDaysBetweenRequests),
    lookbackMaxDays: Number(numbers.lookbackMaxDays),
    aiBudgetEur: Number(numbers.aiBudgetEur.replace(",", ".")),
    signalRetentionMonths: Number(numbers.signalRetentionMonths),
  };
  const inRange = (value: number, min: number, max: number, integer = true) =>
    Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  const errors = {
    minDaysBetweenRequests:
      numbers.minDaysBetweenRequests.trim() === "" || !inRange(parsed.minDaysBetweenRequests, 0, 90) ? "Vul een heel aantal dagen in van 0 tot 90." : undefined,
    lookbackMaxDays:
      numbers.lookbackMaxDays.trim() === "" || !inRange(parsed.lookbackMaxDays, 0, 365) ? "Vul een heel aantal dagen in van 0 tot 365." : undefined,
    aiBudgetEur: numbers.aiBudgetEur.trim() === "" || !inRange(parsed.aiBudgetEur, 0, 100_000, false) ? "Vul een bedrag in van 0 tot 100.000." : undefined,
    signalRetentionMonths:
      numbers.signalRetentionMonths.trim() === "" || !inRange(parsed.signalRetentionMonths, 1, 120) ? "Vul een heel aantal maanden in van 1 tot 120." : undefined,
    workEnd: values.workStart >= values.workEnd ? "Het einde van de werkdag moet na het begin liggen." : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const next: Values = { ...values, ...parsed };
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((key) => next[key] !== initial[key]);
  const turningShadowOff = initial.shadowMode && !values.shadowMode;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canManage || !valid) return;
        run(() => updateBotSettings(next));
      }}
    >
      <Group title="Wie de bot is" description="Zo stelt de bot zich voor in elk bericht en in elk kanaal.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Naam van de bot" htmlFor="bot-name" error={fieldErrors.botName} required>
            <Input id="bot-name" required value={values.botName} readOnly={!canManage} onChange={(e) => set("botName", e.target.value)} />
          </FormField>
          <FormField
            label="Contactpersoon"
            htmlFor="bot-contact"
            error={fieldErrors.contactPerson}
            help="Staat onder het uitlegbericht in elk kanaal, als “Vragen? …”."
          >
            <Input
              id="bot-contact"
              value={values.contactPerson}
              readOnly={!canManage}
              placeholder="Naam van iemand van de redactie"
              onChange={(e) => set("contactPerson", e.target.value)}
            />
          </FormField>
        </div>
      </Group>

      <Group title="Wie er iets van merkt" description="Begin in de schaduwmodus, ga daarna verder met een proefgroep.">
        <Toggle
          id="bot-shadow"
          label="Schaduwmodus"
          help="De bot laat alleen aan de redactie zien wat hij zou doen. Elk bericht komt in het postvak te staan en gaat niet naar collega's of kanalen."
          checked={values.shadowMode}
          disabled={!canManage}
          onChange={(v) => set("shadowMode", v)}
        />
        {turningShadowOff && (
          <p className="text-[0.8125rem] font-medium text-warning" role="status">
            Na het opslaan stuurt de bot echt berichten, zodra er een Slack-workspace is verbonden.
          </p>
        )}
        <Toggle
          id="bot-pilot"
          label="Alleen de proefgroep"
          help={`De bot benadert alleen mensen die in de proefgroep zitten (nu ${pilotCount}). Wie erin zit stel je in bij Mensen en rollen.`}
          checked={values.pilotOnly}
          disabled={!canManage}
          onChange={(v) => set("pilotOnly", v)}
        />
      </Group>

      <Group title="Hoe vaak en wanneer" description="De bot is beleefd: hij vraagt niet te vaak en niet buiten werktijd.">
        <FormField
          label="Dagen tussen twee nieuwe verzoeken aan dezelfde persoon"
          htmlFor="bot-min-days"
          error={errors.minDaysBetweenRequests ?? fieldErrors.minDaysBetweenRequests}
          help="Een uitnodiging voor een interview of een vraag om input telt. Goedkeuringsverzoeken tellen niet mee. 0 betekent geen limiet."
        >
          <Input
            id="bot-min-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={90}
            value={numbers.minDaysBetweenRequests}
            readOnly={!canManage}
            aria-invalid={Boolean(errors.minDaysBetweenRequests)}
            onChange={setNumber("minDaysBetweenRequests")}
            className="w-28"
          />
        </FormField>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <FormField label="Begin van de werkdag" htmlFor="bot-work-start" error={fieldErrors.workStart}>
            <Input id="bot-work-start" type="time" required value={values.workStart} readOnly={!canManage} onChange={(e) => set("workStart", e.target.value)} />
          </FormField>
          <FormField label="Einde van de werkdag" htmlFor="bot-work-end" error={errors.workEnd ?? fieldErrors.workEnd}>
            <Input
              id="bot-work-end"
              type="time"
              required
              value={values.workEnd}
              readOnly={!canManage}
              aria-invalid={Boolean(errors.workEnd)}
              onChange={(e) => set("workEnd", e.target.value)}
            />
          </FormField>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Maandag tot en met vrijdag, Nederlandse tijd. Een bericht buiten deze uren wacht in het postvak tot de volgende werkdag. Een
          antwoord op iets wat iemand net zelf deed, gaat wel meteen.
        </p>
      </Group>

      <Group title="Terugkijken en bewaren" description="Wat de bot mag teruglezen en hoe lang iets blijft staan.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Maximaal terugkijken (dagen)"
            htmlFor="bot-lookback"
            error={errors.lookbackMaxDays ?? fieldErrors.lookbackMaxDays}
            help="Na een nieuw signaal mag de bot in dat kanaal terugzoeken naar hetzelfde onderwerp. Per kanaal stel je een termijn in die hier niet boven kan komen."
          >
            <Input
              id="bot-lookback"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              value={numbers.lookbackMaxDays}
              readOnly={!canManage}
              aria-invalid={Boolean(errors.lookbackMaxDays)}
              onChange={setNumber("lookbackMaxDays")}
              className="w-28"
            />
          </FormField>
          <FormField
            label="Signalen zonder vervolg bewaren (maanden)"
            htmlFor="bot-retention"
            error={errors.signalRetentionMonths ?? fieldErrors.signalRetentionMonths}
            help="Een signaal dat nergens toe leidde wordt daarna verwijderd, samen met het bericht waar het uit kwam."
          >
            <Input
              id="bot-retention"
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={numbers.signalRetentionMonths}
              readOnly={!canManage}
              aria-invalid={Boolean(errors.signalRetentionMonths)}
              onChange={setNumber("signalRetentionMonths")}
              className="w-28"
            />
          </FormField>
        </div>
      </Group>

      <Group title="AI-kosten" description="Een schatting op basis van het aantal tokens per aanroep.">
        <FormField
          label="Maandplafond in euro"
          htmlFor="bot-budget"
          error={errors.aiBudgetEur ?? fieldErrors.aiBudgetEur}
          help={`Deze maand gebruikt: ${formatEuro(spentThisMonth)} in ${callsThisMonth} aanroepen. Is het plafond bereikt, dan beoordeelt en schrijft de bot niets meer tot het omhoog gaat of de nieuwe maand begint. 0 betekent geen plafond.`}
        >
          <Input
            id="bot-budget"
            type="number"
            inputMode="decimal"
            min={0}
            max={100000}
            step="1"
            value={numbers.aiBudgetEur}
            readOnly={!canManage}
            aria-invalid={Boolean(errors.aiBudgetEur)}
            onChange={setNumber("aiBudgetEur")}
            className="w-28"
          />
        </FormField>
      </Group>

      <Group title="Mailbox" description="Een extra ingang voor tips, naast Slack en het formulier op de website.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Eigen e-maildomein"
            htmlFor="bot-mail-domain"
            error={fieldErrors.mailDomain}
            help="Alleen e-mail van dit domein wordt gelezen; al het andere wordt ongelezen geweigerd. Leeg betekent dat de mailbox dicht is."
          >
            <Input
              id="bot-mail-domain"
              value={values.mailDomain}
              readOnly={!canManage}
              placeholder="nobears.nl"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => set("mailDomain", e.target.value.trim().toLowerCase().replace(/^@/, ""))}
            />
          </FormField>
          <FormField
            label="Adres van de mailbox"
            htmlFor="bot-mailbox"
            error={fieldErrors.mailboxAddress}
            help="Het adres waarop tips binnenkomen. Aan dit adres herkent de webhook de organisatie."
          >
            <Input
              id="bot-mailbox"
              type="email"
              value={values.mailboxAddress}
              readOnly={!canManage}
              placeholder="redactie@nobears.nl"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => set("mailboxAddress", e.target.value.trim())}
            />
          </FormField>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Laat de mailprovider binnenkomende berichten doorsturen naar <code className="rounded bg-muted px-1 py-0.5 font-mono">POST /api/inbound/mail</code>{" "}
          met de kop <code className="rounded bg-muted px-1 py-0.5 font-mono">Authorization: Bearer INBOUND_MAIL_SECRET</code> en als JSON de velden to,
          from, subject en text. De tekst van een e-mail is voor de bot een tip om te beoordelen, nooit een opdracht.
        </p>
      </Group>

      {canManage && (
        <div className="border-t pt-5">
          <SubmitButton pending={pending} disabled={!dirty || !valid}>
            Gedragsregels opslaan
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
