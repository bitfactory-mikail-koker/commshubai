"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { saveBrandGuidelines } from "@/actions/brand";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Panel } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type BrandFormValues = {
  brandPersonality: string;
  writingStyle: string;
  sentenceStructure: string;
  toneInternal: string;
  toneExternal: string;
  toneSocial: string;
  communicationPolicies: string;
  boilerplate: string;
  wordsToAvoid: string[];
  terminology: { term: string; instead_of: string; note: string }[];
};

type TextKey = Exclude<keyof BrandFormValues, "wordsToAvoid" | "terminology">;

function TextArea({
  id,
  label,
  help,
  value,
  onChange,
  disabled,
  rows = 4,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  rows?: number;
  placeholder?: string;
  error?: string;
}) {
  return (
    <FormField label={label} htmlFor={id} help={help} error={error}>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={disabled ? "Nog niet ingevuld." : placeholder}
        readOnly={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn("min-h-0 resize-y leading-relaxed", disabled && "bg-muted/40")}
      />
    </FormField>
  );
}

export function BrandForm({ initial, canManage }: { initial: BrandFormValues; canManage: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [values, setValues] = useState<BrandFormValues>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [wordDraft, setWordDraft] = useState("");
  const disabled = !canManage;

  const dirty = useMemo(() => JSON.stringify(values) !== baseline, [values, baseline]);
  const setText = (key: TextKey) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const addWords = (raw: string) => {
    const words = raw
      .split(/[,\n]/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return;
    setValues((v) => {
      const existing = new Set(v.wordsToAvoid.map((w) => w.toLowerCase()));
      const added = words.filter((w) => !existing.has(w.toLowerCase()));
      return { ...v, wordsToAvoid: [...v.wordsToAvoid, ...added] };
    });
    setWordDraft("");
  };

  const setTerm = (index: number, key: "term" | "instead_of" | "note", value: string) =>
    setValues((v) => ({
      ...v,
      terminology: v.terminology.map((t, i) => (i === index ? { ...t, [key]: value } : t)),
    }));

  const submit = () => {
    // Drop completely empty terminology rows; partially filled rows are validated on the server.
    const terminology = values.terminology.filter((t) => t.term.trim() || t.instead_of.trim() || t.note.trim());
    const payload = { ...values, terminology };
    run(() => saveBrandGuidelines(payload), {
      onSuccess: () => {
        setValues(payload);
        setBaseline(JSON.stringify(payload));
      },
    });
  };

  const termError = Object.entries(fieldErrors).find(([key]) => key.startsWith("terminology"))?.[1];

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) submit();
      }}
    >
      <Panel title="Merk en schrijfstijl" description="Wie zijn we en hoe schrijven we? Dit is de basis voor elke tekst.">
        <div className="space-y-5">
          <TextArea
            id="brandPersonality"
            label="Merkpersoonlijkheid"
            help="Beschrijf het karakter van de organisatie in een paar zinnen."
            placeholder="Bijvoorbeeld: nuchter, betrokken en deskundig. We beloven niets wat we niet waarmaken."
            value={values.brandPersonality}
            onChange={setText("brandPersonality")}
            disabled={disabled}
            error={fieldErrors.brandPersonality}
          />
          <TextArea
            id="writingStyle"
            label="Schrijfstijl"
            help="Aanspreekvorm, actief of passief, gebruik van jargon, lengte van teksten."
            placeholder="Bijvoorbeeld: we schrijven actief en concreet, spreken de lezer aan met ‘je’ en vermijden jargon."
            value={values.writingStyle}
            onChange={setText("writingStyle")}
            disabled={disabled}
            error={fieldErrors.writingStyle}
          />
          <TextArea
            id="sentenceStructure"
            label="Zinsbouw"
            help="Lengte en opbouw van zinnen en alinea's."
            placeholder="Bijvoorbeeld: korte zinnen, één boodschap per alinea, de kern vooraan."
            rows={3}
            value={values.sentenceStructure}
            onChange={setText("sentenceStructure")}
            disabled={disabled}
            error={fieldErrors.sentenceStructure}
          />
        </div>
      </Panel>

      <Panel title="Toon per kanaal" description="De agents kiezen de toon op basis van de classificatie en het kanaal van een stuk.">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Intern</p>
            <TextArea
              id="toneInternal"
              label="Interne communicatie"
              placeholder="Bijvoorbeeld: informeel en direct, alsof je het een collega bij de koffie vertelt."
              rows={6}
              value={values.toneInternal}
              onChange={setText("toneInternal")}
              disabled={disabled}
              error={fieldErrors.toneInternal}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Extern</p>
            <TextArea
              id="toneExternal"
              label="Externe communicatie"
              placeholder="Bijvoorbeeld: professioneel en toegankelijk; laat de klant aan het woord."
              rows={6}
              value={values.toneExternal}
              onChange={setText("toneExternal")}
              disabled={disabled}
              error={fieldErrors.toneExternal}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Social</p>
            <TextArea
              id="toneSocial"
              label="Social media"
              placeholder="Bijvoorbeeld: kort en persoonlijk, maximaal drie hashtags, geen uitroeptekens op rij."
              rows={6}
              value={values.toneSocial}
              onChange={setText("toneSocial")}
              disabled={disabled}
              error={fieldErrors.toneSocial}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Voorkeursterminologie"
        description="Vaste termen die de organisatie gebruikt. De merkcontrole signaleert het als de vermeden term in een tekst staat."
        actions={
          canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setValues((v) => ({ ...v, terminology: [...v.terminology, { term: "", instead_of: "", note: "" }] }))}
            >
              <Plus />
              Term toevoegen
            </Button>
          ) : undefined
        }
      >
        {values.terminology.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen voorkeurstermen vastgelegd.{canManage && " Voeg een term toe om te beginnen."}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="hidden grid-cols-[1fr_1fr_1.4fr_2rem] gap-3 px-0.5 text-xs font-medium text-muted-foreground sm:grid">
              <span>Voorkeursterm</span>
              <span>In plaats van</span>
              <span>Toelichting</span>
              <span className="sr-only">Verwijderen</span>
            </div>
            {values.terminology.map((rule, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1.4fr_2rem] sm:gap-3 sm:border-0 sm:p-0">
                <Input
                  aria-label="Voorkeursterm"
                  placeholder="klant"
                  value={rule.term}
                  readOnly={disabled}
                  onChange={(e) => setTerm(index, "term", e.target.value)}
                />
                <Input
                  aria-label="In plaats van"
                  placeholder="cliënt"
                  value={rule.instead_of}
                  readOnly={disabled}
                  onChange={(e) => setTerm(index, "instead_of", e.target.value)}
                />
                <Input
                  aria-label="Toelichting"
                  placeholder="Optioneel"
                  value={rule.note}
                  readOnly={disabled}
                  onChange={(e) => setTerm(index, "note", e.target.value)}
                />
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Term ${rule.term || index + 1} verwijderen`}
                    onClick={() => setValues((v) => ({ ...v, terminology: v.terminology.filter((_, i) => i !== index) }))}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            {termError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {termError}
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Woorden om te vermijden" description="Clichés, jargon en woorden die niet bij het merk passen.">
        <div className="space-y-3">
          {values.wordsToAvoid.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {values.wordsToAvoid.map((word) => (
                <li
                  key={word}
                  className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/50 pr-1 pl-2.5 text-[0.8125rem] font-medium"
                >
                  {word}
                  {canManage ? (
                    <button
                      type="button"
                      aria-label={`${word} verwijderen`}
                      className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                      onClick={() => setValues((v) => ({ ...v, wordsToAvoid: v.wordsToAvoid.filter((w) => w !== word) }))}
                    >
                      <X className="size-3" />
                    </button>
                  ) : (
                    <span className="w-1.5" />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nog geen woorden op de lijst.</p>
          )}
          {canManage && (
            <FormField
              label="Woord toevoegen"
              htmlFor="wordDraft"
              help="Druk op Enter of typ een komma om toe te voegen. Meerdere woorden plakken kan ook."
              error={fieldErrors.wordsToAvoid}
            >
              <Input
                id="wordDraft"
                value={wordDraft}
                placeholder="Bijvoorbeeld: innovatief, uniek, ontzorgen"
                className="max-w-md"
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.includes(",")) addWords(value);
                  else setWordDraft(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addWords(wordDraft);
                  } else if (e.key === "Backspace" && !wordDraft && values.wordsToAvoid.length > 0) {
                    setValues((v) => ({ ...v, wordsToAvoid: v.wordsToAvoid.slice(0, -1) }));
                  }
                }}
                onBlur={() => addWords(wordDraft)}
              />
            </FormField>
          )}
        </div>
      </Panel>

      <Panel title="Beleid en boilerplate">
        <div className="space-y-5">
          <TextArea
            id="communicationPolicies"
            label="Communicatiebeleid"
            help="Afspraken waar de agents zich aan houden: wat mag wel en niet extern, hoe gaan we om met klantnamen, cijfers en quotes."
            placeholder="Bijvoorbeeld: klantnamen alleen na schriftelijke toestemming; geen omzetcijfers extern; quotes altijd laten accorderen."
            rows={5}
            value={values.communicationPolicies}
            onChange={setText("communicationPolicies")}
            disabled={disabled}
            error={fieldErrors.communicationPolicies}
          />
          <TextArea
            id="boilerplate"
            label="Boilerplate (‘Over ons’)"
            help="Vaste slotalinea onder externe artikelen en klantcases. Cijfers hierin gelden als bron bij de merkcontrole."
            rows={3}
            value={values.boilerplate}
            onChange={setText("boilerplate")}
            disabled={disabled}
            error={fieldErrors.boilerplate}
          />
        </div>
      </Panel>

      {canManage && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-2.5 shadow-[var(--shadow-overlay)]">
          <p className={cn("text-[0.8125rem]", dirty ? "font-medium text-foreground" : "text-muted-foreground")} aria-live="polite">
            {dirty ? "Je hebt niet-opgeslagen wijzigingen" : "Alle wijzigingen zijn opgeslagen"}
          </p>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setValues(JSON.parse(baseline) as BrandFormValues)}
              >
                Wijzigingen ongedaan maken
              </Button>
            )}
            <SubmitButton pending={pending} disabled={!dirty}>
              Opslaan
            </SubmitButton>
          </div>
        </div>
      )}
    </form>
  );
}
