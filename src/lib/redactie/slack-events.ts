import "server-only";
import { logSystemAction } from "@/lib/audit";
import { slackChannelInfo } from "@/lib/integrations/connectors";
import { loadSecrets } from "@/lib/integrations/service";
import { handleChannelMessage, handleMessageDeleted, handleReaction } from "@/lib/redactie/intake";
import { handleDirectMessage } from "@/lib/redactie/interview-flow";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Events from the organization's own Slack app (Events API).
 *
 * What the bot does with an event:
 *   reaction_added        emoji on a message in a followed channel       → flow A
 *   message (channel)     a message in a followed channel                → flow B
 *   message (im)          a direct message TO the bot                    → interview answer, tip or steering
 *   message_deleted       the message disappears here too
 *   member_joined_channel the bot was added to a channel                 → registered, never followed automatically
 *
 * The bot never reads direct messages between colleagues: Slack only delivers
 * conversations the bot itself is part of, and group DMs are ignored here.
 */

type SlackEvent = {
  type: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  event_ts?: string;
  reaction?: string;
  item?: { type?: string; channel?: string; ts?: string };
  item_user?: string;
  deleted_ts?: string;
  previous_message?: { ts?: string };
};

export type SlackEnvelope = { type: string; team_id?: string; event?: SlackEvent; challenge?: string; api_app_id?: string };

/** The organization and credentials that belong to a Slack workspace. */
export async function slackWorkspace(teamId: string | undefined) {
  const db = createAdminClient();
  const { data: integrations } = await db.from("integrations").select("id, organization_id, config, status").eq("provider", "slack");
  const candidates = (integrations ?? []).filter((i) => {
    const config = (i.config ?? {}) as { team_id?: string };
    return teamId ? config.team_id === teamId : false;
  });
  const integration = candidates[0];
  if (!integration) return null;
  const secrets = await loadSecrets(integration.id);
  return {
    organizationId: integration.organization_id,
    botToken: secrets.bot_token ?? null,
    signingSecret: secrets.signing_secret ?? null,
    botUserId: ((integration.config ?? {}) as { bot_user_id?: string }).bot_user_id ?? null,
  };
}

export async function handleSlackEvent(organizationId: string, event: SlackEvent, workspace: { botToken: string | null; botUserId: string | null }) {
  const base = { organizationId, trigger: "event" as const };

  if (event.type === "reaction_added" && event.item?.type === "message" && event.item.channel && event.item.ts && event.reaction) {
    return handleReaction({
      ...base,
      slackChannelId: event.item.channel,
      ts: event.item.ts,
      shortcode: event.reaction,
      reactorSlackUserId: event.user,
    });
  }

  if (event.type === "member_joined_channel" && event.channel && event.user && event.user === workspace.botUserId && workspace.botToken) {
    // Being added to a channel is not permission to follow it: the administrator decides that on the website.
    const db = createAdminClient();
    const info = await slackChannelInfo(workspace.botToken, event.channel);
    await db.from("channels").upsert(
      {
        organization_id: organizationId,
        slack_channel_id: info.id,
        name: info.name,
        is_private: info.isPrivate,
        has_external_members: info.hasExternalMembers,
      },
      { onConflict: "organization_id,slack_channel_id", ignoreDuplicates: true },
    );
    await logSystemAction(db, {
      organizationId,
      action: "channel.joined",
      summary:
        info.isPrivate || info.hasExternalMembers
          ? `De bot is toegevoegd aan #${info.name}, een ${info.isPrivate ? "besloten kanaal" : "kanaal met externen"}. Dit kanaal kan niet worden gevolgd.`
          : `De bot is toegevoegd aan #${info.name}. De beheerder beslist of het kanaal wordt gevolgd.`,
    });
    return { outcome: "registered" };
  }

  if (event.type !== "message" || !event.channel) return { outcome: "ignored" };

  if (event.subtype === "message_deleted") {
    const ts = event.deleted_ts ?? event.previous_message?.ts;
    return ts ? handleMessageDeleted({ organizationId, slackChannelId: event.channel, ts }) : { outcome: "ignored" };
  }
  // Edits, joins, bot messages and file notices are not messages from a colleague.
  if (event.subtype || event.bot_id || !event.user || !event.text || !event.ts) return { outcome: "ignored" };

  if (event.channel_type === "im") {
    return handleDirectMessage({ ...base, slackUserId: event.user, text: event.text });
  }
  if (event.channel_type === "channel") {
    return handleChannelMessage({
      ...base,
      slackChannelId: event.channel,
      ts: event.ts,
      message: { text: event.text, authorSlackUserId: event.user },
    });
  }
  // Private channels (group) and group DMs (mpim): never read.
  return { outcome: "ignored" };
}
