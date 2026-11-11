import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { AgentAvatar, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/layout";
import type { Tone } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import type { AgentKind, AgentMessage } from "@/lib/types";

export const AGENT_MESSAGE_SELECT =
  "*, from:agents!agent_messages_from_agent_id_fkey(kind, name), to:agents!agent_messages_to_agent_id_fkey(kind, name)";

export type AgentMessageWithAgents = AgentMessage & {
  from: { kind: AgentKind; name: string } | null;
  to: { kind: AgentKind; name: string } | null;
};

const TYPE_META: Record<string, { label: string; tone: Tone }> = {
  opportunity_referral: { label: "Doorverwijzing", tone: "teal" },
  info_request: { label: "Informatieverzoek", tone: "amber" },
  info_response: { label: "Antwoord", tone: "green" },
};

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "amber" },
  accepted: { label: "Opgepakt", tone: "green" },
  answered: { label: "Beantwoord", tone: "green" },
  declined: { label: "Afgewezen", tone: "slate" },
};

/** Messages exchanged between the two agents (referrals and info requests). */
export function AgentMessageList({
  messages,
  emptyText = "De agents hebben nog geen berichten uitgewisseld.",
}: {
  messages: AgentMessageWithAgents[];
  emptyText?: string;
}) {
  if (messages.length === 0) {
    return <EmptyState icon={MessagesSquare} title="Geen berichten" description={emptyText} className="py-8" />;
  }
  return (
    <ol className="divide-y">
      {messages.map((message) => (
        <li key={message.id} className="space-y-2.5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              {message.from && <AgentAvatar kind={message.from.kind} size="sm" />}
              {message.from?.name ?? "Agent"}
            </span>
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              {message.to && <AgentAvatar kind={message.to.kind} size="sm" />}
              {message.to?.name ?? "Agent"}
            </span>
            <MetaBadge meta={TYPE_META} value={message.type} />
            <MetaBadge meta={STATUS_META} value={message.status} dot />
            <time dateTime={message.created_at} className="ml-auto">
              {formatDay(message.created_at)}
            </time>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{message.subject}</p>
            <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{message.body}</p>
          </div>
          {message.response && (
            <div className="max-w-3xl rounded-lg border bg-subtle px-3.5 py-2.5">
              <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                Reactie van de {message.to?.name ?? "agent"}
                {message.responded_at && <span className="font-normal">· {formatDay(message.responded_at)}</span>}
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-line">{message.response}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {message.signal_id && (
              <Link href={`/inbox/${message.signal_id}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Bekijk signaal
              </Link>
            )}
            {message.article_id && (
              <Link href={`/editorial/${message.article_id}`} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                Bekijk contentitem
              </Link>
            )}
            {message.status === "open" && <ToneBadge tone="amber">Wacht op verwerking door de ontvangende agent</ToneBadge>}
          </div>
        </li>
      ))}
    </ol>
  );
}
