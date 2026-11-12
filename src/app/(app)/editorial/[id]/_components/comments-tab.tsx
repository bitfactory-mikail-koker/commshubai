"use client";

import { useState } from "react";
import { Check, CornerDownRight, MessageSquare, Quote, RotateCcw, Trash2, X } from "lucide-react";
import { addComment, deleteComment, setCommentResolved } from "@/actions/articles";
import { ActionButton, SubmitButton, useAction } from "@/components/shared/actions";
import { AgentAvatar, ToneBadge } from "@/components/shared/badges";
import { EmptyState, UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommentItem } from "./types";

function CommentBody({ comment }: { comment: CommentItem }) {
  const author = comment.agent?.name ?? comment.profile?.full_name ?? "Onbekend";
  return (
    <div className="flex gap-3">
      {comment.agent ? (
        <AgentAvatar kind={comment.agent.kind} className="mt-0.5" />
      ) : (
        <UserAvatar name={comment.profile?.full_name} color={comment.profile?.avatar_color} className="mt-0.5" />
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{author}</span>
          <time dateTime={comment.created_at} className="text-xs text-muted-foreground">
            {formatDay(comment.created_at)}
          </time>
          {comment.resolved && <ToneBadge tone="green">Afgehandeld</ToneBadge>}
        </p>
        {comment.quote && (
          <blockquote className="border-l-2 border-warning/25 bg-warning-soft py-1 pr-2 pl-3 text-sm text-muted-foreground italic">
            {comment.quote}
          </blockquote>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-line">{comment.body}</p>
      </div>
    </div>
  );
}

export function CommentsTab({
  articleId,
  comments,
  currentUserId,
  canComment,
  canModerate,
  selection,
}: {
  articleId: string;
  comments: CommentItem[];
  currentUserId: string;
  canComment: boolean;
  canModerate: boolean;
  /** Text currently selected in the editor; can be attached as a quote. */
  selection: string;
}) {
  const { run, pending } = useAction();
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const threads = comments.filter((c) => !c.parent_id);
  const replies = (id: string) => comments.filter((c) => c.parent_id === id);
  const resolvedCount = threads.filter((c) => c.resolved).length;
  const visible = threads.filter((c) => showResolved || !c.resolved);
  const replyTarget = replyTo ? threads.find((c) => c.id === replyTo) : null;

  const submit = () =>
    run(
      () =>
        addComment({
          entityType: "article",
          entityId: articleId,
          body,
          quote: quote ?? undefined,
          parentId: replyTo ?? undefined,
        }),
      {
        onSuccess: () => {
          setBody("");
          setQuote(null);
          setReplyTo(null);
        },
      },
    );

  return (
    <div className="space-y-4">
      {resolvedCount > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Afgehandelde opmerkingen verbergen" : `Toon afgehandelde opmerkingen (${resolvedCount})`}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={MessageSquare}
            title={threads.length === 0 ? "Nog geen opmerkingen" : "Geen openstaande opmerkingen"}
            description="Opmerkingen van redactie en agents komen hier te staan. Selecteer tekst in de editor om een citaat mee te sturen."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((comment) => {
            const mayResolve = canModerate || comment.author_profile_id === currentUserId;
            return (
              <li key={comment.id} className={cn("space-y-4 rounded-lg border bg-card p-5", comment.resolved && "opacity-70")}>
                <CommentBody comment={comment} />
                {replies(comment.id).map((reply) => (
                  <div key={reply.id} className="ml-5 flex gap-2 border-l pl-4">
                    <div className="min-w-0 flex-1">
                      <CommentBody comment={reply} />
                    </div>
                    {reply.author_profile_id === currentUserId && (
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Reactie verwijderen"
                        action={() => deleteComment({ id: reply.id })}
                        confirm={{
                          title: "Reactie verwijderen?",
                          description: "Dit kan niet ongedaan worden gemaakt.",
                          confirmLabel: "Verwijderen",
                          destructive: true,
                        }}
                      >
                        <Trash2 />
                      </ActionButton>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
                  {canComment && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplyTo(comment.id);
                        document.getElementById("comment-body")?.focus();
                      }}
                    >
                      <CornerDownRight />
                      Reageren
                    </Button>
                  )}
                  {mayResolve && (
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      action={() => setCommentResolved({ id: comment.id, resolved: !comment.resolved })}
                    >
                      {comment.resolved ? <RotateCcw /> : <Check />}
                      {comment.resolved ? "Heropenen" : "Afhandelen"}
                    </ActionButton>
                  )}
                  {comment.author_profile_id === currentUserId && (
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      action={() => deleteComment({ id: comment.id })}
                      confirm={{
                        title: "Opmerking verwijderen?",
                        description: "De opmerking en eventuele reacties worden verwijderd. Dit kan niet ongedaan worden gemaakt.",
                        confirmLabel: "Verwijderen",
                        destructive: true,
                      }}
                    >
                      <Trash2 />
                      Verwijderen
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canComment && (
        <form
          className="space-y-3 rounded-lg border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {replyTarget && (
            <p className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <span className="truncate">
                Reactie op {replyTarget.agent?.name ?? replyTarget.profile?.full_name ?? "opmerking"}: “{replyTarget.body.slice(0, 80)}
                {replyTarget.body.length > 80 ? "…" : ""}”
              </span>
              <button
                type="button"
                className="shrink-0 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setReplyTo(null)}
                aria-label="Reactie annuleren"
              >
                <X className="size-3.5" />
              </button>
            </p>
          )}
          {quote && (
            <div className="flex items-start gap-2">
              <blockquote className="flex-1 border-l-2 border-warning/25 bg-warning-soft py-1 pr-2 pl-3 text-sm text-muted-foreground italic">
                {quote}
              </blockquote>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQuote(null)} aria-label="Citaat verwijderen">
                <X />
              </Button>
            </div>
          )}
          <Textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={replyTarget ? "Schrijf een reactie…" : "Schrijf een opmerking voor de redactie…"}
            aria-label="Opmerking"
            rows={3}
            maxLength={4000}
            required
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!replyTarget && !quote ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selection}
                onClick={() => setQuote(selection.slice(0, 500))}
                title={selection ? undefined : "Selecteer eerst tekst op het tabblad Bewerken"}
              >
                <Quote />
                Selectie als citaat toevoegen
              </Button>
            ) : (
              <span />
            )}
            <SubmitButton pending={pending} size="sm" disabled={body.trim().length === 0}>
              {replyTarget ? "Reactie plaatsen" : "Opmerking plaatsen"}
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
