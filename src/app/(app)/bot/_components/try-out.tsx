"use client";

import { useState } from "react";
import Link from "next/link";
import { Hash, Mail, MessageSquare, SmilePlus } from "lucide-react";
import { simulateBotEvent } from "@/actions/redactie";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Panel } from "@/components/shared/layout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Kind = "emoji" | "message" | "dm" | "mail";

const KINDS: { key: Kind; label: string; icon: typeof Hash; intro: string }[] = [
  {
    key: "emoji",
    label: "Emoji bij een bericht",
    icon: SmilePlus,
    intro: "Een collega zet een emoji bij een bericht in een gevolgd kanaal. De bot antwoordt in de thread en legt een voorstel voor aan de redactie.",
  },
  {
    key: "message",
    label: "Bericht in een kanaal",
    icon: Hash,
    intro: "Iemand schrijft iets in een gevolgd kanaal. In een kanaal met alleen emoji's leest de bot niet mee, behalve bij mensen die hij volgt.",
  },
  {
    key: "dm",
    label: "Privébericht aan de bot",
    icon: MessageSquare,
    intro: "Een collega schrijft de bot zelf aan: een antwoord in een interview, een tip, of “pauzeer een maand”. De bot voert verder geen opdrachten uit.",
  },
  {
    key: "mail",
    label: "E-mail aan de mailbox",
    icon: Mail,
    intro: "Een e-mail komt binnen op de mailbox van de redactie. Alleen het eigen domein wordt gelezen; de inhoud is een tip, geen opdracht.",
  },
];

const FOLLOW_MODE: Record<string, string> = { emoji_only: "alleen emoji's", listen: "meelezen", active: "actief ophalen" };

const EXAMPLES: Record<Kind, string> = {
  emoji: "De nieuwe planningsmodule voor Rijnmond Logistiek is opgeleverd. De klant meldt dat het inroosteren nu 2 uur per week scheelt.",
  message: "We hebben de aanbesteding van de gemeente gewonnen. In maart starten we met de bouw van het nieuwe zaaksysteem.",
  dm: "Tip: ons team heeft deze week de duizendste release van het platform gedaan zonder één storing.",
  mail: "Hoi redactie, volgende week donderdag is er een kennissessie over toegankelijkheid in de kantine. Iedereen is welkom.",
};

type Result = { id: number; kind: Kind; ok: boolean; detail: string };

