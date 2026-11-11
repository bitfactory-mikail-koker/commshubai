import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, ExternalLink, Info, Mic, OctagonAlert, Radar, TriangleAlert } from "lucide-react";
import { runBrandCheck } from "@/actions/articles";
import { ACTIVITY_SELECT, ActivityFeed, type ActivityItem } from "@/components/shared/activity-feed";
import { ActionButton } from "@/components/shared/actions";
import {
  AgentBadge,
  ClassificationBadge,
  ContentStatusBadge,
  ContentTypeLabel,
  DemoBadge,
  MetaBadge,
} from "@/components/shared/badges";
import { Field, Notice, Panel, RelevanceScore } from "@/components/shared/layout";
import { aiStatus } from "@/lib/ai";
import { can, requireSession } from "@/lib/auth";
import {
  EXTERNAL_PERMISSION_META,
  INTERVIEW_STATUS_META,
  SIGNAL_CATEGORY_META,
  SOURCE_META,
} from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { stripHtml, wordCount } from "@/lib/html-text";
import { sanitizeHtml } from "@/lib/sanitize";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { BrandCheck, BrandIssue, ExternalPermission, SourceKind, SourceRef, Stakeholder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { allowedTransitions, isLocked } from "@/lib/workflow";
import { ApprovalRound } from "@/components/redactie/approval-round";
import { ReadyPanel } from "@/components/redactie/ready-panel";
import { decidableBy, loadRound } from "@/lib/redactie/queries";
import { AgentPanel } from "./_components/agent-panel";
import { FollowUpActions } from "./_components/follow-up-actions";
import { ArticleMenu } from "./_components/article-menu";
import { EditorWorkspace } from "./_components/editor-workspace";
import { MetaPanel } from "./_components/meta-panel";
import type { ApprovalItem, CommentItem, ReviewItem, VersionItem } from "./_components/types";
import { WorkflowPanel } from "./_components/workflow-panel";

export const metadata: Metadata = { title: "Contentitem" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ARTICLE_SELECT =
  "*, agent:agents(id, kind, name, status), author:profiles!articles_author_profile_id_fkey(full_name, avatar_color), opportunity:content_opportunities!articles_opportunity_id_fkey(id, title, angle, status, stakeholders), interview:interviews!articles_interview_id_fkey(id, title, status, interviewee_name)";

const ISSUE_TYPE_LABELS: Record<BrandIssue["type"], string> = {
  word_to_avoid: "Te vermijden woord",
  terminology: "Terminologie",
  unverified_number: "Cijfer zonder bron",
  unverified_quote: "Quote zonder bron",
  open_placeholder: "Open plek",
  long_sentence: "Leesbaarheid",
  confidential: "Interne verwijzing",
};

const SEVERITY_STYLES = {
  error: { icon: OctagonAlert, className: "text-danger" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  info: { icon: Info, className: "text-info" },
} as const;

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const db = await createClient();

  const { data: article, error } = await db.from("articles").select(ARTICLE_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!article) notFound();

  const topicNeedsFinalCheck = Boolean(article.opportunity_id && article.classification === "external");
  const [versionsRes, commentsRes, approvalsRes, reviewsRes, signalsRes, profilesRes, activityRes, socialRes, interviewsRes, round, topicRes] =
    await Promise.all([
      db
        .from("content_versions")
        .select(
          "id, version, title, subtitle, body_html, change_summary, created_at, profile:profiles!content_versions_created_by_profile_id_fkey(full_name, avatar_color), agent:agents!content_versions_created_by_agent_id_fkey(kind, name)",
        )
        .eq("article_id", id)
        .order("version", { ascending: false }),
      db
        .from("comments")
        .select(
          "id, body, quote, resolved, created_at, parent_id, author_profile_id, profile:profiles!comments_author_profile_id_fkey(full_name, avatar_color), agent:agents!comments_author_agent_id_fkey(kind, name)",
        )
        .eq("entity_type", "article")
        .eq("entity_id", id)
        .order("created_at", { ascending: true }),
      db
        .from("approvals")
        .select(
          "id, version, decision, decision_note, requested_at, decided_at, requester:profiles!approvals_requested_by_profile_id_fkey(full_name, avatar_color), requesterAgent:agents!approvals_requested_by_agent_id_fkey(kind, name), decider:profiles!approvals_decided_by_fkey(full_name, avatar_color)",
        )
        .eq("entity_type", "article")
        .eq("entity_id", id)
        .order("requested_at", { ascending: false }),
      db
        .from("reviews")
        .select("id, version, recommendation, notes, created_at, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_color)")
        .eq("article_id", id)
        .order("created_at", { ascending: false }),
      db.from("article_signals").select("signal:content_signals(id, title, category, relevance_score)").eq("article_id", id),
      db.from("profiles").select("id, full_name, job_title").eq("is_active", true).order("full_name"),
      db
        .from("audit_logs")
        .select(ACTIVITY_SELECT)
        .eq("entity_type", "article")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
      db.from("social_posts").select("id", { count: "exact", head: true }).eq("article_id", id),
      db.from("interviews").select("id, title, status, interviewee_name").eq("article_id", id).order("created_at", { ascending: false }),
      loadRound(db, "article", id, article.current_version),
      topicNeedsFinalCheck
        ? db.from("content_opportunities").select("released_external_at, final_check_at").eq("id", article.opportunity_id!).maybeSingle()
        : Promise.resolve(null),
    ]);

  const versions: VersionItem[] = (versionsRes.data ?? []).map((version) => ({
    ...(version as unknown as Omit<VersionItem, "body_html" | "words">),
    body_html: sanitizeHtml(version.body_html),
    words: wordCount(version.body_html),
  }));
  const comments = (commentsRes.data ?? []) as CommentItem[];
  const approvals = (approvalsRes.data ?? []) as ApprovalItem[];
  const reviews = (reviewsRes.data ?? []) as ReviewItem[];
  const signals = (signalsRes.data ?? []).map((row) => row.signal).filter((s) => s !== null);
  const profiles = profilesRes.data ?? [];
  const activity = (activityRes.data ?? []) as unknown as ActivityItem[];

  // The item's own interview plus any interviews held for it.
  const interviews = [...(interviewsRes.data ?? [])];
  if (article.interview && !interviews.some((i) => i.id === article.interview!.id)) interviews.push(article.interview);

  const status = article.status;
  const canEdit = can(session, "content.edit", "content.create");
  // The approval round of the current version: who is asked, in which order, and what this person may decide now.
  const decidable = decidableBy(round.items, session);
  const openRound = round.items.filter((item) => item.decision === "pending");
  const finalCheckMissing = Boolean(topicRes?.data?.released_external_at && !topicRes.data.final_check_at);
  const isExternal = article.classification === "external";
  const hasBody = stripHtml(article.body_html).length >= 20;
  const sourceRefs = fromJson<SourceRef[]>(article.source_refs, []);
  const brandCheck = fromJson<BrandCheck | null>(article.brand_check, null);
  const stakeholders = fromJson<Stakeholder[]>(article.opportunity?.stakeholders, []);
  const ai = aiStatus();

  const readOnlyReason = !canEdit
    ? "Je hebt geen rechten om deze tekst te bewerken."
    : isLocked(status)
      ? "Goedgekeurde content is vergrendeld. Heropen het item als concept om de tekst te wijzigen; daarna is opnieuw goedkeuring nodig."
      : status === "in_review"
        ? "Dit item ligt ter review. Trek het in of wacht op het besluit voordat je de tekst wijzigt."
        : status === "archived"
          ? "Dit item is gearchiveerd. Heropen het als concept om verder te werken."
          : null;

  const generateBlockedReason = ["in_review", "approved", "scheduled", "published", "archived"].includes(status)
    ? "In de huidige status kan de agent geen nieuw concept schrijven. Heropen het item eerst als concept."
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-4">
        <Link
          href="/editorial"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
          Redactie
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl leading-8 font-semibold tracking-[-0.019em] text-balance">{article.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
              <ContentStatusBadge status={status} />
              <ContentTypeLabel type={article.content_type} />
              <ClassificationBadge classification={article.classification} />
              {article.is_demo && <DemoBadge />}
              <span>Versie {article.current_version}</span>
              {article.agent ? (
                <AgentBadge kind={article.agent.kind} />
              ) : (
                article.author && <span>Auteur: {article.author.full_name}</span>
              )}
              <span>Bijgewerkt {formatRelative(article.updated_at)}</span>
              {article.generation_provider === "claude" && <span>Concept gegenereerd met Claude</span>}
            </div>
          </div>
          {can(session, "content.edit") && !isLocked(status) && <ArticleMenu articleId={article.id} title={article.title} />}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-4">
          {article.generation_provider === "demo" && (
            <Notice tone="demo" title="Concept gegenereerd in demo-modus">
              Er is geen Claude API-sleutel ingesteld. Dit concept is regelgebaseerd samengesteld uit het bronmateriaal en de
              interviewantwoorden; er is niets bij verzonnen.
            </Notice>
          )}
          <EditorWorkspace
            key={`${article.current_version}:${status}`}
            article={{
              id: article.id,
              title: article.title,
              subtitle: article.subtitle,
              bodyHtml: article.body_html,
              previewHtml: sanitizeHtml(article.body_html),
              text: stripHtml(article.body_html),
              words: wordCount(article.body_html),
              status,
              version: article.current_version,
              channel: article.channel,
              contentType: article.content_type,
              classification: article.classification,
              publishAt: article.publish_at,
              publishedAt: article.published_at,
            }}
            readOnlyReason={readOnlyReason}
            versions={versions}
            comments={comments}
            currentUserId={session.userId}
            canComment={can(session, "content.view")}
            canModerate={can(session, "content.edit")}
            canRestore={can(session, "content.edit")}
            organizationName={session.organization.name}
            authorName={article.author?.full_name ?? article.agent?.name ?? session.organization.name}
          />
          <div className="grid items-start gap-6 pt-2 lg:grid-cols-2">
            <Panel title="Bronnen & signalen" description="Het materiaal waarop dit item is gebaseerd.">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Bronverwijzingen</p>
                  {sourceRefs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen bronnen gekoppeld.</p>
                  ) : (
                    <ul className="space-y-2">
                      {sourceRefs.map((ref, index) => (
                        <li key={index} className="text-sm leading-snug">
                          <span className="text-xs font-medium text-muted-foreground ">
                            {ref.source === "interview" ? "Interview" : (SOURCE_META[ref.source as SourceKind]?.label ?? ref.source)}
                          </span>
                          <span className="block">
                            {ref.interview_id ? (
                              <Link href={`/interviews/${ref.interview_id}`} className="hover:underline hover:underline-offset-2">
                                {ref.label}
                              </Link>
                            ) : ref.url ? (
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline hover:underline-offset-2"
                              >
                                {ref.label}
                                <ExternalLink className="size-3" />
                              </a>
                            ) : (
                              ref.label
                            )}
                          </span>
                          {ref.occurred_at && <span className="block text-xs text-muted-foreground">{formatDate(ref.occurred_at)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Gerelateerde signalen</p>
                  {signals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen signalen gekoppeld.</p>
                  ) : (
                    <ul className="space-y-2">
                      {signals.map((signal) => (
                        <li key={signal.id}>
                          <Link
                            href={`/inbox/${signal.id}`}
                            className="-mx-1.5 flex items-start gap-2.5 rounded-md px-1.5 py-1.5 text-sm transition-colors duration-150 outline-none hover:bg-subtle focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <Radar className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                            <span className="min-w-0 flex-1 space-y-1">
                              <span className="block leading-snug font-medium">{signal.title}</span>
                              <span className="flex flex-wrap items-center gap-2">
                                <MetaBadge meta={SIGNAL_CATEGORY_META} value={signal.category} />
                                <RelevanceScore score={signal.relevance_score} />
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {interviews.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Interviews</p>
                    <ul className="space-y-2">
                      {interviews.map((interview) => (
                        <li key={interview.id}>
                          <Link
                            href={`/interviews/${interview.id}`}
                            className="-mx-1.5 flex items-start gap-2.5 rounded-md px-1.5 py-1.5 text-sm transition-colors duration-150 outline-none hover:bg-subtle focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            <Mic className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                            <span className="min-w-0 flex-1 space-y-1">
                              <span className="block leading-snug font-medium">{interview.title}</span>
                              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                                {interview.interviewee_name}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {article.opportunity && (
                  <dl className="space-y-3 border-t pt-4">
                    <Field label="Contentkans">{article.opportunity.title}</Field>
                    {article.opportunity.angle && (
                      <Field label="Invalshoek">
                        <span className="leading-relaxed text-muted-foreground">{article.opportunity.angle}</span>
                      </Field>
                    )}
                    {stakeholders.length > 0 && (
                      <Field label="Betrokkenen">
                        <ul className="space-y-1.5">
                          {stakeholders.map((person, index) => (
                            <li key={index} className="leading-snug">
                              <span className="font-medium">{person.name}</span>
                              <span className="text-muted-foreground"> - {person.role}</span>
                              {person.reason && <span className="block text-xs text-muted-foreground">{person.reason}</span>}
                            </li>
                          ))}
                        </ul>
                      </Field>
                    )}
                    {isExternal && (
                      <Field label="Toestemming externe publicatie">
                        <MetaBadge meta={EXTERNAL_PERMISSION_META} value={article.external_permission} />
                      </Field>
                    )}
                  </dl>
                )}
              </div>
            </Panel>

            <Panel title="Geschiedenis" description="Alle wijzigingen, besluiten en agentacties op dit item." flush>
              <ActivityFeed items={activity} emptyText="Nog geen geschiedenis voor dit item." />
            </Panel>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <Panel title="Workflow & goedkeuring" description="Elke stap naar publicatie vraagt een menselijk besluit.">
            <WorkflowPanel
              key={`${status}:${article.current_version}:${article.reviewer_id}:${article.external_permission}`}
              article={{
                id: article.id,
                title: article.title,
                status,
                version: article.current_version,
                classification: article.classification,
                externalPermission: article.external_permission as ExternalPermission,
                reviewerId: article.reviewer_id,
                publishAt: article.publish_at,
                publishedAt: article.published_at,
                publicationMode: article.publication_mode,
                hasBody,
              }}
              allowed={allowedTransitions(status, session.permissions)}
              // Approving is only offered when this step is the user's to take; otherwise the round shows who it waits on.
              canApprove={can(session, "content.approve") && (status !== "in_review" || decidable.length > 0)}
              canReview={can(session, "content.review")}
              canPublish={can(session, "content.publish")}
              canSetPermission={can(session, "content.approve", "content.publish")}
              profiles={profiles}
              approvals={approvals}
              reviews={reviews}
            />
          </Panel>

          {status === "in_review" && round.items.some((item) => item.decision !== "withdrawn") && (
            <Panel
              title="Goedkeuringsronde"
              description={
                openRound.length === 0
                  ? `Versie ${article.current_version}.`
                  : decidable.length > 0
                    ? "Deze stap ligt bij jou."
                    : "Wacht op de mensen hieronder. Een citaat kan alleen de geciteerde zelf goedkeuren."
              }
              actions={
                <Link href={`/preview/article/${article.id}`} className="text-[0.8125rem] font-medium underline underline-offset-4">
                  Voorvertoning
                </Link>
              }
            >
              <ApprovalRound items={round.items} names={round.names} />
            </Panel>
          )}

          {["approved", "scheduled"].includes(status) && (
            <Panel title="Klaar voor publicatie" description="Kopieer of download de tekst, publiceer hem waar hij hoort en leg de link vast.">
              <div className="space-y-3">
                <ReadyPanel
                  type="article"
                  id={article.id}
                  text={`${article.title}\n\n${stripHtml(article.body_html)}`}
                  canMarkPublished={can(session, "content.publish")}
                  blockedReason={
                    finalCheckMissing
                      ? "Dit stuk komt van een intern onderwerp dat is vrijgegeven. Leg eerst de eindcontrole vast in de voorvertoning."
                      : isExternal && !["granted", "not_required"].includes(article.external_permission)
                        ? "De toestemming voor externe publicatie is nog niet vastgelegd."
                        : null
                  }
                />
                {isExternal && can(session, "content.create") && (
                  <FollowUpActions articleId={article.id} profiles={profiles} hasPosts={(socialRes.count ?? 0) > 0} />
                )}
                {finalCheckMissing && (
                  <Link href={`/preview/article/${article.id}`} className="block text-[0.8125rem] font-medium underline underline-offset-4">
                    Naar de eindcontrole
                  </Link>
                )}
              </div>
            </Panel>
          )}

          {status === "published" && article.published_url && (
            <Panel title="Gepubliceerd">
              <a
                href={article.published_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm break-all underline underline-offset-4"
              >
                {article.published_url}
                <ExternalLink className="size-3 shrink-0" />
              </a>
            </Panel>
          )}

          <Panel title="Agent">
            <AgentPanel
              articleId={article.id}
              agent={article.agent ? { kind: article.agent.kind, name: article.agent.name, status: article.agent.status } : null}
              isExternal={isExternal}
              hasBody={hasBody}
              hasDraft={article.current_version > 0 && hasBody}
              canGenerate={canEdit}
              generateBlockedReason={generateBlockedReason}
              canCreate={can(session, "content.create")}
              socialPostCount={socialRes.count ?? 0}
              aiIsDemo={ai.id === "demo"}
            />
          </Panel>

          <Panel
            title="Merkcontrole"
            description="Toetst de tekst aan de merkrichtlijnen en controleert of cijfers en quotes herleidbaar zijn."
          >
            <div className="space-y-4">
              {brandCheck ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl leading-none font-semibold tabular-nums tracking-tight">
                        {brandCheck.score}
                        <span className="text-base text-muted-foreground">/100</span>
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">Gecontroleerd {formatRelative(brandCheck.checked_at)}</p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        brandCheck.issues.length === 0 ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      {brandCheck.issues.length === 0 ? "Geen aandachtspunten" : `${brandCheck.issues.length} aandachtspunt(en)`}
                    </span>
                  </div>
                  {brandCheck.issues.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-success">
                      <CircleCheck className="size-4" strokeWidth={1.75} />
                      De tekst voldoet aan de richtlijnen.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {brandCheck.issues.map((issue, index) => {
                        const severity = SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.info;
                        return (
                          <li key={index} className="flex gap-2.5 text-sm">
                            <severity.icon className={cn("mt-0.5 size-4 shrink-0", severity.className)} strokeWidth={1.75} />
                            <div className="min-w-0 space-y-0.5">
                              <p className="text-xs font-medium text-muted-foreground">{ISSUE_TYPE_LABELS[issue.type] ?? issue.type}</p>
                              <p className="leading-snug">{issue.message}</p>
                              {issue.excerpt && (
                                <p className="truncate text-[0.8125rem] text-muted-foreground italic">“{issue.excerpt}”</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Voor dit item is nog geen merkcontrole uitgevoerd. De controle draait automatisch wanneer een agent een concept schrijft.
                </p>
              )}
              <ActionButton
                variant="outline"
                className="w-full"
                disabled={!hasBody}
                action={runBrandCheck.bind(null, { id: article.id })}
                pendingLabel="Controleren…"
              >
                {brandCheck ? "Opnieuw controleren" : "Merkcontrole uitvoeren"}
              </ActionButton>
            </div>
          </Panel>

          <Panel title="Eigenschappen">
            <MetaPanel
              key={article.updated_at}
              values={{
                id: article.id,
                contentType: article.content_type,
                classification: article.classification,
                channel: article.channel,
                targetAudience: article.target_audience,
                excerpt: article.excerpt,
                tags: article.tags ?? [],
                reviewerId: article.reviewer_id,
              }}
              profiles={profiles}
              canEdit={canEdit}
              classificationLocked={isLocked(status)}
            />
          </Panel>

        </aside>
      </div>
    </div>
  );
}
