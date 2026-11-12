import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, FileSearch, ShieldAlert } from "lucide-react";
import { ApprovalRound } from "@/components/redactie/approval-round";
import { ReadyPanel } from "@/components/redactie/ready-panel";
import { ClassificationBadge, ContentStatusBadge, ContentTypeLabel, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { FilterTabs, Notice, Panel } from "@/components/shared/layout";
import { can, requireSession, type SessionContext } from "@/lib/auth";
import { NEWSLETTER_STATUS_META, SOCIAL_STATUS_META } from "@/lib/constants";
import { stripHtml } from "@/lib/html-text";
import { fromJson } from "@/lib/json";
import { diffHtml, hasChanges } from "@/lib/redactie/diff";
import { decidableBy, loadRound, profileNames, type QueueItem } from "@/lib/redactie/queries";
import { highlightQuotes } from "@/lib/redactie/quotes";
import { blocksOf, sentencesOf, traceBlocks, type SourceText } from "@/lib/redactie/sources";
import { sanitizeHtml } from "@/lib/sanitize";
import { createClient, type UserClient } from "@/lib/supabase/server";
import type { ApprovalEntity, SourceRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DecisionPanel, type DecisionItem } from "./_components/decision-panel";
import { FinalCheck } from "./_components/final-check";
import { PassageActions } from "./_components/passage-actions";
import { groupBy } from "@/lib/concurrency";
import { markPlaceholders } from "@/lib/placeholders";

export const metadata: Metadata = { title: "Voorvertoning" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ["article", "newsletter", "social_post"] as const;
const READY = ["approved", "scheduled"];

/** One request per person per step: an editor never gives two approvals in the same step. */
function toDecisionItems(items: QueueItem[], session: SessionContext): DecisionItem[] {
  const seenSteps = new Set<number>();
  const out: DecisionItem[] = [];
  for (const item of items) {
    const own = item.eligible_profile_ids.includes(session.userId);
    if (item.kind === "piece" && !own) {
      if (seenSteps.has(item.step)) continue;
      seenSteps.add(item.step);
    }
    out.push({ id: item.id, kind: item.kind as DecisionItem["kind"], label: item.step_label ?? "", quote: item.quote_text, own });
  }
  return out;
}

/** Source material an editor may see for this piece, for tracing paragraphs. */
async function loadSources(db: UserClient, article: { id: string; source_refs: unknown; interview_id: string | null }): Promise<SourceText[]> {
  const refs = fromJson<SourceRef[]>(article.source_refs as never, []);
  const messageIds = refs.map((r) => r.source_message_id).filter((id): id is string => Boolean(id));
  const [messagesRes, interviewsRes] = await Promise.all([
    messageIds.length > 0
      ? db.from("source_messages").select("id, title, body, channel_id").in("id", messageIds)
      : Promise.resolve({ data: [] }),
    db
      .from("interviews")
      .select("id, interviewee_name, classification")
      .or(`article_id.eq.${article.id}${article.interview_id ? `,id.eq.${article.interview_id}` : ""}`),
  ]);
  const messages = messagesRes.data ?? [];
  const interviews = interviewsRes.data ?? [];
  const channelIds = Array.from(new Set(messages.map((m) => m.channel_id).filter((id): id is string => Boolean(id))));

  const [channelsRes, answersRes] = await Promise.all([
    channelIds.length > 0 ? db.from("channels").select("id, confidentiality").in("id", channelIds) : Promise.resolve({ data: [] }),
    interviews.length > 0
      ? db
          .from("interview_messages")
          .select("interview_id, content")
          .in(
            "interview_id",
            interviews.map((interview) => interview.id),
          )
          .eq("role", "interviewee")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const internal = new Set((channelsRes.data ?? []).filter((c) => c.confidentiality === "internal_only").map((c) => c.id));
  const answersByInterview = groupBy(answersRes.data ?? [], (answer) => answer.interview_id);

  const sources: SourceText[] = messages.map((message) => ({
    label: refs.find((r) => r.source_message_id === message.id)?.label ?? "Bronbericht",
    text: `${message.title ?? ""} ${message.body}`,
    internalOnly: Boolean(message.channel_id && internal.has(message.channel_id)),
  }));
  for (const interview of interviews) {
    const answers = answersByInterview.get(interview.id) ?? [];
    if (answers.length > 0) {
      sources.push({
        label: `Interview met ${interview.interviewee_name}`,
        text: answers.map((a) => a.content).join(" "),
        internalOnly: interview.classification === "internal",
      });
    }
  }
  return sources;
}

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { type, id } = await params;
  const query = await searchParams;
  if (!TYPES.includes(type as (typeof TYPES)[number]) || !UUID.test(id)) notFound();
  const entityType = type as ApprovalEntity;
  const db = await createClient();
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");

  // --- The item itself (RLS: the editors, and the people involved in it) -------
  let title = "";
  let version = 1;
  let status = "";
  let bodyHtml = "";
  let plainText = "";
  let header: React.ReactNode = null;
  let main: React.ReactNode = null;
  let editHref: string | null = null;
  let sources: SourceText[] = [];
  let finalCheck: { needed: boolean; done: boolean; releasedBy: string | null; reason: string | null; checkedBy: string | null } | null = null;
  let externalBlocked: string | null = null;
  let writtenFor: string | null = null;
  let publishedUrl: string | null = null;

  const round = async (v: number) => loadRound(db, entityType, id, v);

  if (entityType === "article") {
    const { data: article } = await db
      .from("articles")
      .select(
        "id, title, subtitle, body_html, status, current_version, content_type, classification, source_refs, interview_id, opportunity_id, external_permission, published_url",
      )
      .eq("id", id)
      .maybeSingle();
    if (!article) notFound();
    title = article.title;
    version = article.current_version;
    status = article.status;
    bodyHtml = sanitizeHtml(article.body_html);
    plainText = `${article.title}\n\n${stripHtml(bodyHtml)}`;
    editHref = editorial ? `/editorial/${article.id}` : null;
    publishedUrl = article.published_url;
    header = (
      <>
        <ContentStatusBadge status={article.status} />
        <ContentTypeLabel type={article.content_type} />
        <ClassificationBadge classification={article.classification} />
        <span>Versie {article.current_version}</span>
      </>
    );
    if (article.classification === "external" && !["granted", "not_required"].includes(article.external_permission)) {
      externalBlocked = "De toestemming voor externe publicatie is nog niet vastgelegd.";
    }
    if (editorial) sources = await loadSources(db, article);
    if (editorial && article.opportunity_id) {
      const { data: topic } = await db
        .from("content_opportunities")
        .select("released_external_at, released_external_by, release_reason, final_check_at, final_check_by")
        .eq("id", article.opportunity_id)
        .maybeSingle();
      if (topic?.released_external_at && article.classification === "external") {
        const names = await profileNames(db, [topic.released_external_by, topic.final_check_by]);
        finalCheck = {
          needed: true,
          done: Boolean(topic.final_check_at),
          releasedBy: topic.released_external_by ? (names[topic.released_external_by] ?? null) : null,
          reason: topic.release_reason,
          checkedBy: topic.final_check_by ? (names[topic.final_check_by] ?? null) : null,
        };
      }
    }
  } else if (entityType === "newsletter") {
    const { data: edition } = await db
      .from("newsletters")
      .select("id, title, subject, intro_html, outro_html, status, current_version, kind, edition_type")
      .eq("id", id)
      .maybeSingle();
    if (!edition) notFound();
    title = edition.title;
    version = edition.current_version;
    status = edition.status;
    editHref = editorial ? `/newsletters/${edition.id}` : null;
    header = (
      <>
        <MetaBadge meta={NEWSLETTER_STATUS_META} value={edition.status} />
        <span>{edition.edition_type === "md_update" ? "MD-update" : edition.kind === "external" ? "Externe nieuwsbrief" : "Interne nieuwsbrief"}</span>
        <span>Versie {edition.current_version}</span>
      </>
    );
    const { data: items } = await db
      .from("newsletter_items")
      .select("id, section, custom_title, custom_summary, contributor_profile_id, position, article:articles(title, excerpt)")
      .eq("newsletter_id", id)
      .eq("included", true)
      .order("position", { ascending: true });
    const { items: roundItems } = await round(version);
    const mine = decidableBy(roundItems, session);
    const sections: { name: string; rows: NonNullable<typeof items> }[] = [];
    for (const item of items ?? []) {
      const group = sections.find((s) => s.name === item.section);
      if (group) group.rows.push(item);
      else sections.push({ name: item.section, rows: [item] });
    }
    plainText = [
      edition.subject ?? edition.title,
      stripHtml(edition.intro_html),
      ...sections.flatMap((s) => [s.name, ...s.rows.map((r) => `${r.custom_title ?? r.article?.title ?? ""}\n${r.custom_summary ?? r.article?.excerpt ?? ""}`)]),
      stripHtml(edition.outro_html),
    ]
      .filter(Boolean)
      .join("\n\n");
    main = (
      <div className="space-y-6">
        {edition.intro_html && <div className="prose-editorial" dangerouslySetInnerHTML={{ __html: sanitizeHtml(edition.intro_html) }} />}
        {sections.map((section) => (
          <section key={section.name} className="space-y-2">
            <h2 className="text-[0.9375rem] font-semibold">{section.name}</h2>
            <ul className="divide-y rounded-lg border">
              {section.rows.map((row) => {
                const request = mine.find((m) => m.item_id === row.id);
                const isMine = row.contributor_profile_id === session.userId;
                return (
                  <li key={row.id} className={cn("space-y-2 px-4 py-3", isMine && "bg-warning-soft/40")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{row.custom_title ?? row.article?.title}</p>
                      {isMine && <ToneBadge tone="amber">Op basis van jouw antwoorden</ToneBadge>}
                    </div>
                    <p className="max-w-[68ch] text-sm leading-relaxed text-foreground/85">{row.custom_summary ?? row.article?.excerpt}</p>
                    {request && <PassageActions approvalId={request.id} />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {edition.outro_html && <div className="prose-editorial" dangerouslySetInnerHTML={{ __html: sanitizeHtml(edition.outro_html) }} />}
      </div>
    );
  } else {
    const { data: post } = await db
      .from("social_posts")
      .select("id, body, platform, status, current_version, variant, written_for_profile_id, published_url, article:articles(id, title)")
      .eq("id", id)
      .maybeSingle();
    if (!post) notFound();
    title = `${post.platform === "linkedin" ? "LinkedIn-post" : `Post voor ${post.platform}`}${post.article ? ` bij “${post.article.title}”` : ""}`;
    version = post.current_version;
    status = post.status;
    plainText = post.body;
    writtenFor = post.written_for_profile_id;
    publishedUrl = post.published_url;
    editHref = editorial && post.article ? `/editorial/${post.article.id}` : null;
    header = (
      <>
        <MetaBadge meta={SOCIAL_STATUS_META} value={post.status} />
        {post.variant && <span>Variant: {post.variant}</span>}
        {post.written_for_profile_id === session.userId && <span>Geschreven op jouw naam</span>}
        <span>Versie {post.current_version}</span>
      </>
    );
    main = (
      <div className="max-w-[60ch] rounded-lg border bg-card px-4 py-3.5 text-[0.9375rem] leading-relaxed whitespace-pre-line">{post.body}</div>
    );
  }

  // --- The round, and what is asked of this person -----------------------------
  const { items: roundItems, names } = await round(version);
  const decidable = decidableBy(roundItems, session);
  const decisionItems = toDecisionItems(
    // Passages are decided in place, next to the passage itself.
    decidable.filter((item) => item.kind !== "passage"),
    session,
  );
  const ownQuotes = roundItems
    .filter((item) => item.kind === "quote" && item.eligible_profile_ids.includes(session.userId) && item.quote_text)
    .map((item) => item.quote_text as string);

  // People who already looked at an earlier version get the changes first.
  // The version this person last looked at (approved, or asked to change): they see the changes since then.
  let baseVersion: number | null = null;
  if (entityType === "article" && decidable.length > 0 && version > 1) {
    const { data: seen } = await db
      .from("approvals")
      .select("version")
      .eq("entity_type", entityType)
      .eq("entity_id", id)
      .eq("decided_by", session.userId)
      .in("decision", ["approved", "changes_requested", "rejected"])
      .lt("version", version)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    baseVersion = seen?.version ?? null;
  }
  let diff: ReturnType<typeof diffHtml> | null = null;
  if (entityType === "article" && baseVersion !== null && baseVersion < version) {
    const { data: base } = await db.from("content_versions").select("body_html").eq("article_id", id).eq("version", baseVersion).maybeSingle();
    if (base) {
      const parts = diffHtml(sanitizeHtml(base.body_html), bodyHtml);
      if (hasChanges(parts)) diff = parts;
    }
  }
  const view = query.toon === "alles" || !diff ? "alles" : "wijzigingen";

  if (entityType === "article") {
    const marked = markPlaceholders(highlightQuotes(bodyHtml, ownQuotes));
    main = (
      <div className="space-y-4">
        {diff && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs
              active={view}
              items={[
                { key: "wijzigingen", label: `Wijzigingen sinds versie ${baseVersion}`, href: `/preview/article/${id}` },
                { key: "alles", label: "Hele tekst", href: `/preview/article/${id}?toon=alles` },
              ]}
            />
          </div>
        )}
        {view === "wijzigingen" && diff ? (
          <div className="prose-editorial whitespace-pre-line">
            {diff.map((part, index) =>
              part.type === "same" ? (
                <span key={index}>{part.text}</span>
              ) : part.type === "added" ? (
                <ins key={index} className="diff-added">
                  {part.text}
                </ins>
              ) : (
                <del key={index} className="diff-removed">
                  {part.text}
                </del>
              ),
            )}
          </div>
        ) : (
          <div className="prose-editorial" dangerouslySetInnerHTML={{ __html: marked }} />
        )}
      </div>
    );
  }

  const traced = entityType === "article" && editorial && sources.length > 0 ? traceBlocks(blocksOf(bodyHtml), sources) : [];
  const checkSentences =
    finalCheck?.needed && !finalCheck.done ? traceBlocks(sentencesOf(bodyHtml), sources.filter((s) => s.internalOnly)) : [];

  const isReady = READY.includes(status);
  const canPlace = entityType === "social_post" ? writtenFor === session.userId || can(session, "content.publish") : can(session, "content.publish");
  const readyBlocked = finalCheck?.needed && !finalCheck.done ? "Leg eerst de eindcontrole vast." : externalBlocked;
  const waitingOn = roundItems.filter((item) => item.decision === "pending" && !decidable.includes(item));

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link
          href="/for-me"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
          Voor mij
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl leading-8 font-semibold tracking-[-0.019em] text-balance">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">{header}</div>
          </div>
          {editHref && (
            <Link href={editHref} className="shrink-0 text-sm font-medium underline underline-offset-4 hover:text-foreground sm:pt-1.5">
              Openen in de redactie
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-6">
          {ownQuotes.length > 0 && view === "alles" && (
            <Notice tone="info">Jouw citaten zijn in de tekst gemarkeerd. Alleen jij kunt ze goedkeuren.</Notice>
          )}
          {main}

          {finalCheck?.needed && (
            <Panel
              title="Eindcontrole: intern onderwerp, extern stuk"
              description={`Vrijgegeven voor extern gebruik${finalCheck.releasedBy ? ` door ${finalCheck.releasedBy}` : ""}${finalCheck.reason ? `: ${finalCheck.reason}` : "."}`}
            >
              {finalCheck.done ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CircleCheck className="size-4" strokeWidth={1.75} />
                  Eindcontrole vastgelegd{finalCheck.checkedBy ? ` door ${finalCheck.checkedBy}` : ""}.
                </p>
              ) : can(session, "content.approve") ? (
                <div className="space-y-3">
                  <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                    Loop de tekst zin voor zin na. Zinnen die op een interne bron steunen zijn gemarkeerd. Zonder vastgelegde eindcontrole
                    kan dit stuk niet als gepubliceerd worden afgevinkt.
                  </p>
                  <FinalCheck articleId={id} sentences={checkSentences} />
                </div>
              ) : (
                <Notice tone="warning" icon={ShieldAlert}>
                  Iemand met goedkeuringsrecht moet de eindcontrole nog vastleggen.
                </Notice>
              )}
            </Panel>
          )}

          {traced.length > 0 && (
            <details className="group rounded-lg border">
              <summary className="flex items-center gap-2 px-4 py-2.5 text-[0.8125rem] font-medium outline-none hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring">
                <FileSearch className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Bronnen per alinea
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {traced.filter((block) => block.sources.length === 0).length} zonder herkende bron
                </span>
              </summary>
              <ul className="divide-y border-t">
                {traced.map((block, index) => (
                  <li key={index} className="grid gap-x-6 gap-y-1 px-4 py-2.5 text-[0.8125rem] leading-relaxed md:grid-cols-[minmax(0,1fr)_16rem]">
                    <p className="line-clamp-3 text-foreground/85">{block.text}</p>
                    <p className={cn("text-xs", block.sources.length ? "text-muted-foreground" : "font-medium text-warning")}>
                      {block.sources.length ? block.sources.join(" · ") : "Geen bron herkend: graag bevestigen"}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <aside className="space-y-5">
          {decisionItems.length > 0 && (
            <Panel
              title="Jouw akkoord"
              description={
                decisionItems.some((item) => item.own)
                  ? "Er gaat niets naar buiten zonder dit akkoord."
                  : "Je beslist hier namens de redactie."
              }
            >
              <DecisionPanel
                key={`${version}:${decisionItems.map((item) => item.id).join(",")}`}
                items={decisionItems}
                editable={entityType === "article"}
                title={title}
                bodyHtml={bodyHtml}
                rewriteNote={
                  entityType === "article"
                    ? "De bot past de tekst aan en jij krijgt de nieuwe versie te zien. Lukt dat niet, dan gaat je verzoek naar de redactie."
                    : "Je verzoek gaat naar de redactie."
                }
              />
            </Panel>
          )}

          {decisionItems.length === 0 && status === "in_review" && waitingOn.length > 0 && (
            <Notice tone="info">
              Hier wordt nu niets van jou gevraagd. Het stuk wacht op{" "}
              {Array.from(new Set(waitingOn.flatMap((item) => (item.eligible_profile_ids.length ? item.eligible_profile_ids.map((p) => names[p] ?? "een collega") : ["de redactie"])))).join(", ")}.
            </Notice>
          )}

          {isReady && (
            <Panel title="Klaar voor publicatie" description="Alle akkoorden zijn binnen. Publiceren doet een mens; het systeem plaatst niets zelf.">
              <ReadyPanel
                type={entityType}
                id={id}
                text={plainText}
                canMarkPublished={canPlace}
                blockedReason={readyBlocked}
                publishedLabel={entityType === "social_post" ? "Geplaatst" : "Gepubliceerd"}
              />
            </Panel>
          )}

          {["published", "sent"].includes(status) && (
            <Notice tone="success" icon={CircleCheck} title={entityType === "newsletter" ? "Verzonden" : "Gepubliceerd"}>
              {publishedUrl ? (
                <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
                  {publishedUrl}
                </a>
              ) : (
                "Er is geen link vastgelegd."
              )}
            </Notice>
          )}

          {roundItems.some((item) => item.decision !== "withdrawn") && (
            <Panel title="Goedkeuring" description={`Versie ${version}. Wie akkoord geeft wordt vastgelegd.`}>
              <ApprovalRound items={roundItems} names={names} />
            </Panel>
          )}

          {roundItems.length === 0 && !isReady && status !== "published" && status !== "sent" && (
            <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
              Dit {entityType === "article" ? "stuk" : entityType === "newsletter" ? "is een editie die" : "is een post die"} nog niet ter
              goedkeuring is voorgelegd.
            </p>
          )}

          {entityType === "article" && diff && view === "wijzigingen" && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Groen is toegevoegd en doorgestreept is verwijderd, vergeleken met versie {baseVersion}, de versie die jij eerder zag.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
