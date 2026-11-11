import { subDays } from "date-fns";
import "server-only";
import { evaluateSignal } from "@/lib/agents/pipelines";
import { toSourceMaterial, withRun } from "@/lib/agents/runtime";
import { logSystemAction } from "@/lib/audit";
import { fetchSlackMessage, searchSlackHistory } from "@/lib/integrations/connectors";
import { loadSecrets } from "@/lib/integrations/service";
import { processSourceMessages } from "@/lib/intelligence/pipeline";
import { toJson } from "@/lib/json";
import { loadRedactieSettings, sendBotMessage } from "@/lib/redactie/bot";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { AgentKind, Channel, ContentType, EmojiAction, SignalOrigin } from "@/lib/types";
import { mapConcurrent } from "@/lib/concurrency";

/**
 * Opvangen: how something reaches the editors.
 *   A  a colleague points at a message with an emoji
 *   B  the bot notices something itself in a channel it follows
 *   C  a tip by direct message, the form on the website or the mailbox
 *
 * Every route ends in the same place: a proposal in the inbox that the editors
 * pick up, park or decline. Message and mail text is material to judge, never
 * an instruction to follow.
 */

type Trigger = "manual" | "schedule" | "event" | "demo";

export const RUBRICS = ["Nieuwe collega's", "Jubilea", "Vacatures", "Agenda"];

const EMOJI_PLAN: Record<Exclude<EmojiAction, "exclude">, { agent: AgentKind | null; contentType: ContentType; what: string }> = {
  external_news: { agent: "external", contentType: "news_article", what: "een extern nieuwsbericht" },
  customer_case: { agent: "external", contentType: "customer_case", what: "een klantcase" },
  internal_newsletter: { agent: "internal", contentType: "internal_update", what: "een stuk in de interne nieuwsbrief" },
  social_post: { agent: "external", contentType: "social_post", what: "een social post" },
  interview: { agent: null, contentType: "interview", what: "een interview" },
};

async function slackToken(db: AdminClient, organizationId: string): Promise<string | null> {
  const { data } = await db.from("integrations").select("id, status").eq("organization_id", organizationId).eq("provider", "slack").maybeSingle();
  if (!data || data.status !== "connected") return null;
  return (await loadSecrets(data.id)).bot_token ?? null;
}

