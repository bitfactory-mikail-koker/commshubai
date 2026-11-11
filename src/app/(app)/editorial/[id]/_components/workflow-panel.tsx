"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  CalendarClock,
  Check,
  CircleSlash,
  MessageSquareWarning,
  Mic,
  Rocket,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  addReview,
  changeArticleStatus,
  decideArticle,
  publishArticleNow,
  scheduleArticle,
  setExternalPermission,
  submitForReview,
} from "@/actions/articles";
import { ActionButton, FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { ContentStatusBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { Notice, UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_DECISION_META, EXTERNAL_PERMISSION_META } from "@/lib/constants";
import { formatDateTime, formatDay, toDateTimeLocal } from "@/lib/format";
import type { ContentStatus, ExternalPermission } from "@/lib/types";
import { zonedInputFromNow, zonedInputToIso } from "../../_components/zoned-input";
import type { ApprovalItem, ProfileOption, ReviewItem, WorkflowArticle } from "./types";

const NONE = "none";
type Decision = "approved" | "changes_requested" | "rejected";

const DECISION_COPY: Record<Decision, { title: string; description: string; confirm: string; noteLabel: string }> = {
  approved: {
    title: "Contentitem goedkeuren",
    description: "Je keurt de huidige versie goed. Daarna kan het item worden ingepland of gepubliceerd; de tekst is dan vergrendeld.",
    confirm: "Goedkeuren",
    noteLabel: "Toelichting (optioneel)",
  },
  changes_requested: {
    title: "Wijzigingen vragen",
    description: "Het item gaat terug naar de auteur. Beschrijf concreet wat er moet veranderen.",
    confirm: "Wijzigingen vragen",
    noteLabel: "Wat moet er veranderen?",
  },
  rejected: {
    title: "Contentitem afwijzen",
    description: "Het item wordt afgewezen en gearchiveerd. Het kan later opnieuw als concept worden geopend.",
    confirm: "Afwijzen",
    noteLabel: "Reden van afwijzing",
  },
};

const REVIEW_LABELS: Record<string, { label: string; tone: "green" | "red" | "slate" }> = {
  approve: { label: "Advies: akkoord", tone: "green" },
  changes_requested: { label: "Advies: wijzigingen nodig", tone: "red" },
  comment: { label: "Opmerking", tone: "slate" },
};

function simpleLabel(from: ContentStatus, to: ContentStatus): string {
  switch (to) {
    case "draft":
      if (from === "in_review") return "Intrekken uit review";
      if (["approved", "scheduled", "changes_requested", "archived"].includes(from)) return "Heropenen als concept";
      return "Naar concept";
    case "archived":
      return "Archiveren";
    case "approved":
      return "Planning intrekken";
    case "research":
      return from === "new_signal" ? "Onderzoek starten" : "Terug naar onderzoek";
    case "interview_completed":
      return "Interview als afgerond markeren";
    default:
      return to;
  }
}

export function WorkflowPanel({
  article,
  allowed,
  canApprove,
  canReview,
  canPublish,
  canSetPermission,
  profiles,
  approvals,
  reviews,
}: {
  article: WorkflowArticle;
  /** Target statuses the user may move this item to (from lib/workflow). */
  allowed: ContentStatus[];
  canApprove: boolean;
  canReview: boolean;
  canPublish: boolean;
  canSetPermission: boolean;
  profiles: ProfileOption[];
  approvals: ApprovalItem[];
  reviews: ReviewItem[];
}) {
  const { run, pending, fieldErrors, clearErrors } = useAction();
  const { status } = article;

  const [reviewerId, setReviewerId] = useState(article.reviewerId ?? NONE);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recommendation, setRecommendation] = useState("approve");
  const [reviewNotes, setReviewNotes] = useState("");
  const [permission, setPermission] = useState<ExternalPermission>(article.externalPermission);
  const [permissionNote, setPermissionNote] = useState("");

  const isExternal = article.classification === "external";
  const permissionOk = !isExternal || ["granted", "not_required"].includes(article.externalPermission);
  const mayDecide = status === "in_review" && (canApprove || canReview);
  const pendingApproval = approvals.find((a) => a.decision === "pending" && a.version === article.version);

  // Transitions that are a plain status change (the rest have dedicated controls).
  const simple = allowed.filter((to) => {
    if (!["draft", "archived", "approved", "research", "interview_completed"].includes(to)) return false;
    if (status === "in_review" && (to === "approved" || to === "archived")) return false; // decision dialog
    return true;
  });

  const openSchedule = () => {
    const future = article.publishAt && new Date(article.publishAt) > new Date();
    setWhen(future ? toDateTimeLocal(article.publishAt) : zonedInputFromNow(1, 9));
    setScheduleOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Current state */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ContentStatusBadge status={status} />
          <span className="text-xs text-muted-foreground">Versie {article.version}</span>
        </div>
        {status === "scheduled" && article.publishAt && (
          <p className="text-sm">
            Publicatie gepland op <span className="font-medium">{formatDateTime(article.publishAt)}</span>.
          </p>
        )}
        {status === "published" && (
          <p className="text-sm text-muted-foreground">
            Gepubliceerd op {formatDateTime(article.publishedAt)}
            {article.publicationMode === "simulated" && " - gesimuleerd: er was geen publicatiekanaal verbonden."}
            {article.publicationMode === "cms" && " via het CMS."}
          </p>
        )}
        {status === "in_review" && pendingApproval && (
          <p className="text-sm text-muted-foreground">
            Ingediend door {pendingApproval.requester?.full_name ?? pendingApproval.requesterAgent?.name ?? "onbekend"},{" "}
            {formatDay(pendingApproval.requested_at)}. Wacht op een besluit.
          </p>
        )}
      </div>

      {/* Permission for external publication */}
      {isExternal && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.8125rem] font-medium">Toestemming externe publicatie</p>
            <MetaBadge meta={EXTERNAL_PERMISSION_META} value={article.externalPermission} />
          </div>
          {!permissionOk && (
            <Notice tone="warning" icon={ShieldAlert}>
              Inplannen en publiceren is geblokkeerd totdat de toestemming is verleend of als niet vereist is gemarkeerd. Een agent kan
              dit nooit zelf bevestigen.
            </Notice>
          )}
          {canSetPermission && !["scheduled", "published"].includes(status) && (
            <form
              className="space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => setExternalPermission({ id: article.id, permission, note: permissionNote.trim() || undefined }), {
                  onSuccess: () => setPermissionNote(""),
                });
              }}
            >
              <Select value={permission} onValueChange={(v) => setPermission(v as ExternalPermission)}>
                <SelectTrigger className="w-full" aria-label="Status van de toestemming">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EXTERNAL_PERMISSION_META) as ExternalPermission[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {EXTERNAL_PERMISSION_META[key].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={permissionNote}
                onChange={(e) => setPermissionNote(e.target.value)}
                placeholder="Toelichting, bijv. akkoord per e-mail van …"
                aria-label="Toelichting bij de toestemming"
                maxLength={300}
              />
              <SubmitButton pending={pending} variant="outline" size="sm" disabled={permission === article.externalPermission}>
                <ShieldCheck />
                Toestemming vastleggen
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {/* Next steps */}
      <div className="space-y-2.5">
        <p className="text-[0.8125rem] font-medium">Volgende stap</p>

        {allowed.includes("in_review") && (
          <div className="space-y-2.5">
            <FormField label="Reviewer" htmlFor="reviewer-select" help="Optioneel. Iedereen met goedkeuringsrecht kan beslissen.">
              <Select value={reviewerId} onValueChange={setReviewerId}>
                <SelectTrigger id="reviewer-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Geen specifieke reviewer</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                      {p.job_title ? ` - ${p.job_title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <ActionButton
              className="w-full"
              disabled={!article.hasBody}
              action={() => submitForReview({ id: article.id, reviewerId: reviewerId === NONE ? null : reviewerId })}
            >
              <Send />
              Indienen ter review
            </ActionButton>
            {!article.hasBody && <p className="text-xs text-muted-foreground">Het item heeft nog geen tekst om te beoordelen.</p>}
          </div>
        )}

        {mayDecide && (
          <div className="space-y-2">
            {canApprove && (
              <Button className="w-full" onClick={() => setDecision("approved")}>
                <Check />
                Goedkeuren
              </Button>
            )}
            <div className={cn("grid gap-2", canApprove && "grid-cols-2")}>
              <Button variant="outline" onClick={() => setDecision("changes_requested")}>
                <MessageSquareWarning />
                Wijzigingen vragen
              </Button>
              {canApprove && (
                <Button variant="outline" className="text-danger hover:text-danger" onClick={() => setDecision("rejected")}>
                  <CircleSlash />
                  Afwijzen
                </Button>
              )}
            </div>
            <Button variant="link" size="sm" className="h-6 px-0 text-muted-foreground" onClick={() => setReviewOpen(true)}>
              Alleen een reviewadvies geven
            </Button>
          </div>
        )}

        {(allowed.includes("scheduled") || (status === "scheduled" && canPublish)) && (
          <Button className="w-full" variant={status === "scheduled" ? "outline" : "default"} disabled={!permissionOk} onClick={openSchedule}>
            <CalendarClock />
            {status === "scheduled" ? "Publicatiemoment wijzigen" : "Publicatie inplannen"}
          </Button>
        )}

        {allowed.includes("published") && (
          <ActionButton
            className="w-full"
            variant="outline"
            disabled={!permissionOk}
            action={() => publishArticleNow({ id: article.id })}
            pendingLabel="Publiceren…"
            confirm={{
              title: "Nu publiceren?",
              description: isExternal
                ? "Het artikel gaat naar het CMS als die koppeling verbonden is. Zonder verbonden CMS wordt de publicatie gesimuleerd: het item wordt alleen in de hub als gepubliceerd vastgelegd."
                : "Interne content wordt in de hub als gepubliceerd gemarkeerd. Plaatsen in Slack of e-mail doe je zelf; de hub verstuurt niets.",
              confirmLabel: "Publiceren",
            }}
          >
            <Rocket />
            Nu publiceren
          </ActionButton>
        )}

        {allowed.includes("interview_requested") && (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/interviews?nieuw=1&artikel=${article.id}`}>
              <Mic />
              Interview aanvragen
            </Link>
          </Button>
        )}

        {simple.map((to) => {
          const label = simpleLabel(status, to);
          const reopening = to === "draft" && ["approved", "scheduled"].includes(status);
          return (
            <ActionButton
              key={to}
              {...(to === "draft" && ["new_signal", "research", "interview_requested", "interview_completed", "archived"].includes(status)
                ? { className: "w-full", variant: "default" as const }
                : { className: "h-6 justify-start px-0 text-muted-foreground", variant: "link" as const, size: "sm" as const })}
              action={() => changeArticleStatus({ id: article.id, status: to })}
              confirm={
                reopening
                  ? {
                      title: "Heropenen als concept?",
                      description:
                        "De goedkeuring geldt alleen voor de huidige versie. Na heropenen vervalt de planning en is voor een gewijzigde tekst opnieuw goedkeuring nodig.",
                      confirmLabel: "Heropenen",
                    }
                  : to === "archived"
                    ? {
                        title: "Contentitem archiveren?",
                        description: "Het item verdwijnt uit de werkvoorraad. Je kunt het later opnieuw als concept openen.",
                        confirmLabel: "Archiveren",
                      }
                    : undefined
              }
            >
              {to === "archived" ? <Archive /> : to === "approved" ? <Undo2 /> : to === "draft" ? <RotateCcw /> : null}
              {label}
            </ActionButton>
          );
        })}

        {allowed.length === 0 && !mayDecide && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {status === "in_review"
              ? "Dit item wacht op een besluit van iemand met goedkeuringsrecht."
              : "Je hebt geen rechten om de status van dit item te wijzigen."}
          </p>
        )}
      </div>

      {/* History */}
      {(approvals.length > 0 || reviews.length > 0) && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-[0.8125rem] font-medium">Goedkeuringen en reviews</p>
          <ul className="space-y-3">
            {approvals.map((a) => (
              <li key={a.id} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <MetaBadge meta={APPROVAL_DECISION_META} value={a.decision} />
                  <span className="text-xs text-muted-foreground">Versie {a.version}</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Aangevraagd door {a.requester?.full_name ?? a.requesterAgent?.name ?? "onbekend"} · {formatDay(a.requested_at)}
                  {a.decided_at && (
                    <>
                      <br />
                      Besluit door {a.decider?.full_name ?? "onbekend"} · {formatDay(a.decided_at)}
                    </>
                  )}
                </p>
                {a.decision_note && <p className="rounded-md bg-muted px-2.5 py-1.5 text-[0.8125rem] whitespace-pre-line">{a.decision_note}</p>}
              </li>
            ))}
            {reviews.map((r) => {
              const meta = REVIEW_LABELS[r.recommendation] ?? REVIEW_LABELS.comment;
              return (
                <li key={r.id} className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                    <span className="text-xs text-muted-foreground">Versie {r.version}</span>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserAvatar name={r.reviewer?.full_name} color={r.reviewer?.avatar_color} size="sm" />
                    {r.reviewer?.full_name ?? "Onbekend"} · {formatDay(r.created_at)}
                  </p>
                  {r.notes && <p className="rounded-md bg-muted px-2.5 py-1.5 text-[0.8125rem] whitespace-pre-line">{r.notes}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Decision dialog */}
      <Dialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDecision(null);
            setNote("");
            clearErrors();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {decision && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => decideArticle({ id: article.id, decision, note: note.trim() || undefined }), {
                  onSuccess: () => {
                    setDecision(null);
                    setNote("");
                  },
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>{DECISION_COPY[decision].title}</DialogTitle>
                <DialogDescription>{DECISION_COPY[decision].description}</DialogDescription>
              </DialogHeader>
              <FormField
                label={DECISION_COPY[decision].noteLabel}
                htmlFor="decision-note"
                error={fieldErrors.note}
                required={decision !== "approved"}
              >
                <Textarea
                  id="decision-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  required={decision !== "approved"}
                  autoFocus
                />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDecision(null)} disabled={pending}>
                  Annuleren
                </Button>
                <SubmitButton pending={pending} variant={decision === "rejected" ? "destructive" : "default"}>
                  {DECISION_COPY[decision].confirm}
                </SubmitButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              // The input holds a wall-clock time in the app timezone; send an absolute timestamp.
              run(() => scheduleArticle({ id: article.id, publishAt: zonedInputToIso(when) }), {
                onSuccess: () => setScheduleOpen(false),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Publicatie inplannen</DialogTitle>
              <DialogDescription>
                Op het gekozen moment wordt het goedgekeurde item automatisch gepubliceerd
                {isExternal ? " (via het CMS als dat verbonden is, anders gesimuleerd)" : ""}. Het moment komt op de contentkalender te staan.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Datum en tijd" htmlFor="publish-at" help="Nederlandse tijd (Europe/Amsterdam)." required>
              <Input id="publish-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Inplannen</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Review advice dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addReview({ id: article.id, recommendation, notes: reviewNotes }), {
                onSuccess: () => {
                  setReviewOpen(false);
                  setReviewNotes("");
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Reviewadvies geven</DialogTitle>
              <DialogDescription>
                Je legt een advies vast bij versie {article.version}. Het advies verandert de status niet; het besluit blijft bij iemand met
                goedkeuringsrecht.
              </DialogDescription>
            </DialogHeader>
            <FormField label="Advies" htmlFor="review-recommendation">
              <Select value={recommendation} onValueChange={setRecommendation}>
                <SelectTrigger id="review-recommendation" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Akkoord</SelectItem>
                  <SelectItem value="changes_requested">Wijzigingen nodig</SelectItem>
                  <SelectItem value="comment">Alleen een opmerking</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Toelichting" htmlFor="review-notes" required>
              <Textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={4}
                minLength={3}
                maxLength={2000}
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReviewOpen(false)} disabled={pending}>
                Annuleren
              </Button>
              <SubmitButton pending={pending}>Advies vastleggen</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
