import Link from "next/link";
import { ArrowUpRight, CornerDownRight, Lock, ShieldAlert } from "lucide-react";
import { AgentBadge, ClassificationBadge, ContentStatusBadge, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { can, getSession } from "@/lib/auth";
import { CONTENT_TYPE_LABELS, EXTERNAL_PERMISSION_META, OPPORTUNITY_STATUS_META, ORIGIN_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { fromJson } from "@/lib/json";
import type { AgentKind, ContentStatus, Opportunity, Stakeholder } from "@/lib/types";
import { loadTopicLookups, suggestedInterviewees } from "../inbox/_components/topic-data";
import { TopicDecisions } from "../inbox/_components/topic-decisions";

/** Select string for opportunities shown with <OpportunityCard>. */
export const OPPORTUNITY_SELECT =
  "*, agent:agents!content_opportunities_assigned_agent_id_fkey(kind, name), referrer:agents!content_opportunities_referred_by_agent_id_fkey(kind, name), article:articles!content_opportunities_article_id_fkey(id, title, status), signal:content_signals!content_opportunities_signal_id_fkey(id, title, relevance_score, summary, score_rationale, emoji)";

export type OpportunityWithRelations = Opportunity & {
  agent: { kind: AgentKind; name: string } | null;
  referrer: { kind: AgentKind; name: string } | null;
  article: { id: string; title: string; status: ContentStatus } | null;
  signal: {
    id: string;
    title: string;
    relevance_score: number;
    summary?: string | null;
    score_rationale?: string | null;
    emoji?: string | null;
  } | null;
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-[0.8125rem] leading-5">{children}</dd>
    </div>
  );
}

/**
 * A proposal as the editors judge it: what it is, why it is news, where it
 * came from, who would be interviewed, and the decisions that can be taken.
 * Used in the inbox, on the bureau pages and on a signal.
 */
export async function OpportunityCard({
  opportunity,
  canManage,
  showSignal = false,
  showAgent = true,
}: {
  opportunity: OpportunityWithRelations;
  canManage: boolean;
  /** Link back to the signal this proposal came from. */
  showSignal?: boolean;
  showAgent?: boolean;
}) {
  const [session, lookups] = await Promise.all([getSession(), loadTopicLookups()]);
  const canRelease = session ? can(session, "content.approve") : false;

  const stakeholders = fromJson<Stakeholder[]>(opportunity.stakeholders, []);
  const needsPermission =
    opportunity.classification === "external" && !["granted", "not_required"].includes(opportunity.external_permission);
  const released = Boolean(opportunity.released_external_at);
  const blocked = opportunity.classification === "external" && opportunity.internal_only && !released;
  const open = ["proposed", "snoozed"].includes(opportunity.status) && !opportunity.article;
  const project = opportunity.project_id ? lookups.projectById.get(opportunity.project_id) : null;
  const suggested = suggestedInterviewees(opportunity, lookups)
    .map((id) => lookups.personById.get(id))
    .filter((p) => p !== undefined);
  const why = opportunity.signal?.score_rationale?.trim() || opportunity.signal?.summary?.trim() || null;
  const releasedBy = opportunity.released_external_by ? lookups.personById.get(opportunity.released_external_by)?.name : null;

  return (
    <article className="min-w-0 space-y-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium">{opportunity.title}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MetaBadge meta={OPPORTUNITY_STATUS_META} value={opportunity.status} />
            <span className="text-xs font-medium text-muted-foreground">{CONTENT_TYPE_LABELS[opportunity.suggested_content_type]}</span>
            <ClassificationBadge classification={opportunity.classification} />
            {opportunity.internal_only && !released && (
              <span
                className="inline-flex h-5 shrink-0 items-center gap-1 rounded-xs border px-1.5 text-xs leading-none font-medium whitespace-nowrap text-muted-foreground"
                title="Dit onderwerp komt uit een interne bron en gaat niet naar buiten zonder vrijgave door een redacteur."
              >
                <Lock className="size-3" strokeWidth={1.75} />
                Alleen intern
              </span>
            )}
            {opportunity.is_demo && <DemoBadge />}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {showAgent && opportunity.agent && <AgentBadge kind={opportunity.agent.kind} />}
          <span title="Prioriteit volgens de bot (0-100)">
            Prioriteit <span className="font-semibold text-foreground tabular-nums">{opportunity.priority}</span>
          </span>
        </div>
      </div>

      {opportunity.angle && <p className="max-w-3xl text-[0.8125rem] leading-relaxed text-muted-foreground">{opportunity.angle}</p>}

      <dl className="max-w-3xl space-y-1">
        {why && <Fact label="Waarom nieuws">{why}</Fact>}
        <Fact label="Herkomst">
          {opportunity.signal?.emoji && <span className="mr-1.5">{opportunity.signal.emoji}</span>}
          {ORIGIN_LABELS[opportunity.origin] ?? opportunity.origin}
          {opportunity.referrer && opportunity.origin !== "referral" && (
            <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
              <CornerDownRight className="size-3.5" strokeWidth={1.75} />
              via de {opportunity.referrer.name}
            </span>
          )}
        </Fact>
        {project && (
          <Fact label="Project">
            {project.name}
            {project.status === "proposed" && <span className="text-muted-foreground"> (voorgesteld door de bot, nog niet bevestigd)</span>}
          </Fact>
        )}
        {open && opportunity.suggested_content_type !== "social_post" && (
          <Fact label="Interview">
            {suggested.length > 0 ? (
              suggested.map((person, i) => (
                <span key={person.id}>
                  {i > 0 && ", "}
                  {person.name}
                  {person.jobTitle && <span className="text-muted-foreground"> ({person.jobTitle})</span>}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">Nog niemand voorgesteld. Kies iemand bij het oppakken.</span>
            )}
          </Fact>
        )}
        {stakeholders.length > 0 && (
          <Fact label="Betrokkenen">
            {stakeholders.map((s, i) => (
              <span key={`${s.name}-${s.role}`} title={s.reason || undefined}>
                {i > 0 && ", "}
                {s.name} <span className="text-muted-foreground">({s.role})</span>
              </span>
            ))}
          </Fact>
        )}
        {opportunity.status === "snoozed" && opportunity.snoozed_until && (
          <Fact label="Later">Komt terug in de inbox op {formatDate(opportunity.snoozed_until, "d MMMM yyyy")}.</Fact>
        )}
        {opportunity.status === "declined" && <Fact label="Afgewezen">{opportunity.decline_reason || "Geen reden opgegeven"}</Fact>}
        {released && (
          <Fact label="Vrijgegeven">
            Voor extern gebruik op {formatDate(opportunity.released_external_at, "d MMMM yyyy")}
            {releasedBy ? ` door ${releasedBy}` : ""}
            {opportunity.release_reason ? `: ${opportunity.release_reason}` : "."}
          </Fact>
        )}
      </dl>

      {blocked && open && (
        <p className="flex max-w-3xl items-start gap-1.5 text-[0.8125rem] leading-relaxed">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
          <span>
            Dit voorstel komt uit een interne bron en kan nog niet worden opgepakt. Intern blijft intern tot een redacteur het onderwerp
            vrijgeeft voor extern gebruik{canRelease ? "." : "; dat kan iemand met het recht om content goed te keuren."}
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {opportunity.classification === "external" && (
            <span className="inline-flex items-center gap-1.5">
              {needsPermission && <ShieldAlert className="size-3.5 text-warning" strokeWidth={1.75} />}
              Externe publicatie:
              <MetaBadge meta={EXTERNAL_PERMISSION_META} value={opportunity.external_permission} />
            </span>
          )}
          {showSignal && opportunity.signal && (
            <Link href={`/inbox/${opportunity.signal.id}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline">
              <span className="truncate">Signaal: {opportunity.signal.title}</span>
              <ArrowUpRight className="size-3 shrink-0" />
            </Link>
          )}
        </div>

        <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
          {opportunity.article && (
            <Link
              href={`/editorial/${opportunity.article.id}`}
              className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:border-foreground/30"
            >
              <span className="min-w-0 max-w-56 truncate">{opportunity.article.title}</span>
              <ContentStatusBadge status={opportunity.article.status} />
            </Link>
          )}
          <TopicDecisions
            topic={{
              id: opportunity.id,
              title: opportunity.title,
              status: opportunity.status,
              classification: opportunity.classification,
              needsInterview: opportunity.suggested_content_type !== "social_post",
              internalOnly: opportunity.internal_only,
              released,
              hasArticle: Boolean(opportunity.article),
            }}
            suggested={suggested}
            canManage={canManage}
            canRelease={canRelease}
          />
        </div>
      </div>
    </article>
  );
}
