"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, Copy, Loader2, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { socialPostWorkflow, updateSocialPost } from "@/actions/articles";
import { useAction } from "@/components/shared/actions";
import { DemoBadge, MetaBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SOCIAL_STATUS_META } from "@/lib/constants";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";

export type SocialPostView = {
  id: string;
  platform: string;
  body: string;
  status: string;
  publish_at: string | null;
  published_at: string | null;
  publication_mode: string | null;
  generation_provider: string | null;
  is_demo: boolean;
  article: { id: string; title: string } | null;
};

const PLATFORM_LABELS: Record<string, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", facebook: "Facebook" };

type WorkflowAction = Parameters<typeof socialPostWorkflow>[0]["action"];

export function SocialPostCard({
  post,
  canEdit,
  canReview,
  canApprove,
  canPublish,
}: {
  post: SocialPostView;
  canEdit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canPublish: boolean;
}) {
  const { run, pending } = useAction();
  const [body, setBody] = useState(post.body);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishAt, setPublishAt] = useState(() =>
    toDateTimeLocal(post.publish_at ?? new Date(Date.now() + 24 * 3600_000).toISOString()),
  );
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const editable = canEdit && ["draft", "changes_requested"].includes(post.status);
  const dirty = body.trim() !== post.body.trim();

  const workflow = (action: WorkflowAction, extra: { note?: string; publishAt?: string } = {}) => {
    setActiveAction(action);
    run(() => socialPostWorkflow({ id: post.id, action, ...extra }), {
      onSuccess: () => {
        setScheduleOpen(false);
        setNoteOpen(false);
        setNote("");
      },
    });
  };

  const busy = (action: string) => pending && activeAction === action;
  const spinner = (action: string, icon: React.ReactNode) =>
    busy(action) ? <Loader2 className="animate-spin" data-icon="inline-start" /> : icon;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post.body);
      toast.success("Tekst gekopieerd naar het klembord.");
    } catch {
      toast.error("Kopiëren is niet gelukt. Selecteer de tekst handmatig.");
    }
  };

  return (
    <article className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{PLATFORM_LABELS[post.platform] ?? post.platform}</span>
        <MetaBadge meta={SOCIAL_STATUS_META} value={post.status} dot />
        {post.generation_provider === "demo" && <DemoBadge label="Demo-concept" />}
        {post.is_demo && post.generation_provider !== "demo" && <DemoBadge />}
        {post.article && (
          <Link href={`/editorial/${post.article.id}`} className="underline-offset-2 hover:text-foreground hover:underline">
            Bij: {post.article.title}
          </Link>
        )}
        {post.status === "scheduled" && post.publish_at && (
          <span suppressHydrationWarning>· ingepland op {formatDateTime(post.publish_at)}</span>
        )}
        {post.status === "published" && (
          <span suppressHydrationWarning>
            · geplaatst {formatDateTime(post.published_at)}
            {post.publication_mode === "simulated" && " (gesimuleerd)"}
          </span>
        )}
      </div>

      {editable ? (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(12, Math.max(5, body.split("\n").length + 1))}
          maxLength={3000}
          aria-label="Tekst van de social post"
          className="text-sm leading-relaxed"
        />
      ) : (
        <p className="max-w-2xl rounded-lg border bg-background px-3.5 py-3 text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
      )}

      {noteOpen && (
        <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Wat moet er anders? (optioneel)"
            aria-label="Toelichting bij het wijzigingsverzoek"
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => workflow("request_changes", { note: note.trim() || undefined })}>
              {spinner("request_changes", null)}
              Versturen
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setNoteOpen(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-label="Moment van plaatsen"
            className="sm:w-60"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !publishAt} onClick={() => workflow("schedule", { publishAt: new Date(publishAt).toISOString() })}>
              {spinner("schedule", null)}
              Inplannen
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setScheduleOpen(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !dirty}
              onClick={() => {
                setActiveAction("save");
                run(() => updateSocialPost({ id: post.id, body }));
              }}
            >
              {spinner("save", null)}
              Opslaan
            </Button>
            <Button size="sm" disabled={pending || dirty} title={dirty ? "Sla eerst je wijzigingen op" : undefined} onClick={() => workflow("submit")}>
              {spinner("submit", <Send data-icon="inline-start" />)}
              Indienen ter goedkeuring
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => workflow("delete")}>
              {spinner("delete", <Trash2 data-icon="inline-start" />)}
              Verwijderen
            </Button>
          </>
        )}

        {post.status === "in_review" && (
          <>
            {canApprove && (
              <Button size="sm" disabled={pending} onClick={() => workflow("approve")}>
                {spinner("approve", <Check data-icon="inline-start" />)}
                Goedkeuren
              </Button>
            )}
            {(canReview || canApprove) && !noteOpen && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setNoteOpen(true)}>
                <Undo2 data-icon="inline-start" />
                Wijzigingen vragen
              </Button>
            )}
            {!canApprove && !canReview && <span className="text-xs text-muted-foreground">Wacht op goedkeuring door de redactie.</span>}
          </>
        )}

        {["approved", "scheduled"].includes(post.status) && (
          <>
            {canPublish && !scheduleOpen && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setScheduleOpen(true)}>
                <CalendarClock data-icon="inline-start" />
                {post.status === "scheduled" ? "Moment wijzigen" : "Inplannen"}
              </Button>
            )}
            {canPublish && (
              <Button size="sm" disabled={pending} onClick={() => workflow("publish")}>
                {spinner("publish", <Send data-icon="inline-start" />)}
                Markeer als geplaatst (gesimuleerd)
              </Button>
            )}
            {canEdit && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => workflow("reopen")}>
                {spinner("reopen", <RotateCcw data-icon="inline-start" />)}
                Heropenen als concept
              </Button>
            )}
            {!canPublish && <span className="text-xs text-muted-foreground">Goedgekeurd. Plaatsen of inplannen kan iemand met publicatierechten.</span>}
          </>
        )}

        {["approved", "scheduled", "published"].includes(post.status) && (
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy data-icon="inline-start" />
            Kopieer tekst
          </Button>
        )}
      </div>
    </article>
  );
}