export function TryOut({
  channels,
  emoji,
  people,
  currentUserId,
  mailDomain,
  mailboxAddress,
  paused,
}: {
  channels: { id: string; name: string; followMode: string }[];
  emoji: { emoji: string; shortcode: string; goal: string }[];
  people: { id: string; name: string }[];
  currentUserId: string;
  mailDomain: string;
  mailboxAddress: string;
  paused: boolean;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [kind, setKind] = useState<Kind>("emoji");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [shortcode, setShortcode] = useState(emoji[0]?.shortcode ?? "");
  const [authorId, setAuthorId] = useState(currentUserId);
  const [reactorId, setReactorId] = useState(currentUserId);
  const [text, setText] = useState(EXAMPLES.emoji);
  const [from, setFrom] = useState(mailDomain ? `collega@${mailDomain}` : "");
  const [subject, setSubject] = useState("Tip voor de redactie");
  const [results, setResults] = useState<Result[]>([]);

  const current = KINDS.find((k) => k.key === kind)!;
  const needsChannel = kind === "emoji" || kind === "message";
  const noChannels = needsChannel && channels.length === 0;
  const noEmoji = kind === "emoji" && emoji.length === 0;

  const choose = (next: Kind) => {
    // Keep what the user typed; only swap the example when the text is still an example.
    if (Object.values(EXAMPLES).includes(text)) setText(EXAMPLES[next]);
    setKind(next);
  };

  const submit = () => {
    const record = (ok: boolean, detail: string) => setResults((r) => [{ id: Date.now(), kind, ok, detail }, ...r].slice(0, 8));
    run(
      () =>
        simulateBotEvent({
          kind,
          text,
          ...(needsChannel ? { channelId } : {}),
          ...(kind === "emoji" ? { shortcode, reactorId } : {}),
          ...(kind !== "mail" ? { authorId } : { from, subject }),
        }),
      {
        silent: true,
        onSuccess: (result) => record(true, result.data.detail),
        onError: (result) => record(false, result.error),
      },
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Panel title="Proefbericht">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending && !noChannels && !noEmoji) submit();
          }}
        >
          <div className="flex flex-wrap gap-1" role="group" aria-label="Soort gebeurtenis">
            {KINDS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={kind === option.key}
                onClick={() => choose(option.key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  kind === option.key
                    ? "bg-secondary font-medium text-foreground ring-1 ring-border ring-inset"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                <option.icon className="size-3.5" strokeWidth={1.75} />
                {option.label}
              </button>
            ))}
          </div>
          <p className="max-w-[68ch] text-[0.8125rem] leading-relaxed text-muted-foreground">{current.intro}</p>

          {paused && (
            <p className="text-[0.8125rem] font-medium text-warning" role="status">
              De bot is gepauzeerd. Een proefbericht wordt nu genegeerd of tegengehouden; zo zie je wat de pauzeknop doet.
            </p>
          )}

          {needsChannel && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Kanaal"
                htmlFor="try-channel"
                error={fieldErrors.channelId}
                help={
                  noChannels ? (
                    <>
                      Er wordt nog geen kanaal gevolgd. Zet er een aan bij <Link href="/channels" className="underline underline-offset-2">Kanalen en emoji&apos;s</Link>.
                    </>
                  ) : (
                    "Alleen gevolgde kanalen. In andere kanalen doet de bot niets."
                  )
                }
              >
                <Select value={channelId} onValueChange={setChannelId} disabled={noChannels}>
                  <SelectTrigger id="try-channel" className="w-full">
                    <SelectValue placeholder="Geen gevolgd kanaal" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((channel) => (
                      <SelectItem key={channel.id} value={channel.id}>
                        #{channel.name} ({FOLLOW_MODE[channel.followMode] ?? channel.followMode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {kind === "emoji" && (
                <FormField label="Emoji" htmlFor="try-emoji" error={fieldErrors.shortcode} help={noEmoji ? "Er staat geen emoji aan." : undefined}>
                  <Select value={shortcode} onValueChange={setShortcode} disabled={noEmoji}>
                    <SelectTrigger id="try-emoji" className="w-full">
                      <SelectValue placeholder="Geen emoji" />
                    </SelectTrigger>
                    <SelectContent>
                      {emoji.map((rule) => (
                        <SelectItem key={rule.shortcode} value={rule.shortcode}>
                          {rule.emoji} {rule.goal}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
          )}

          {kind !== "mail" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={kind === "dm" ? "Afzender" : "Schrijver van het bericht"} htmlFor="try-author" error={fieldErrors.authorId}>
                <Select value={authorId} onValueChange={setAuthorId}>
                  <SelectTrigger id="try-author" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              {kind === "emoji" && (
                <FormField label="Wie de emoji plaatst" htmlFor="try-reactor" error={fieldErrors.reactorId}>
                  <Select value={reactorId} onValueChange={setReactorId}>
                    <SelectTrigger id="try-reactor" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
          )}

          {kind === "mail" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Van"
                htmlFor="try-from"
                error={fieldErrors.from}
                help={
                  mailDomain
                    ? `Alleen @${mailDomain} wordt gelezen. Probeer ook een ander domein: dat wordt geweigerd.`
                    : "Er is geen eigen domein ingesteld, dus de mailbox is dicht en elke e-mail wordt geweigerd."
                }
                required
              >
                <Input id="try-from" type="email" required value={from} autoCapitalize="none" spellCheck={false} onChange={(e) => setFrom(e.target.value)} />
              </FormField>
              <FormField label="Onderwerp" htmlFor="try-subject" error={fieldErrors.subject} help={mailboxAddress ? `Aan: ${mailboxAddress}` : undefined}>
                <Input id="try-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </FormField>
            </div>
          )}

          <FormField label={kind === "mail" ? "Tekst van de e-mail" : "Tekst van het bericht"} htmlFor="try-text" error={fieldErrors.text} required>
            <Textarea id="try-text" required rows={4} value={text} onChange={(e) => setText(e.target.value)} className="min-h-24" />
          </FormField>

          <SubmitButton pending={pending} disabled={noChannels || noEmoji || text.trim().length < 3}>
            Proefbericht verwerken
          </SubmitButton>
        </form>
      </Panel>

      <Panel title="Wat de bot ermee deed" flush>
        <div aria-live="polite">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
              Nog niets verwerkt. De uitkomst van elk proefbericht verschijnt hier; de berichten van de bot zelf staan in het postvak.
            </p>
          ) : (
            <ol className="divide-y">
              {results.map((result) => (
                <li key={result.id} className="space-y-1 px-4 py-2.5">
                  <p className="text-xs font-medium text-muted-foreground">{KINDS.find((k) => k.key === result.kind)?.label}</p>
                  <p className={cn("text-[0.8125rem] leading-relaxed text-pretty", !result.ok && "font-medium text-danger")}>{result.detail}</p>
                </li>
              ))}
            </ol>
          )}
          {results.length > 0 && (
            <p className="flex flex-wrap gap-x-3 border-t px-4 py-2.5 text-[0.8125rem]">
              <Link href="/bot" className="font-medium text-info underline-offset-2 hover:underline">
                Postvak bekijken
              </Link>
              <Link href="/inbox" className="font-medium text-info underline-offset-2 hover:underline">
                Inbox bekijken
              </Link>
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
