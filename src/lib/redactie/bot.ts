import "server-only";
import { postSlackMessage } from "@/lib/integrations/connectors";
import { loadSecrets } from "@/lib/integrations/service";
import { decideDelivery, type ChannelTarget, type Recipient } from "@/lib/redactie/conduct";
import { redactieSettings, type RedactieSettings } from "@/lib/redactie/settings";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { BotMessageKind, BotMessageStatus } from "@/lib/types";

/**
 * The bot's outbox. Every message to a colleague or a channel is written here,
 * whatever happens to it: sent through Slack, simulated because there is no
 * Slack connection, held back until office hours, only shown to the editors
 * (shadow mode) or stopped by a rule. The editors can read all of it.
 */

export type BotMessageInput = {
  organizationId: string;
  kind: BotMessageKind;
  medium: "dm" | "channel" | "thread" | "email";
  body: string;
  recipientProfileId?: string | null;
  /** For recipients without an account, e.g. the sender of an e-mail. */
  recipientLabel?: string | null;
  slackChannelId?: string | null;
  threadTs?: string | null;
  countsAsRequest?: boolean;
  responsive?: boolean;
  entityType?: string;
  entityId?: string | null;
  now?: Date;
};

export type BotMessageResult = { id: string | null; status: BotMessageStatus; reason?: string };

type SlackConnection = { token: string } | null;

async function slackConnection(db: AdminClient, organizationId: string): Promise<SlackConnection> {
  const { data } = await db
    .from("integrations")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("provider", "slack")
    .maybeSingle();
  if (!data || data.status !== "connected") return null;
  const secrets = await loadSecrets(data.id);
  return secrets.bot_token ? { token: secrets.bot_token } : null;
}

export async function loadRedactieSettings(db: AdminClient, organizationId: string): Promise<RedactieSettings> {
  const { data } = await db.from("organizations").select("settings").eq("id", organizationId).single();
  return redactieSettings(data?.settings);
}

