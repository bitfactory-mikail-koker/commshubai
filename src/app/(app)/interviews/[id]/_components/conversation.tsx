"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, FastForward, MessageSquareText, Play, SendHorizonal, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { answerInterview, autoAnswerDemoInterview, finishInterview, startInterview } from "@/actions/interviews";
import { ActionButton, useAction } from "@/components/shared/actions";
import { AgentAvatar, DemoBadge } from "@/components/shared/badges";
import { EmptyState, UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDay } from "@/lib/format";
import type { AgentKind, InterviewStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ConversationMessage = {
  id: string;
  role: "agent" | "interviewee";
  content: string;
  createdAt: string;
};

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="De agent is aan het typen">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70"
          style={{ animationDelay: `${i * 180}ms`, animationDuration: "1.1s" }}
        />
      ))}
    </span>
  );
}

export function Conversation({
  interviewId,
  status,
  messages,
  agentKind,
  agentName,
  intervieweeName,
  intervieweeColor,
  canAnswer,
  canManage,
  demoAnswers,
}: {
  interviewId: string;
  status: InterviewStatus;
  messages: ConversationMessage[];
  agentKind: AgentKind;
  agentName: string;
  intervieweeName: string;
  intervieweeColor: string;
  canAnswer: boolean;
  canManage: boolean;
  demoAnswers: string[];
}) {
  const start = useAction();
  const answer = useAction();
  const demo = useAction();
  const [draft, setDraft] = useState("");
  // The answer just sent, shown until the refreshed transcript contains it.
  const [optimistic, setOptimistic] = useState<{ text: string; baseCount: number } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const answeredCount = messages.filter((m) => m.role === "interviewee").length;
  const showOptimistic = optimistic !== null && optimistic.baseCount === answeredCount;
  const agentBusy = start.pending || answer.pending || demo.pending;
  const canStart = canAnswer && ["draft", "requested", "scheduled"].includes(status);
  const inProgress = status === "in_progress";
  const hasDemo = demoAnswers.length > 0;
  const lastIsAgent = messages[messages.length - 1]?.role === "agent";

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages.length, showOptimistic, agentBusy]);

  const send = () => {
    const text = draft.trim();
    if (!text || answer.pending) return;
    setOptimistic({ text, baseCount: answeredCount });
    setDraft("");
    answer.run(() => answerInterview({ id: interviewId, content: text }), {
      onSuccess: (result) => {
        // The answer is saved even when the agent could not respond.
        if (result.data.agentError) {
          toast.warning(`Je antwoord is opgeslagen, maar de agent kon niet reageren: ${result.data.agentError}`);
        }
      },
      onError: () => {
        setOptimistic(null);
        setDraft(text);
      },
    });
  };

  const fillDemoAnswer = () => {
    const next = demoAnswers[Math.min(answeredCount, demoAnswers.length - 1)];
    if (next) setDraft(next);
  };

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold tracking-tight">Gesprek</h2>
          <p className="text-xs text-muted-foreground">
            {status === "completed"
              ? "Het interview is afgerond. Het transcript is alleen-lezen."
              : status === "awaiting_confirmation"
                ? "Alle vragen zijn gesteld. De samenvatting wacht op bevestiging."
              : status === "cancelled"
                ? "Dit interview is geannuleerd."
                : inProgress
                  ? "De agent stelt één vraag per keer. Enter verstuurt, Shift+Enter geeft een nieuwe regel."
                  : "Start het interview om de eerste vraag te ontvangen."}
          </p>
        </div>
        {canManage && inProgress && answeredCount > 0 && (
          <ActionButton
            action={finishInterview.bind(null, { id: interviewId })}
            variant="outline"
            size="sm"
            pendingLabel="Samenvatten…"
            confirm={{
              title: "Interview afsluiten?",
              description:
                "De agent sluit het gesprek af en maakt een samenvatting van de antwoorden tot nu toe. Onbeantwoorde vragen vervallen.",
              confirmLabel: "Afsluiten en samenvatten",
            }}
          >
            <CircleCheck />
            Afsluiten en samenvatten
          </ActionButton>
        )}
      </div>

      <div ref={scrollerRef} className="max-h-[62vh] min-h-72 space-y-5 overflow-y-auto px-5 py-6" aria-live="polite">
        {messages.length === 0 && !agentBusy ? (
          <EmptyState
            icon={MessageSquareText}
            title={status === "cancelled" ? "Er is geen gesprek gevoerd" : "Het gesprek is nog niet gestart"}
            description={
              canStart
                ? `${agentName} stelt de voorbereide vragen één voor één en vraagt door waar een antwoord kort is.`
                : status === "cancelled"
                  ? undefined
                  : "Zodra het interview start, verschijnen de vragen en antwoorden hier."
            }
            action={
              canStart ? (
                <Button onClick={() => start.run(() => startInterview({ id: interviewId }))} disabled={start.pending}>
                  <Play />
                  Interview starten
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {messages.map((message) => {
              const isAgent = message.role === "agent";
              return (
                <div key={message.id} className={cn("flex gap-3", !isAgent && "flex-row-reverse")}>
                  {isAgent ? (
                    <AgentAvatar kind={agentKind} className="mt-0.5" />
                  ) : (
                    <UserAvatar name={intervieweeName} color={intervieweeColor} className="mt-0.5" />
                  )}
                  <div className={cn("max-w-[78%] space-y-1", !isAgent && "items-end text-right")}>
                    <div
                      className={cn(
                        "inline-block rounded-xl px-4 py-2.5 text-left text-[0.92rem] leading-relaxed whitespace-pre-wrap",
                        isAgent ? "rounded-tl-md bg-muted" : "rounded-tr-md bg-foreground text-background",
                      )}
                    >
                      {message.content}
                    </div>
                    <p className="px-1 text-[0.7rem] text-muted-foreground">
                      {isAgent ? agentName : intervieweeName} · <time dateTime={message.createdAt}>{formatDay(message.createdAt)}</time>
                    </p>
                  </div>
                </div>
              );
            })}

            {showOptimistic && optimistic && (
              <div className="flex flex-row-reverse gap-3">
                <UserAvatar name={intervieweeName} color={intervieweeColor} className="mt-0.5" />
                <div className="max-w-[78%] space-y-1 text-right">
                  <div className="inline-block rounded-xl rounded-tr-md bg-foreground/85 px-4 py-2.5 text-left text-[0.92rem] leading-relaxed whitespace-pre-wrap text-background">
                    {optimistic.text}
                  </div>
                  <p className="px-1 text-[0.7rem] text-muted-foreground">Wordt verstuurd…</p>
                </div>
              </div>
            )}

            {agentBusy && (
              <div className="flex gap-3">
                <AgentAvatar kind={agentKind} className="mt-0.5" />
                <div className="rounded-xl rounded-tl-md bg-muted px-4 py-2">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      {canAnswer && canStart && messages.length > 0 && (
        <div className="border-t px-5 py-4">
          <Button onClick={() => start.run(() => startInterview({ id: interviewId }))} disabled={start.pending}>
            <Play />
            Interview starten
          </Button>
        </div>
      )}

      {canAnswer && inProgress && messages.length > 0 && !lastIsAgent && !agentBusy && !showOptimistic && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-warning-soft px-5 py-3 text-sm text-warning">
          <span>De agent heeft nog niet gereageerd op het laatste antwoord. Het antwoord is opgeslagen.</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => start.run(() => startInterview({ id: interviewId }))}
            disabled={start.pending}
          >
            <Play />
            Interview hervatten
          </Button>
        </div>
      )}

      {canAnswer && inProgress && (
        <div className="space-y-3 border-t bg-muted/30 px-5 py-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={3}
              maxLength={6000}
              placeholder={lastIsAgent ? "Typ je antwoord…" : "Wacht op de volgende vraag…"}
              aria-label="Je antwoord"
              disabled={answer.pending || demo.pending}
              className="min-h-20 flex-1 resize-none bg-card"
            />
            <Button type="submit" size="lg" disabled={!draft.trim() || answer.pending || demo.pending} aria-label="Antwoord versturen">
              <SendHorizonal />
              Versturen
            </Button>
          </form>

          {hasDemo && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted px-3 py-2">
              <DemoBadge />
              <span className="mr-auto text-xs text-muted-foreground">Voor dit demo-interview zijn voorbeeldantwoorden beschikbaar.</span>
              <Button type="button" variant="outline" size="sm" onClick={fillDemoAnswer} disabled={answer.pending || demo.pending}>
                <Wand2 />
                Demo-antwoord invullen
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={answer.pending || demo.pending}
                onClick={() => demo.run(() => autoAnswerDemoInterview({ id: interviewId }))}
              >
                <FastForward />
                {demo.pending ? "Bezig met beantwoorden…" : "Alles beantwoorden met demo-antwoorden"}
              </Button>
            </div>
          )}
        </div>
      )}

      {canAnswer && canStart && hasDemo && messages.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border bg-muted px-5 py-3">
          <DemoBadge />
          <span className="mr-auto text-xs text-muted-foreground">
            Je kunt het gesprek zelf voeren of het in één keer laten beantwoorden met de voorbeeldantwoorden.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={demo.pending || start.pending}
            onClick={() => demo.run(() => autoAnswerDemoInterview({ id: interviewId }))}
          >
            <FastForward />
            {demo.pending ? "Bezig met beantwoorden…" : "Alles beantwoorden met demo-antwoorden"}
          </Button>
        </div>
      )}
    </section>
  );
}
