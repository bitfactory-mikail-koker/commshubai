import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MetaBadge } from "@/components/shared/badges";
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout";
import { requireSession } from "@/lib/auth";
import { APPROVAL_DECISION_META, BOT_MESSAGE_KIND_LABELS, BOT_MESSAGE_STATUS_META, INTERVIEW_STATUS_META } from "@/lib/constants";
import { formatDate, formatDateTime, formatDay, truncate } from "@/lib/format";
import { redactieSettings } from "@/lib/redactie/settings";
import { createClient } from "@/lib/supabase/server";
import type { BotMessageKind } from "@/lib/types";
import { AvailabilityForm } from "./_components/availability-form";

export const metadata: Metadata = { title: "Wat is er over mij bewaard" };

export default async function MyDataPage() {
  const session = await requireSession();
  const db = await createClient();
  const settings = redactieSettings(session.organization.settings);

  // Everything here is read with the person's own session: RLS shows them exactly their own records.
  const [messagesRes, interviewsRes, approvalsRes, botRes, emojiRes] = await Promise.all([
    db
      .from("source_messages")
      .select("id, source, channel, body, occurred_at, excluded")
      .eq("author_profile_id", session.userId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    db
      .from("interviews")
      .select("id, title, status, requested_at, completed_at")
      .eq("interviewee_profile_id", session.userId)
      .order("created_at", { ascending: false }),
    db
      .from("approvals")
      .select("id, kind, decision, quote_text, step_label, entity_type, entity_id, decided_at, requested_at")
      .contains("eligible_profile_ids", [session.userId])
      .neq("decision", "withdrawn")
      .order("requested_at", { ascending: false })
      .limit(100),
    db
      .from("bot_messages")
      .select("id, kind, status, body, created_at")
      .eq("recipient_profile_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("emoji_rules").select("emoji").eq("action", "exclude").eq("enabled", true).limit(1).maybeSingle(),
  ]);

  const messages = (messagesRes.data ?? []).filter((m) => !m.excluded);
  const interviews = interviewsRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const bot = botRes.data ?? [];
  const exclude = emojiRes.data?.emoji ?? "🚫";
  const pausedUntil =
    session.profile.contact_paused_until && new Date(session.profile.contact_paused_until) > new Date()
      ? formatDate(session.profile.contact_paused_until)
      : null;

  return (
    <div className="space-y-7">
      <Link
        href="/for-me"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} />
        Voor mij
      </Link>
      <PageHeader
        title="Wat is er over mij bewaard"
        description={`De ${settings.botName} bewaart alleen berichten die zijn aangewezen of die hij als nieuws heeft geselecteerd, de antwoorden die je hem zelf gaf, concepten, goedkeuringen en het logboek. Wat hij verzamelt wordt alleen voor communicatie gebruikt.`}
      />

      <Panel title="Jouw contact met de bot">
        <AvailabilityForm
          key={`${session.profile.absent_until}:${session.profile.contact_opt_out}:${pausedUntil}`}
          absentUntil={session.profile.absent_until}
          contactOptOut={session.profile.contact_opt_out}
          pausedUntil={pausedUntil}
        />
      </Panel>

      <div className="grid gap-x-10 gap-y-3 text-[0.8125rem] leading-relaxed text-muted-foreground md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">Wat de bot niet doet</p>
          <p>Hij leest geen besloten kanalen, geen kanalen met klanten en geen privéberichten tussen collega&apos;s.</p>
          <p>Hij publiceert niets zelf. Een citaat van jou verschijnt alleen als jij het hebt goedgekeurd.</p>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-foreground">Wat jij kunt doen</p>
          <p>Zet {exclude} bij een bericht in Slack dat hij niet mag gebruiken. Het wordt dan ook hier verwijderd.</p>
          <p>
            Verwijder je een bericht in Slack, dan verdwijnt het ook hier. Signalen die nergens toe leidden worden na{" "}
            {settings.signalRetentionMonths} maanden verwijderd.
            {settings.contactPerson ? ` Vragen? ${settings.contactPerson}.` : ""}
          </p>
        </div>
      </div>

      <Panel title="Berichten van jou die zijn bewaard" description="Berichten die een collega aanwees of die de bot als nieuws selecteerde, en tips die je zelf stuurde." flush>
        {messages.length === 0 ? (
          <EmptyState title="Geen berichten bewaard" description="Er is geen bericht van jou opgeslagen." />
        ) : (
          <ul className="divide-y">
            {messages.map((message) => (
              <li key={message.id} className="grid gap-x-6 gap-y-0.5 px-4 py-2.5 text-[0.8125rem] sm:grid-cols-[minmax(0,1fr)_auto]">
                <p className="min-w-0 leading-relaxed">{truncate(message.body, 220)}</p>
                <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {message.channel ?? message.source} · {formatDay(message.occurred_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Interviews" description="Je antwoorden en de samenvatting ervan. Open een interview om alles te lezen." flush>
        {interviews.length === 0 ? (
          <EmptyState title="Geen interviews" description="Je bent nog niet geïnterviewd." />
        ) : (
          <ul className="divide-y">
            {interviews.map((interview) => (
              <li key={interview.id}>
                <Link
                  href={`/interviews/${interview.id}`}
                  className="grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <p className="truncate text-sm font-medium">{interview.title}</p>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatDay(interview.completed_at ?? interview.requested_at)}</span>
                    <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Citaten en akkoorden" description="Wat aan jou is voorgelegd en wat je hebt besloten." flush>
        {approvals.length === 0 ? (
          <EmptyState title="Geen akkoorden" description="Er is je nog niets ter goedkeuring voorgelegd." />
        ) : (
          <ul className="divide-y">
            {approvals.map((approval) => (
              <li key={approval.id}>
                <Link
                  href={`/preview/${approval.entity_type}/${approval.entity_id}`}
                  className="grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <p className="min-w-0 truncate text-[0.8125rem]">
                    {approval.quote_text ? `“${approval.quote_text}”` : (approval.step_label ?? "Goedkeuring van een stuk")}
                  </p>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatDay(approval.decided_at ?? approval.requested_at)}</span>
                    <MetaBadge meta={APPROVAL_DECISION_META} value={approval.decision} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Berichten van de bot aan jou" flush>
        {bot.length === 0 ? (
          <EmptyState title="Geen berichten" description="De bot heeft je nog niets gestuurd." />
        ) : (
          <ul className="divide-y">
            {bot.map((message) => (
              <li key={message.id} className="space-y-1 px-4 py-2.5 text-[0.8125rem]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{BOT_MESSAGE_KIND_LABELS[message.kind as BotMessageKind] ?? message.kind}</span>
                  <span className="tabular-nums">{formatDateTime(message.created_at)}</span>
                  <MetaBadge meta={BOT_MESSAGE_STATUS_META} value={message.status} />
                </div>
                <p className="leading-relaxed whitespace-pre-line text-foreground/85">{truncate(message.body, 400)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