async function deliver(
  db: AdminClient,
  message: { medium: string; body: string; slackChannelId: string | null; threadTs: string | null; slackUserId: string | null },
  organizationId: string,
): Promise<{ status: BotMessageStatus; error?: string }> {
  // There is no outgoing mail connector: an e-mail reply is always simulated.
  if (message.medium === "email") return { status: "simulated" };
  const connection = await slackConnection(db, organizationId);
  if (!connection) return { status: "simulated" };

  const target = message.medium === "dm" ? message.slackUserId : message.slackChannelId;
  if (!target) {
    return {
      status: "failed",
      error: message.medium === "dm" ? "Deze persoon heeft geen gekoppeld Slack-account." : "Het Slack-kanaal is onbekend.",
    };
  }
  try {
    await postSlackMessage(connection.token, { channel: target, text: message.body, threadTs: message.threadTs });
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendBotMessage(input: BotMessageInput): Promise<BotMessageResult> {
  const db = createAdminClient();
  const now = input.now ?? new Date();
  const settings = await loadRedactieSettings(db, input.organizationId);

  let recipient: (Recipient & { slackUserId: string | null; name: string }) | null = null;
  if (input.recipientProfileId) {
    const { data } = await db
      .from("profiles")
      .select(
        "full_name, slack_user_id, bot_may_contact, contact_opt_out, contact_paused_until, absent_until, in_pilot, last_requested_at, is_active",
      )
      .eq("organization_id", input.organizationId)
      .eq("id", input.recipientProfileId)
      .maybeSingle();
    if (data) {
      recipient = {
        name: data.full_name,
        slackUserId: data.slack_user_id,
        botMayContact: data.bot_may_contact,
        contactOptOut: data.contact_opt_out,
        contactPausedUntil: data.contact_paused_until,
        absentUntil: data.absent_until,
        inPilot: data.in_pilot,
        lastRequestedAt: data.last_requested_at,
        isActive: data.is_active,
      };
    }
  }

  let channel: ChannelTarget | null = null;
  if ((input.medium === "channel" || input.medium === "thread") && input.slackChannelId) {
    const { data } = await db
      .from("channels")
      .select("followed, is_private, has_external_members")
      .eq("organization_id", input.organizationId)
      .eq("slack_channel_id", input.slackChannelId)
      .maybeSingle();
    if (data) channel = { followed: data.followed, isPrivate: data.is_private, hasExternalMembers: data.has_external_members };
  }

  const decision = decideDelivery(
    {
      kind: input.kind,
      medium: input.medium,
      countsAsRequest: input.countsAsRequest ?? false,
      responsive: input.responsive ?? false,
      recipient,
      channel,
    },
    settings,
    now,
  );

  let status: BotMessageStatus;
  let blockedReason: string | null = null;
  let sendAfter: string | null = null;
  let error: string | null = null;

  if (decision.action === "block") {
    status = "blocked";
    blockedReason = decision.reason;
  } else if (decision.action === "shadow") {
    status = "shadow";
  } else if (decision.action === "schedule") {
    status = "scheduled";
    sendAfter = decision.sendAfter.toISOString();
  } else {
    const outcome = await deliver(
      db,
      {
        medium: input.medium,
        body: input.body,
        slackChannelId: input.slackChannelId ?? null,
        threadTs: input.threadTs ?? null,
        slackUserId: recipient?.slackUserId ?? null,
      },
      input.organizationId,
    );
    status = outcome.status;
    error = outcome.error ?? null;
  }

  const { data: row, error: insertError } = await db
    .from("bot_messages")
    .insert({
      organization_id: input.organizationId,
      kind: input.kind,
      medium: input.medium,
      slack_channel_id: input.slackChannelId ?? null,
      thread_ts: input.threadTs ?? null,
      recipient_profile_id: recipient ? (input.recipientProfileId ?? null) : null,
      recipient_label: input.recipientLabel ?? recipient?.name ?? null,
      body: input.body,
      status,
      blocked_reason: blockedReason,
      send_after: sendAfter,
      counts_as_request: input.countsAsRequest ?? false,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      error,
    })
    .select("id")
    .single();
  if (insertError) console.error("[bot] could not record message", insertError.message);

  // The per-person limit counts requests that were (or will be) actually delivered.
  if (input.countsAsRequest && input.recipientProfileId && ["sent", "simulated", "scheduled"].includes(status)) {
    await db.from("profiles").update({ last_requested_at: now.toISOString() }).eq("id", input.recipientProfileId);
  }

  return { id: row?.id ?? null, status, reason: blockedReason ?? error ?? undefined };
}

/** Delivers messages that were held back until office hours. Called by the job tick. */
export async function deliverScheduledMessages(organizationId: string, now = new Date()): Promise<number> {
  const db = createAdminClient();
  const settings = await loadRedactieSettings(db, organizationId);
  if (settings.botPaused || settings.shadowMode) return 0;

  const { data: due } = await db
    .from("bot_messages")
    .select("id, medium, body, slack_channel_id, thread_ts, recipient_profile_id")
    .eq("organization_id", organizationId)
    .eq("status", "scheduled")
    .lte("send_after", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  let delivered = 0;
  for (const message of due ?? []) {
    let slackUserId: string | null = null;
    if (message.recipient_profile_id) {
      const { data: profile } = await db.from("profiles").select("slack_user_id").eq("id", message.recipient_profile_id).maybeSingle();
      slackUserId = profile?.slack_user_id ?? null;
    }
    const outcome = await deliver(
      db,
      { medium: message.medium, body: message.body, slackChannelId: message.slack_channel_id, threadTs: message.thread_ts, slackUserId },
      organizationId,
    );
    await db.from("bot_messages").update({ status: outcome.status, error: outcome.error ?? null, send_after: null }).eq("id", message.id);
    delivered++;
  }
  return delivered;
}

/** Whether the bot may start new work at all (the pause button). */
export async function botIsPaused(organizationId: string): Promise<boolean> {
  const settings = await loadRedactieSettings(createAdminClient(), organizationId);
  return settings.botPaused;
}

export function appLink(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}