async function followedChannel(db: AdminClient, organizationId: string, slackChannelId: string): Promise<Channel | null> {
  const { data } = await db
    .from("channels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("slack_channel_id", slackChannelId)
    .maybeSingle();
  // The table cannot hold a followed private or shared channel; this is the second lock.
  if (!data || !data.followed || data.is_private || data.has_external_members) return null;
  return data;
}

async function profileBySlackId(db: AdminClient, organizationId: string, slackUserId: string | null | undefined) {
  if (!slackUserId) return null;
  const { data } = await db
    .from("profiles")
    .select("id, full_name, bot_follows, is_active")
    .eq("organization_id", organizationId)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  return data;
}

export type IncomingMessage = {
  text: string;
  authorSlackUserId?: string | null;
  authorProfileId?: string | null;
  authorName?: string | null;
  occurredAt?: string;
};

/** Stores one Slack message as source material. Returns the existing row when it is already there. */
async function storeSlackMessage(
  db: AdminClient,
  channel: Channel,
  ts: string,
  message: IncomingMessage,
  isDemo: boolean,
): Promise<{ id: string; excluded: boolean; isNew: boolean }> {
  const externalId = `${channel.slack_channel_id}:${ts}`;
  const { data: existing } = await db
    .from("source_messages")
    .select("id, excluded")
    .eq("organization_id", channel.organization_id)
    .eq("source", "slack")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return { ...existing, isNew: false };

  const author =
    message.authorProfileId
      ? (await db.from("profiles").select("id, full_name").eq("id", message.authorProfileId).maybeSingle()).data
      : await profileBySlackId(db, channel.organization_id, message.authorSlackUserId);

  const { data, error } = await db
    .from("source_messages")
    .insert({
      organization_id: channel.organization_id,
      source: "slack",
      external_id: externalId,
      channel: `#${channel.name}`,
      channel_id: channel.id,
      slack_ts: ts,
      author_name: author?.full_name ?? message.authorName ?? null,
      author_profile_id: author?.id ?? null,
      body: message.text,
      occurred_at: message.occurredAt ?? new Date(Number(ts) * 1000 || Date.now()).toISOString(),
      metadata: toJson({ channel_id: channel.slack_channel_id }),
      is_demo: isDemo,
    })
    .select("id, excluded")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Bericht kon niet worden opgeslagen.");
  return { ...data, isNew: true };
}

/**
 * Turns one stored message into a signal. With `force` a human pointed at it,
 * so it becomes a signal whatever the model thinks of its news value.
 */
async function signalFromMessage(options: {
  organizationId: string;
  messageId: string;
  origin: SignalOrigin;
  emoji?: string | null;
  projectId?: string | null;
  suggestedAgent?: AgentKind | null;
  force: boolean;
  trigger: Trigger;
  triggeredBy?: string | null;
  note?: string | null;
}): Promise<{ signalId: string | null; created: boolean }> {
  const db = createAdminClient();
  const { data: existing } = await db
    .from("content_signals")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("primary_source_id", options.messageId)
    .neq("status", "duplicate")
    .maybeSingle();
  if (existing) {
    if (options.emoji) await db.from("content_signals").update({ emoji: options.emoji, origin: options.origin }).eq("id", existing.id);
    return { signalId: existing.id, created: false };
  }

  const result = await withRun(
    {
      organizationId: options.organizationId,
      agentKind: null,
      pipeline: "intake",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { message_id: options.messageId, origin: options.origin },
    },
    async (rt) => {
      rt.use("read_sources");
      const { data: message } = await rt.db
        .from("source_messages")
        .select("*")
        .eq("organization_id", rt.orgId)
        .eq("id", options.messageId)
        .single();
      if (!message) throw new Error("Bronbericht niet gevonden.");
      if (message.excluded) return { signalId: null as string | null };

      rt.use("detect_signals");
      const { data: people } = await rt.db.from("profiles").select("full_name").eq("organization_id", rt.orgId).eq("is_active", true);
      const analysis = await rt.ai.analyzeMessage({
        message: toSourceMaterial(message),
        organizationName: rt.organization.name,
        knownPeople: (people ?? []).map((p) => p.full_name),
      });
      await rt.db.from("source_messages").update({ processed_at: new Date().toISOString() }).eq("id", message.id);

      if (!analysis.newsworthy && !options.force) {
        rt.step("detect", "Geen signaal", "Niet nieuwswaardig bevonden", "detect_signals", "skipped");
        return { signalId: null as string | null };
      }

      const { data: signal, error } = await rt.db
        .from("content_signals")
        .insert({
          organization_id: rt.orgId,
          title: analysis.title,
          summary: analysis.summary,
          category: analysis.category,
          audience: analysis.audience,
          suggested_agent: options.suggestedAgent ?? analysis.suggestedAgent,
          // Someone on the work floor thought this was worth telling: that counts.
          relevance_score: options.force ? Math.max(analysis.relevanceScore, 60) : analysis.relevanceScore,
          score_rationale: options.note ? `${options.note} ${analysis.scoreRationale}` : analysis.scoreRationale,
          status: analysis.missingInformation.length >= 2 ? "needs_info" : "new",
          missing_information: toJson(analysis.missingInformation),
          suggested_action: analysis.suggestedAction,
          entities: toJson(analysis.entities),
          confidentiality: analysis.confidentiality,
          primary_source_id: message.id,
          submitted_by: options.origin === "tip" || options.origin === "mail" ? message.author_profile_id : null,
          detection_provider: rt.ai.id,
          is_demo: message.is_demo,
          origin: options.origin,
          emoji: options.emoji ?? null,
          project_id: options.projectId ?? null,
        })
        .select("id")
        .single();
      if (error || !signal) throw new Error(error?.message ?? "Signaal kon niet worden opgeslagen.");
      await rt.db.from("signal_sources").insert({
        signal_id: signal.id,
        source_message_id: message.id,
        organization_id: rt.orgId,
        relation: "primary",
      });
      rt.step("detect", "Signaal vastgelegd", analysis.title, "detect_signals");
      await rt.log({
        action: "signal.detected",
        category: "discovered",
        entityType: "signal",
        entityId: signal.id,
        summary: `Nieuw signaal${options.emoji ? ` (aangewezen met ${options.emoji})` : ""}: “${analysis.title}”.`,
        metadata: { origin: options.origin, source_message_id: message.id },
      });
      return { signalId: signal.id as string | null };
    },
  );
  return { signalId: result.signalId, created: Boolean(result.signalId) };
}

/**
 * A customer case belongs to a project. The bot links the project it
 * recognizes, or proposes a new one; a person confirms it.
 */
async function ensureProject(db: AdminClient, organizationId: string, signalId: string, authorProfileId: string | null): Promise<string | null> {
  const { data: signal } = await db.from("content_signals").select("project_id, entities, is_demo").eq("id", signalId).single();
  if (!signal) return null;
  if (signal.project_id) return signal.project_id;
  const entities = (signal.entities ?? {}) as { customer?: string | null; project?: string | null };
  const customer = entities.customer?.trim();
  const projectName = entities.project?.trim();
  if (!customer && !projectName) return null;

  const { data: projects } = await db.from("projects").select("id, name, client_name").eq("organization_id", organizationId).neq("status", "archived");
  const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
  const match = (projects ?? []).find((p) => same(p.name, projectName) || same(p.client_name, customer) || same(p.name, customer));
  let projectId = match?.id ?? null;

  if (!projectId) {
    const { data: created } = await db
      .from("projects")
      .insert({
        organization_id: organizationId,
        name: projectName && customer ? `${customer}: ${projectName}` : (projectName ?? customer ?? "Nieuw project"),
        client_name: customer ?? null,
        status: "proposed",
        proposed_by_bot: true,
        is_demo: signal.is_demo,
      })
      .select("id")
      .single();
    projectId = created?.id ?? null;
    if (projectId && authorProfileId) {
      await db.from("project_members").insert({
        project_id: projectId,
        profile_id: authorProfileId,
        organization_id: organizationId,
        project_role: "betrokkene",
        confirmed: false,
      });
    }
  }
  if (projectId) await db.from("content_signals").update({ project_id: projectId }).eq("id", signalId);
  return projectId;
}

// =============================================================================
// A. Emoji
// =============================================================================
export type ReactionResult = { outcome: "ignored" | "excluded" | "proposed" | "existing"; reason?: string; opportunityId?: string | null };

export async function handleReaction(input: {
  organizationId: string;
  slackChannelId: string;
  ts: string;
  shortcode: string;
  reactorSlackUserId?: string | null;
  reactorProfileId?: string | null;
  /** The message that was reacted to. Fetched from Slack when left out. */
  message?: IncomingMessage | null;
  trigger: Trigger;
  isDemo?: boolean;
}): Promise<ReactionResult> {
  const db = createAdminClient();
  const settings = await loadRedactieSettings(db, input.organizationId);
  if (settings.botPaused) return { outcome: "ignored", reason: "De bot is gepauzeerd." };

  const channel = await followedChannel(db, input.organizationId, input.slackChannelId);
  if (!channel) return { outcome: "ignored", reason: "Dit kanaal wordt niet gevolgd." };

  const shortcode = input.shortcode.replace(/:/g, "").split("::")[0];
  const { data: rule } = await db
    .from("emoji_rules")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("shortcode", shortcode)
    .eq("enabled", true)
    .maybeSingle();
  if (!rule) return { outcome: "ignored", reason: "Deze emoji heeft geen betekenis voor de redactie." };

  const reactor = input.reactorProfileId
    ? (await db.from("profiles").select("id, full_name").eq("id", input.reactorProfileId).maybeSingle()).data
    : await profileBySlackId(db, input.organizationId, input.reactorSlackUserId);

  const reply = (body: string) =>
    sendBotMessage({
      organizationId: input.organizationId,
      kind: "thread_reply",
      medium: "thread",
      slackChannelId: channel.slack_channel_id,
      threadTs: input.ts,
      body,
      responsive: true,
    });

  // 🚫 Never use this message. It is removed, and a marker keeps it from coming back.
  if (rule.action === "exclude") {
    await excludeMessage(db, channel, input.ts);
    await reply("Begrepen. Ik laat dit bericht liggen en bewaar het niet.");
    await logSystemAction(db, {
      organizationId: input.organizationId,
      action: "message.excluded",
      summary: `Een bericht in #${channel.name} is met ${rule.emoji} uitgesloten van gebruik${reactor ? ` door ${reactor.full_name}` : ""}.`,
    });
    return { outcome: "excluded" };
  }

  let message = input.message ?? null;
  if (!message) {
    const token = await slackToken(db, input.organizationId);
    if (!token) return { outcome: "ignored", reason: "Het bericht kon niet worden opgehaald: er is geen Slack-verbinding." };
    const fetched = await fetchSlackMessage(token, channel.slack_channel_id, input.ts);
    if (!fetched) return { outcome: "ignored", reason: "Het bericht bestaat niet meer." };
    message = { text: fetched.text, authorSlackUserId: fetched.user, occurredAt: fetched.occurredAt };
  }

  const stored = await storeSlackMessage(db, channel, input.ts, message, input.isDemo ?? false);
  if (stored.excluded) {
    await reply("Dit bericht is eerder met 🚫 uitgesloten. Ik gebruik het niet.");
    return { outcome: "ignored", reason: "Het bericht is uitgesloten." };
  }

  const plan = EMOJI_PLAN[rule.action as Exclude<EmojiAction, "exclude">];
  const agent: AgentKind = plan.agent ?? (channel.bureau === "external" ? "external" : "internal");
  const { signalId, created } = await signalFromMessage({
    organizationId: input.organizationId,
    messageId: stored.id,
    origin: "emoji",
    emoji: rule.emoji,
    projectId: channel.project_id,
    suggestedAgent: agent,
    force: true,
    trigger: input.trigger,
    triggeredBy: reactor?.id ?? null,
    note: `Aangewezen met ${rule.emoji} (${rule.goal})${reactor ? ` door ${reactor.full_name}` : ""}.`,
  });
  if (!signalId) return { outcome: "ignored", reason: "Het bericht kon niet worden verwerkt." };

  const { data: source } = await db.from("source_messages").select("author_profile_id").eq("id", stored.id).single();
  const projectId = rule.action === "customer_case" ? await ensureProject(db, input.organizationId, signalId, source?.author_profile_id ?? null) : channel.project_id;

  // One story, one topic: a second emoji on the same message adds to the proposal that is already there.
  const { data: open } = await db
    .from("content_opportunities")
    .select("id, title")
    .eq("organization_id", input.organizationId)
    .eq("signal_id", signalId)
    .not("status", "in", "(declined)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let opportunityId = open?.id ?? null;
  if (!opportunityId) {
    const evaluation = await evaluateSignal({
      organizationId: input.organizationId,
      signalId,
      agentKind: agent,
      trigger: input.trigger === "demo" ? "demo" : "event",
      triggeredBy: reactor?.id ?? null,
    });
    opportunityId = evaluation.opportunityId;
    if (opportunityId) {
      await db
        .from("content_opportunities")
        .update({
          suggested_content_type: plan.contentType,
          origin: "emoji",
          project_id: projectId,
          // Whatever the emoji says: a story from an internal-only channel needs an editor's release before it goes external.
          internal_only: channel.confidentiality === "internal_only",
        })
        .eq("id", opportunityId);
    }
  }

  // Research after a new signal; nothing else is read from the channel.
  await looksBack(db, channel, signalId);

  await reply(
    opportunityId && !created && open
      ? `Dank${reactor ? `, ${reactor.full_name.split(" ")[0]}` : ""}. Dit hoort bij een onderwerp dat al bij de redactie ligt (“${open.title}”). Ik heb het toegevoegd.`
      : `Dank${reactor ? `, ${reactor.full_name.split(" ")[0]}` : ""}. Ik leg dit aan de redactie voor als voorstel voor ${plan.what}. Zij beslissen of we het oppakken, en er gaat niets naar buiten zonder akkoord van de betrokkenen.`,
  );

  if (opportunityId && rule.direct_start && !open) {
    // Only when the administrator allowed this emoji to start work without the editors' decision.
    const { pickUpTopic } = await import("@/lib/redactie/topics");
    await pickUpTopic({ organizationId: input.organizationId, opportunityId, by: null, trigger: "event" });
  }
  return { outcome: open ? "existing" : "proposed", opportunityId };
}

async function excludeMessage(db: AdminClient, channel: Channel, ts: string): Promise<void> {
  const externalId = `${channel.slack_channel_id}:${ts}`;
  const { data: existing } = await db
    .from("source_messages")
    .select("id")
    .eq("organization_id", channel.organization_id)
    .eq("source", "slack")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) {
    await removeUnusedSignals(db, channel.organization_id, existing.id);
    await db
      .from("source_messages")
      .update({ excluded: true, body: "[Uitgesloten van gebruik]", title: null, author_name: null, author_profile_id: null, processed_at: new Date().toISOString() })
      .eq("id", existing.id);
    return;
  }
  // Not stored yet: keep an empty marker so the bot never picks it up later.
  await db.from("source_messages").insert({
    organization_id: channel.organization_id,
    source: "slack",
    external_id: externalId,
    channel: `#${channel.name}`,
    channel_id: channel.id,
    slack_ts: ts,
    body: "[Uitgesloten van gebruik]",
    occurred_at: new Date(Number(ts) * 1000 || Date.now()).toISOString(),
    processed_at: new Date().toISOString(),
    excluded: true,
  });
}

/** Removes signals and open proposals that rest on one message, unless a piece was already started. */
async function removeUnusedSignals(db: AdminClient, organizationId: string, messageId: string): Promise<number> {
  const { data: signals } = await db
    .from("content_signals")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("primary_source_id", messageId);
  const signalIds = (signals ?? []).map((signal) => signal.id);
  if (signalIds.length === 0) return 0;
  const { data: linked } = await db.from("article_signals").select("signal_id").in("signal_id", signalIds);
  const inPieces = new Set((linked ?? []).map((row) => row.signal_id));
  const removable = signalIds.filter((id) => !inPieces.has(id));
  if (removable.length === 0) return 0;
  await db.from("content_opportunities").delete().in("signal_id", removable).is("article_id", null);
  await db.from("content_signals").delete().in("id", removable);
  return removable.length;
}

/** Looking back: after a new signal the bot may search the channel's recent history for the same subject. */
async function looksBack(db: AdminClient, channel: Channel, signalId: string): Promise<boolean> {
  const settings = await loadRedactieSettings(db, channel.organization_id);
  const days = Math.min(channel.lookback_days, settings.lookbackMaxDays);
  if (days <= 0) return false;
  const token = await slackToken(db, channel.organization_id);
  if (!token) return false;
  const { data: signal } = await db.from("content_signals").select("entities").eq("id", signalId).single();
  const entities = (signal?.entities ?? {}) as { customer?: string | null; project?: string | null };
  const needles = [entities.customer, entities.project].filter((n): n is string => Boolean(n && n.length > 3));
  if (needles.length === 0) return false;

  try {
    const hits = await searchSlackHistory(token, channel.slack_channel_id, subDays(new Date(), days), needles, 8);
    await mapConcurrent(hits, async (hit) => {
      const stored = await storeSlackMessage(db, channel, hit.ts, { text: hit.text, authorSlackUserId: hit.user, occurredAt: hit.occurredAt }, false);
      if (stored.excluded) return;
      await Promise.all([
        db.from("source_messages").update({ processed_at: new Date().toISOString() }).eq("id", stored.id).is("processed_at", null),
        db
          .from("signal_sources")
          .upsert(
            { signal_id: signalId, source_message_id: stored.id, organization_id: channel.organization_id, relation: "related" },
            { onConflict: "signal_id,source_message_id" },
          ),
      ]);
    });
    return hits.length > 0;
  } catch (error) {
    console.error("[intake] looking back failed", error);
    return false;
  }
}

// =============================================================================
// B. The bot notices something itself
// =============================================================================
export async function handleChannelMessage(input: {
  organizationId: string;
  slackChannelId: string;
  ts: string;
  message: IncomingMessage;
  trigger: Trigger;
  isDemo?: boolean;
}): Promise<{ stored: boolean; opportunityIds: string[]; reason?: string }> {
  const db = createAdminClient();
  if ((await loadRedactieSettings(db, input.organizationId)).botPaused) return { stored: false, opportunityIds: [], reason: "De bot is gepauzeerd." };
  const channel = await followedChannel(db, input.organizationId, input.slackChannelId);
  if (!channel) return { stored: false, opportunityIds: [], reason: "Dit kanaal wordt niet gevolgd." };

  // In an emoji-only channel the bot reads nothing by itself, except messages of people it was told to follow.
  if (channel.follow_mode === "emoji_only") {
    const author = input.message.authorProfileId
      ? (await db.from("profiles").select("bot_follows").eq("id", input.message.authorProfileId).maybeSingle()).data
      : await profileBySlackId(db, input.organizationId, input.message.authorSlackUserId);
    if (!author?.bot_follows) return { stored: false, opportunityIds: [], reason: "In dit kanaal reageert de bot alleen op emoji's." };
  }
  if (input.message.text.trim().length < 20) return { stored: false, opportunityIds: [], reason: "Te kort om nieuws te zijn." };

  const stored = await storeSlackMessage(db, channel, input.ts, input.message, input.isDemo ?? false);
  if (stored.excluded || !stored.isNew) return { stored: false, opportunityIds: [] };

  const result = await processSourceMessages({
    organizationId: input.organizationId,
    messageIds: [stored.id],
    trigger: input.trigger === "demo" ? "demo" : "event",
    autoEvaluate: true,
  });

  // Not news: the message is not kept. Only signals are stored.
  if (result.signalIds.length === 0 && result.duplicateSignalIds.length === 0) {
    await db.from("source_messages").delete().eq("id", stored.id);
    return { stored: false, opportunityIds: [], reason: "Niet nieuwswaardig; het bericht is niet bewaard." };
  }

  // Actief ophalen: ask in the thread for the one thing that is missing most.
  if (channel.follow_mode === "active" && result.signalIds.length > 0) {
    const { data: signal } = await db.from("content_signals").select("missing_information").eq("id", result.signalIds[0]).single();
    const missing = ((signal?.missing_information ?? []) as string[])[0];
    if (missing) {
      await sendBotMessage({
        organizationId: input.organizationId,
        kind: "thread_reply",
        medium: "thread",
        slackChannelId: channel.slack_channel_id,
        threadTs: input.ts,
        body: `Dit klinkt als iets voor de redactie. Eén vraag om het goed voor te kunnen leggen: ${missing.replace(/\.$/, "")}?`,
      });
    }
  }
  return { stored: true, opportunityIds: result.opportunityIds };
}

/** A message that is deleted in Slack disappears here too. */
export async function handleMessageDeleted(input: { organizationId: string; slackChannelId: string; ts: string }): Promise<boolean> {
  const db = createAdminClient();
  const { data: message } = await db
    .from("source_messages")
    .select("id, channel")
    .eq("organization_id", input.organizationId)
    .eq("source", "slack")
    .eq("external_id", `${input.slackChannelId}:${input.ts}`)
    .maybeSingle();
  if (!message) return false;
  const removed = await removeUnusedSignals(db, input.organizationId, message.id);
  await db.from("source_messages").delete().eq("id", message.id);
  await logSystemAction(db, {
    organizationId: input.organizationId,
    action: "message.deleted",
    summary: `Een bericht in ${message.channel ?? "Slack"} is in Slack verwijderd en daarom ook hier verwijderd${removed ? `, samen met ${removed} signaal/signalen zonder stuk` : ""}.`,
  });
  return true;
}

// =============================================================================
// C. Tips: direct message, website form, mailbox
// =============================================================================
export type TipResult = {
  outcome: "new_proposal" | "addition" | "rubric" | "nothing";
  reply: string;
  signalId: string | null;
  opportunityId: string | null;
};

export async function handleTip(input: {
  organizationId: string;
  text: string;
  subject?: string | null;
  senderProfileId: string | null;
  senderName: string;
  via: "dm" | "form" | "mail";
  /** Where the short answer goes. The form shows it on screen. */
  replyTo?: { email?: string | null };
  trigger: Trigger;
  isDemo?: boolean;
}): Promise<TipResult> {
  const db = createAdminClient();
  const origin: SignalOrigin = input.via === "mail" ? "mail" : "tip";

  const { data: openTopics } = await db
    .from("content_opportunities")
    .select("id, title, angle, signal_id")
    .eq("organization_id", input.organizationId)
    .in("status", ["proposed", "accepted", "in_progress", "snoozed"])
    .order("created_at", { ascending: false })
    .limit(40);

  const triage = await withRun(
    {
      organizationId: input.organizationId,
      agentKind: null,
      pipeline: "tip_triage",
      trigger: input.trigger,
      triggeredBy: input.senderProfileId,
      input: { via: input.via },
    },
    async (rt) => {
      rt.use("detect_signals");
      const result = await rt.ai.triageTip({
        text: input.text,
        subject: input.subject,
        senderName: input.senderName,
        organizationName: rt.organization.name,
        openTopics: (openTopics ?? []).map((topic) => ({ id: topic.id, title: topic.title, summary: topic.angle })),
        rubrics: RUBRICS,
      });
      rt.step("triage", "Tip beoordeeld", `${result.outcome}: ${result.reason}`, "detect_signals");
      return result;
    },
  );

  let signalId: string | null = null;
  let opportunityId: string | null = null;
  let outcome = triage.outcome;

  if (outcome !== "nothing") {
    // Only tips the editors can use are kept.
    const { data: message, error } = await db
      .from("source_messages")
      .insert({
        organization_id: input.organizationId,
        source: input.via === "mail" ? "email" : "manual",
        channel: input.via === "mail" ? "Mailbox van de redactie" : input.via === "dm" ? "Privébericht aan de bot" : "Tipformulier",
        author_name: input.senderName,
        author_profile_id: input.senderProfileId,
        title: input.subject ?? null,
        body: input.text,
        occurred_at: new Date().toISOString(),
        is_demo: input.isDemo ?? false,
      })
      .select("id")
      .single();
    if (error || !message) throw new Error(error?.message ?? "Tip kon niet worden opgeslagen.");

    if (outcome === "addition" && triage.topicId) {
      const topic = (openTopics ?? []).find((t) => t.id === triage.topicId);
      opportunityId = topic?.id ?? null;
      signalId = topic?.signal_id ?? null;
      if (signalId) {
        await db
          .from("signal_sources")
          .upsert(
            { signal_id: signalId, source_message_id: message.id, organization_id: input.organizationId, relation: "related" },
            { onConflict: "signal_id,source_message_id" },
          );
      }
      await db.from("source_messages").update({ processed_at: new Date().toISOString() }).eq("id", message.id);
      await logSystemAction(db, {
        organizationId: input.organizationId,
        action: "tip.added",
        category: "discovered",
        entityType: "opportunity",
        entityId: opportunityId,
        summary: `Aanvulling van ${input.senderName} toegevoegd aan het onderwerp “${topic?.title ?? "onbekend"}”.`,
      });
    } else {
      const created = await signalFromMessage({
        organizationId: input.organizationId,
        messageId: message.id,
        origin,
        suggestedAgent: outcome === "rubric" ? "internal" : null,
        force: true,
        trigger: input.trigger,
        triggeredBy: input.senderProfileId,
        note: outcome === "rubric" ? `Voor de vaste rubriek “${triage.rubric}”.` : triage.reason,
      });
      signalId = created.signalId;
      if (signalId && outcome === "rubric") {
        // An item for a fixed section needs no proposal: it waits for the next internal newsletter.
        const { data: signal } = await db.from("content_signals").select("entities").eq("id", signalId).single();
        await db
          .from("content_signals")
          .update({
            entities: toJson({ ...((signal?.entities ?? {}) as Record<string, unknown>), rubric: triage.rubric }),
            suggested_action: `Meenemen in de rubriek “${triage.rubric}” van de interne nieuwsbrief.`,
            audience: "internal",
          })
          .eq("id", signalId);
      } else if (signalId) {
        const evaluation = await evaluateSignal({
          organizationId: input.organizationId,
          signalId,
          trigger: input.trigger === "demo" ? "demo" : "event",
          triggeredBy: input.senderProfileId,
        });
        opportunityId = evaluation.opportunityId ?? evaluation.externalOpportunityId;
      } else {
        outcome = "nothing";
      }
    }
  }

  if (input.via === "dm" && input.senderProfileId) {
    await sendBotMessage({
      organizationId: input.organizationId,
      kind: "notice",
      medium: "dm",
      recipientProfileId: input.senderProfileId,
      body: triage.reply,
      responsive: true,
    });
  } else if (input.via === "mail" && input.replyTo?.email) {
    await sendBotMessage({
      organizationId: input.organizationId,
      kind: "mail_reply",
      medium: "email",
      recipientProfileId: input.senderProfileId,
      recipientLabel: input.replyTo.email,
      body: triage.reply,
      responsive: true,
    });
  }
  return { outcome, reply: triage.reply, signalId, opportunityId };
}

/** The mailbox. Only mail from the organization's own domain is read; everything else is dropped unread. */
export async function handleInboundMail(input: {
  organizationId: string;
  from: string;
  subject: string | null;
  text: string;
  trigger: Trigger;
  isDemo?: boolean;
}): Promise<{ accepted: boolean; reason?: string; result?: TipResult }> {
  const db = createAdminClient();
  const settings = await loadRedactieSettings(db, input.organizationId);
  const address = (input.from.match(/<([^>]+)>/)?.[1] ?? input.from).trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";

  if (!settings.mailDomain) return { accepted: false, reason: "De mailbox staat uit: er is geen eigen domein ingesteld." };
  if (domain !== settings.mailDomain) {
    await logSystemAction(db, {
      organizationId: input.organizationId,
      action: "mail.rejected",
      summary: `Een e-mail van buiten @${settings.mailDomain} is ongelezen geweigerd.`,
    });
    return { accepted: false, reason: `Alleen e-mail van @${settings.mailDomain} wordt verwerkt.` };
  }
  if (settings.botPaused) return { accepted: false, reason: "De bot is gepauzeerd." };

  const { data: sender } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", input.organizationId)
    .eq("email", address)
    .eq("is_active", true)
    .maybeSingle();

  const result = await handleTip({
    organizationId: input.organizationId,
    text: input.text.slice(0, 20_000),
    subject: input.subject,
    senderProfileId: sender?.id ?? null,
    senderName: sender?.full_name ?? address,
    via: "mail",
    replyTo: { email: address },
    trigger: input.trigger,
    isDemo: input.isDemo,
  });
  return { accepted: true, result };
}
