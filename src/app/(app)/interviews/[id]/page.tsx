import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Lightbulb, Quote } from "lucide-react";
import { AgentAvatar, ClassificationBadge, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader, Panel, UserAvatar } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { AGENT_META, INTERVIEW_KIND_LABELS, INTERVIEW_STATUS_META } from "@/lib/constants";
import { formatDateTime, formatDay } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { ContentType, InterviewKind, InterviewQuestion, InterviewStatus, InterviewSummary } from "@/lib/types";
import { Conversation } from "./_components/conversation";
import { ConvertPanel } from "./_components/convert-panel";
import { FollowUps, type FollowUp } from "./_components/follow-ups";
import { ConfirmSummary, InviteChoices } from "./_components/interview-steps";
import { PlanningPanel } from "./_components/planning-panel";
import { QuestionsPanel } from "./_components/questions-panel";

export const metadata: Metadata = { title: "Interview" };

export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();

  const { data: interview } = await db
    .from("interviews")
    .select(
      "*, agent:agents(kind, name), article:articles!interviews_article_id_fkey(id, title, status), opportunity:content_opportunities(id, title, signal_id), interviewee:profiles!interviews_interviewee_profile_id_fkey(full_name, avatar_color)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!interview) notFound();

  const { data: messages } = await db
    .from("interview_messages")
    .select("id, role, content, question_id, created_at")
    .eq("interview_id", id)
    .order("created_at", { ascending: true });

  const status = interview.status as InterviewStatus;
  const canManage = can(session, "content.create");
  const isInterviewee = interview.interviewee_profile_id === session.userId;
  const canAnswer = canManage || isInterviewee;

  const agentKind = interview.agent?.kind ?? (interview.classification === "external" ? "external" : "internal");
  const agentName = interview.agent?.name ?? AGENT_META[agentKind].label;
  const questions = fromJson<InterviewQuestion[]>(interview.questions, []);
  const summary = fromJson<InterviewSummary | null>(interview.summary, null);
  const followUps = fromJson<FollowUp[]>(interview.follow_up_actions, []);
  const demoAnswers = interview.is_demo
    ? (fromJson<{ demo_answers?: string[] }>(interview.metadata, {}).demo_answers ?? []).filter((a) => typeof a === "string")
    : [];
  const transcript = messages ?? [];
  const askedIds = transcript.filter((m) => m.role === "agent" && m.question_id).map((m) => m.question_id as string);
  const questionsEditable = canManage && ["draft", "requested", "scheduled"].includes(status);
  const meta = fromJson<{ invite?: { status?: string; reason?: string | null }; escalated?: boolean }>(interview.metadata, {});
  const waitingForInvite = ["requested", "scheduled"].includes(status);
  const INVITE_STATE: Record<string, string> = {
    sent: "De bot heeft de uitnodiging via Slack verstuurd.",
    simulated: "De uitnodiging is klaargezet. Er is geen Slack-verbinding, dus ze is niet echt verstuurd.",
    shadow: "Schaduwmodus: de bot zou deze uitnodiging sturen, maar heeft dat niet gedaan.",
    scheduled: "De uitnodiging gaat uit zodra de werkdag begint.",
    blocked: `De uitnodiging is niet verstuurd: ${meta.invite?.reason ?? "een regel hield haar tegen"}`,
    failed: `De uitnodiging kon niet worden verstuurd: ${meta.invite?.reason ?? "onbekende fout"}`,
  };

  const defaultContentType: ContentType =
    interview.kind === "customer_case"
      ? "customer_case"
      : interview.kind === "employee_intro"
        ? "employee_introduction"
        : interview.kind === "management"
          ? "management_update"
          : interview.kind === "expert"
            ? "interview"
            : interview.classification === "external"
              ? "news_article"
              : "internal_update";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/interviews"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Interviews
        </Link>
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              {INTERVIEW_KIND_LABELS[interview.kind as InterviewKind] ?? interview.kind}
              <MetaBadge meta={INTERVIEW_STATUS_META} value={status} dot />
              <ClassificationBadge classification={interview.classification} />
              {interview.is_demo && <DemoBadge />}
            </span>
          }
          title={interview.title}
          description={interview.purpose || undefined}
        />
      </div>

      {/* Participants and context */}
      <div className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3">
          <AgentAvatar kind={agentKind} size="lg" />
          <div className="min-w-0 leading-tight">
            <p className="text-xs text-muted-foreground">Interviewer</p>
            <p className="truncate text-sm font-medium">{agentName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar name={interview.interviewee_name} color={interview.interviewee?.avatar_color ?? "slate"} size="lg" />
          <div className="min-w-0 leading-tight">
            <p className="text-xs text-muted-foreground">Geïnterviewde</p>
            <p className="truncate text-sm font-medium">{interview.interviewee_name}</p>
            {interview.interviewee_role && <p className="truncate text-xs text-muted-foreground">{interview.interviewee_role}</p>}
          </div>
        </div>
        <div className="leading-tight">
          <p className="text-xs text-muted-foreground">Planning</p>
          <p className="mt-1 text-sm font-medium">
            {status === "completed"
              ? `Afgerond op ${formatDateTime(interview.completed_at)}`
              : interview.scheduled_at
                ? formatDay(interview.scheduled_at)
                : "Nog niet ingepland"}
          </p>
          {interview.requested_at && (
            <p className="text-xs text-muted-foreground">Aangevraagd op {formatDateTime(interview.requested_at)}</p>
          )}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-xs text-muted-foreground">Gekoppeld aan</p>
          {interview.article ? (
            <Link
              href={`/editorial/${interview.article.id}`}
              className="mt-1 flex items-center gap-1.5 text-sm font-medium hover:underline hover:underline-offset-2"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="truncate">{interview.article.title}</span>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Geen contentitem</p>
          )}
          {interview.opportunity?.signal_id && (
            <Link
              href={`/inbox/${interview.opportunity.signal_id}`}
              className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-2"
            >
              <Lightbulb className="size-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Kans: {interview.opportunity.title}</span>
            </Link>
          )}
        </div>
      </div>

      {waitingForInvite && isInterviewee && (
        <Panel title="Wil je meewerken aan dit interview?">
          <InviteChoices interviewId={interview.id} questionCount={questions.length} />
        </Panel>
      )}

      {waitingForInvite && canManage && meta.invite?.status && (
        <Notice tone={["blocked", "failed"].includes(meta.invite.status) ? "warning" : "info"} title="Uitnodiging door de bot">
          {INVITE_STATE[meta.invite.status] ?? meta.invite.status}
          {interview.invite_choice === "later" && " De geïnterviewde koos: later."}
          {interview.reminded_at && ` Herinnering gestuurd op ${formatDay(interview.reminded_at)}.`}
          {meta.escalated && " Geen reactie na de herinnering: de bot stuurt niets meer."}
        </Notice>
      )}

      {status === "cancelled" && interview.invite_choice && (
        <Notice tone="warning" title={interview.invite_choice === "redirect" ? "Niet de juiste persoon" : "Liever niet"}>
          {interview.invite_choice === "redirect"
            ? `${interview.interviewee_name} gaf aan hier niet over te gaan${interview.redirect_to ? ` en verwees naar: ${interview.redirect_to}` : ""}.`
            : `${interview.interviewee_name} wil hiervoor niet worden geïnterviewd. De bot vraagt het niet opnieuw.`}
        </Notice>
      )}

      {status === "awaiting_confirmation" && (
        <Panel
          title="Klopt dit?"
          description={
            canAnswer
              ? "Dit heeft de bot van het gesprek begrepen. Bevestig het, of zeg wat er anders moet."
              : `De samenvatting wacht op bevestiging door ${interview.interviewee_name}.`
          }
        >
          <div className="space-y-4">
            {summary && (
              <div className="max-w-[68ch] space-y-2 text-sm leading-relaxed">
                <p>{summary.summary}</p>
                {summary.key_points.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4.5">
                    {summary.key_points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {canAnswer && <ConfirmSummary interviewId={interview.id} />}
          </div>
        </Panel>
      )}

      {!canAnswer && (
        <Notice tone="info" title="Alleen-lezen">
          Alleen de geïnterviewde en redacteuren kunnen dit interview beantwoorden. Je kunt het gesprek wel meelezen.
        </Notice>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
        <Conversation
          interviewId={interview.id}
          status={status}
          messages={transcript.map((m) => ({
            id: m.id,
            role: m.role as "agent" | "interviewee",
            content: m.content,
            createdAt: m.created_at,
          }))}
          agentKind={agentKind}
          agentName={agentName}
          intervieweeName={interview.interviewee_name}
          intervieweeColor={interview.interviewee?.avatar_color ?? "slate"}
          canAnswer={canAnswer}
          canManage={canManage}
          demoAnswers={demoAnswers}
        />
          <Panel
            title="Voorbereide vragen"
            description={
              questionsEditable
                ? "Pas de vragen aan totdat het interview start."
                : `${askedIds.length} van ${questions.length} gesteld`
            }
          >
            <QuestionsPanel interviewId={interview.id} questions={questions} askedIds={askedIds} editable={questionsEditable} />
          </Panel>
        </div>

        <div className="space-y-6">
          {status === "completed" && (
            <Panel title="Samenvatting" description="Opgesteld door de agent op basis van de antwoorden.">
              {summary ? (
                <div className="space-y-5 text-sm leading-relaxed">
                  <p>{summary.summary}</p>
                  {summary.key_points.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground ">Kernpunten</h3>
                      <ul className="list-disc space-y-1.5 pl-4.5">
                        {summary.key_points.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summary.quotes.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground ">Quotes</h3>
                      <ul className="space-y-3">
                        {summary.quotes.map((quote, i) => (
                          <li key={i} className="flex gap-2.5">
                            <Quote className="mt-1 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                            <div>
                              <p className="text-[0.98rem] leading-relaxed italic">„{quote.text}”</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">- {quote.speaker}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="border-t pt-3 text-xs text-muted-foreground">
                    Quotes zijn letterlijk overgenomen uit de antwoorden. Laat ze accorderen voordat je ze publiceert.
                  </p>
                </div>
              ) : (
                <EmptyState title="Geen samenvatting beschikbaar" className="py-6" />
              )}
              {summary && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {interview.summary_confirmed_at
                    ? `Bevestigd door de geïnterviewde op ${formatDay(interview.summary_confirmed_at)}.`
                    : "Niet bevestigd door de geïnterviewde: het interview is door de redactie afgesloten."}
                </p>
              )}
            </Panel>
          )}

          {status === "completed" && (
            <Panel
              title="Vervolgacties"
              description={
                followUps.length > 0 ? `${followUps.filter((f) => !f.done).length} van ${followUps.length} nog open` : undefined
              }
            >
              <FollowUps interviewId={interview.id} items={followUps} canEdit={canManage} />
            </Panel>
          )}

          {status === "completed" && canManage && (
            <Panel
              title="Omzetten naar content"
              description={
                interview.article
                  ? "De agent schrijft een concept voor het gekoppelde contentitem."
                  : "De agent maakt een nieuw contentitem met een eerste concept."
              }
            >
              <ConvertPanel interviewId={interview.id} defaultType={defaultContentType} />
            </Panel>
          )}

          {canManage && status !== "completed" && status !== "cancelled" && (
            <Panel title="Planning" description="Een ingepland interview staat op de contentkalender.">
              <PlanningPanel interviewId={interview.id} scheduledAt={interview.scheduled_at} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
