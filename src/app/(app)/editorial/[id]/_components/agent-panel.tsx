"use client";

import { useState } from "react";
import Link from "next/link";
import { Hash, Loader2, Mail, MessageCircleQuestion, Mic, Share2, Sparkles } from "lucide-react";
import { askInternalAgent, createSocialDrafts, createVariant, generateDraftAction } from "@/actions/articles";
import { ActionButton, FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { AgentAvatar } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { AgentKind } from "@/lib/types";

/** Creates a Slack / e-mail variant and opens the new content item. */
function VariantButton({ articleId, channel, disabled }: { articleId: string; channel: "slack" | "email"; disabled: boolean }) {
  const { run, pending } = useAction();
  const Icon = channel === "slack" ? Hash : Mail;
  return (
    <Button
      variant="outline"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() =>
        run(() => createVariant({ id: articleId, channel }), { redirectTo: (result) => `/editorial/${result.data.id}` })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Icon />}
      {pending
        ? channel === "slack"
          ? "Aankondiging wordt opgesteld…"
          : "E-mail wordt opgesteld…"
        : channel === "slack"
          ? "Slack-aankondiging maken"
          : "E-mailconcept maken"}
    </Button>
  );
}

export function AgentPanel({
  articleId,
  agent,
  isExternal,
  hasBody,
  hasDraft,
  canGenerate,
  generateBlockedReason,
  canCreate,
  socialPostCount,
  aiIsDemo,
}: {
  articleId: string;
  agent: { kind: AgentKind; name: string; status: string } | null;
  isExternal: boolean;
  hasBody: boolean;
  hasDraft: boolean;
  /** User may ask the agent to write. */
  canGenerate: boolean;
  /** Set when the current status does not allow a new draft. */
  generateBlockedReason: string | null;
  canCreate: boolean;
  socialPostCount: number;
  aiIsDemo: boolean;
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const [draftOpen, setDraftOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");

  const paused = agent !== null && agent.status !== "active";

  return (
    <div className="space-y-4">
      {agent ? (
        <div className="flex items-center gap-3">
          <AgentAvatar kind={agent.kind} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{agent.name}</p>
            <p className="text-xs text-muted-foreground">
              {paused ? "Gepauzeerd - activeer de agent onder AI-agents" : "Verantwoordelijk voor dit item"}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Er is geen agent aan dit item gekoppeld.</p>
      )}

      {canGenerate || canCreate ? (
        <div className="grid gap-2">
          {canGenerate && (
            <>
              <Button onClick={() => setDraftOpen(true)} disabled={generateBlockedReason !== null} variant={hasDraft ? "outline" : "default"}>
                <Sparkles />
                {hasDraft ? "Concept opnieuw laten schrijven" : "Concept laten schrijven"}
              </Button>
              {generateBlockedReason && <p className="text-xs leading-relaxed text-muted-foreground">{generateBlockedReason}</p>}
            </>
          )}

          {canCreate && (
            <Button asChild variant="outline">
              <Link href={`/interviews?nieuw=1&artikel=${articleId}`}>
                <Mic />
                Interview aanvragen
              </Link>
            </Button>
          )}

          {isExternal && canCreate && (
            <ActionButton
              variant="outline"
              disabled={!hasBody}
              action={() => createSocialDrafts({ id: articleId })}
              pendingLabel="Concept wordt gemaakt…"
            >
              <Share2 />
              LinkedIn-concept maken
            </ActionButton>
          )}

          {isExternal && canGenerate && (
            <Button variant="outline" onClick={() => setAskOpen(true)}>
              <MessageCircleQuestion />
              Vraag de interne agent
            </Button>
          )}

          {canCreate && (
            <>
              <VariantButton articleId={articleId} channel="slack" disabled={!hasBody} />
              <VariantButton articleId={articleId} channel="email" disabled={!hasBody} />
            </>
          )}

          {isExternal && socialPostCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {socialPostCount} social-concept(en) bij dit item.{" "}
              <Link href="/external" className="font-medium text-foreground underline underline-offset-2">
                Bekijk onder Extern bureau
              </Link>
            </p>
          )}
          {!hasBody && canCreate && (
            <p className="text-xs text-muted-foreground">Afgeleide concepten zijn beschikbaar zodra het item tekst heeft.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Je hebt geen rechten om de agent opdrachten te geven.</p>
      )}

      {/* Generate draft */}
      <Dialog
        open={draftOpen}
        onOpenChange={(open) => {
          setDraftOpen(open);
          if (!open) clearErrors();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => generateDraftAction({ id: articleId, instructions: instructions.trim() || undefined }), {
                onSuccess: () => {
                  setDraftOpen(false);
                  setInstructions("");
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{hasDraft ? "Concept opnieuw laten schrijven" : "Concept laten schrijven"}</DialogTitle>
              <DialogDescription>
                De agent schrijft op basis van de gekoppelde bronnen en het interview. Feiten, cijfers en quotes komen uitsluitend uit dat
                materiaal; wat ontbreekt wordt gemarkeerd met [AANVULLEN]. Het resultaat wordt opgeslagen als nieuwe versie
                {hasDraft ? " en vervangt de huidige tekst (die blijft bewaard in de versiegeschiedenis)" : ""}.
                {aiIsDemo ? " De AI draait in demo-modus: het concept wordt regelgebaseerd samengesteld." : ""}
              </DialogDescription>
            </DialogHeader>
            <FormField
              label="Aanvullende instructie"
              htmlFor="draft-instructions"
              help="Optioneel. Bijvoorbeeld: korter, meer nadruk op het resultaat, begin met de quote."
            >
              <Textarea
                id="draft-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                maxLength={600}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDraftOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>{pending ? "Agent schrijft…" : "Concept schrijven"}</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ask internal agent */}
      <Dialog
        open={askOpen}
        onOpenChange={(open) => {
          setAskOpen(open);
          if (!open) clearErrors();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => askInternalAgent({ id: articleId, question }), {
                onSuccess: () => {
                  setAskOpen(false);
                  setQuestion("");
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Vraag de interne agent</DialogTitle>
              <DialogDescription>
                De externe agent legt je vraag voor aan de interne agent. Die zoekt het antwoord in de interne bronnen waar hij toegang
                toe heeft en deelt niets vertrouwelijks. Het antwoord komt bij de opmerkingen te staan.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Vraag" htmlFor="agent-question" error={fieldErrors.question} required>
              <Textarea
                id="agent-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                minLength={8}
                maxLength={600}
                required
                placeholder="Bijvoorbeeld: zijn er interne cijfers over het aantal gebruikers na de livegang?"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAskOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Vraag stellen</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
