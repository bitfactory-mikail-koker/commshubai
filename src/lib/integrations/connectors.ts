import "server-only";
import { createHmac } from "node:crypto";
import { ErrorCode, WebClient, type UsersListResponse, type WebAPICallError } from "@slack/web-api";
import pLimit from "p-limit";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/secure-compare";
import type { IntegrationProvider, SourceKind } from "@/lib/types";

/**
 * Real connectors, built on the vendors' official HTTP APIs.
 * Each returns plain data; persistence and status handling live in service.ts.
 */

export type ConnectionTest = { ok: boolean; detail: string };

export type IngestMessage = {
  source: SourceKind;
  externalId: string;
  channel: string | null;
  authorName: string | null;
  title: string | null;
  body: string;
  url: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export class ConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorError";
  }
}

const TIMEOUT_MS = 12_000;

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "geen antwoord binnen 12 seconden" : "host niet bereikbaar";
    throw new ConnectorError(`Verbinding mislukt: ${reason}.`);
  }
}

// --- Slack ------------------------------------------------------------------
const SLACK_CONCURRENCY = 4;
const SLACK_RETRIES = 2;
const slackLimit = pLimit(SLACK_CONCURRENCY);

function slackClient(token: string): WebClient {
  return new WebClient(token, { slackApiUrl: env.slackApiUrl, timeout: TIMEOUT_MS, retryConfig: { retries: SLACK_RETRIES } });
}

function slackFailure(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  const failure = error as WebAPICallError;
  switch (failure.code) {
    case ErrorCode.PlatformError:
      return new ConnectorError(`Slack meldt: ${failure.data.error ?? "onbekende fout"}.`);
    case ErrorCode.HTTPError:
      return new ConnectorError(`Slack gaf HTTP ${failure.statusCode}.`);
    case ErrorCode.RateLimitedError:
      return new ConnectorError(`Slack vraagt om ${failure.retryAfter} seconden te wachten.`);
    default:
      return new ConnectorError("Verbinding mislukt: Slack is niet bereikbaar of antwoordt niet op tijd.");
  }
}

async function slackCall<T>(call: (client: WebClient) => Promise<T>, token: string): Promise<T> {
  try {
    return await call(slackClient(token));
  } catch (error) {
    throw slackFailure(error);
  }
}

const listOf = (value: unknown): string[] =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

async function testSlack(config: Record<string, unknown>, secrets: Record<string, string>): Promise<ConnectionTest> {
  const token = secrets.bot_token;
  if (!token) return { ok: false, detail: "Er is geen bot-token opgeslagen." };
  const auth = await slackCall((client) => client.auth.test(), token);
  const channels = listOf(config.channels);
  if (channels.length === 0) return { ok: false, detail: "Geef minimaal één kanaal-ID op." };
  const infos = await Promise.all(
    channels.map((channel) => slackLimit(async () => ({ channel, info: await slackCall((client) => client.conversations.info({ channel }), token) }))),
  );
  for (const { channel, info } of infos) {
    const c = info.channel;
    if (c?.is_private || c?.is_im) {
      return { ok: false, detail: `Kanaal ${channel} is privé. Alleen openbare kanalen zijn toegestaan.` };
    }
    if (!c?.is_member) {
      return { ok: false, detail: `De bot is nog geen lid van #${c?.name ?? channel}. Nodig de bot uit in het kanaal.` };
    }
  }
  return { ok: true, detail: `Verbonden met workspace “${String(auth.team)}” als ${String(auth.user)}; ${channels.length} kanaal/kanalen toegankelijk.` };
}

type RawSlackItem = { channel: string; channelName: string; ts: string; text: string; user: string };

async function channelHistory(token: string, channel: string, since: Date): Promise<RawSlackItem[]> {
  const info = await slackCall((client) => client.conversations.info({ channel }), token);
  if (info.channel?.is_private || info.channel?.is_im) return [];
  const history = await slackCall(
    (client) => client.conversations.history({ channel, oldest: String(Math.floor(since.getTime() / 1000)), limit: 100 }),
    token,
  );
  return (history.messages ?? []).flatMap((m) =>
    m.subtype || m.bot_id || !m.text || m.text.trim().length < 20 || !m.user || !m.ts
      ? []
      : [{ channel, channelName: info.channel?.name ?? channel, ts: m.ts, text: m.text, user: m.user }],
  );
}

async function slackUserName(token: string, user: string): Promise<string> {
  try {
    const result = await slackCall((client) => client.users.info({ user }), token);
    return result.user?.real_name ?? result.user?.name ?? "Onbekend";
  } catch (error) {
    if (error instanceof ConnectorError) return "Onbekend";
    throw error;
  }
}

async function syncSlack(config: Record<string, unknown>, secrets: Record<string, string>, since: Date): Promise<IngestMessage[]> {
  const token = secrets.bot_token;
  if (!token) throw new ConnectorError("Er is geen bot-token opgeslagen.");

  const items = (await Promise.all(listOf(config.channels).map((channel) => slackLimit(() => channelHistory(token, channel, since))))).flat();
  const users = [...new Set(items.map((item) => item.user))];
  const names = new Map(await Promise.all(users.map((user) => slackLimit(async () => [user, await slackUserName(token, user)] as const))));

  return items.map((item) => ({
    source: "slack",
    externalId: `${item.channel}:${item.ts}`,
    channel: `#${item.channelName}`,
    authorName: names.get(item.user) ?? null,
    title: null,
    body: item.text,
    url: null,
    occurredAt: new Date(Number(item.ts) * 1000).toISOString(),
    metadata: { channel_id: item.channel },
  }));
}

export async function postSlackMessage(
  token: string,
  input: { channel: string; text: string; threadTs?: string | null },
): Promise<{ ts: string; channel: string }> {
  const result = await slackCall(
    (client) =>
      client.chat.postMessage({
        channel: input.channel,
        text: input.text,
        ...(input.threadTs ? { thread_ts: input.threadTs } : {}),
        unfurl_links: false,
      }),
    token,
  );
  return { ts: String(result.ts), channel: String(result.channel) };
}

export type SlackMessage = { ts: string; text: string; user: string | null; occurredAt: string };

const toSlackMessage = (m: { ts?: string; text?: string; user?: string }): SlackMessage => ({
  ts: String(m.ts),
  text: m.text ?? "",
  user: m.user ?? null,
  occurredAt: new Date(Number(m.ts) * 1000).toISOString(),
});

export async function fetchSlackMessage(token: string, channel: string, ts: string): Promise<SlackMessage | null> {
  const history = await slackCall((client) => client.conversations.history({ channel, latest: ts, oldest: ts, inclusive: true, limit: 1 }), token);
  const message = history.messages?.[0];
  if (!message || message.bot_id || !message.text) return null;
  return toSlackMessage(message);
}

export async function searchSlackHistory(token: string, channel: string, since: Date, terms: string[], max: number): Promise<SlackMessage[]> {
  const history = await slackCall(
    (client) => client.conversations.history({ channel, oldest: String(Math.floor(since.getTime() / 1000)), limit: 200 }),
    token,
  );
  const needles = terms.map((term) => term.toLowerCase());
  return (history.messages ?? [])
    .filter((m) => !m.subtype && !m.bot_id && m.text && needles.some((n) => m.text!.toLowerCase().includes(n)))
    .slice(0, max)
    .map(toSlackMessage);
}

export type SlackChannelInfo = { id: string; name: string; isPrivate: boolean; hasExternalMembers: boolean; isMember: boolean };

export async function slackChannelInfo(token: string, channel: string): Promise<SlackChannelInfo> {
  const info = await slackCall((client) => client.conversations.info({ channel }), token);
  const c = info.channel;
  return {
    id: c?.id ?? channel,
    name: c?.name ?? channel,
    isPrivate: Boolean(c?.is_private || c?.is_im || c?.is_mpim),
    hasExternalMembers: Boolean(c?.is_ext_shared || c?.is_shared),
    isMember: Boolean(c?.is_member),
  };
}

export type SlackMember = { id: string; name: string; email: string | null; title: string | null; isGuest: boolean };

export async function listSlackMembers(token: string): Promise<SlackMember[]> {
  const members: SlackMember[] = [];
  const pages = slackClient(token).paginate("users.list", { limit: 200 });
  try {
    for await (const page of pages) {
      for (const u of (page as UsersListResponse).members ?? []) {
        if (u.deleted || u.is_bot || !u.id || u.id === "USLACKBOT") continue;
        members.push({
          id: u.id,
          name: u.profile?.real_name ?? u.real_name ?? u.name ?? u.id,
          email: u.profile?.email?.toLowerCase() ?? null,
          title: u.profile?.title || null,
          isGuest: Boolean(u.is_restricted || u.is_ultra_restricted),
        });
      }
    }
  } catch (error) {
    throw slackFailure(error);
  }
  return members;
}

/** Verifies the signature Slack puts on every request to our endpoints. */
export function verifySlackSignature(input: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = input;
  if (!signingSecret || !timestamp || !signature) return false;
  const age = Math.abs((input.now ?? Date.now()) / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false; // replay protection
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return safeEqual(signature, expected);
}

// --- Jira -------------------------------------------------------------------
function jiraAuth(config: Record<string, unknown>, secrets: Record<string, string>) {
  const baseUrl = String(config.base_url ?? "").replace(/\/+$/, "");
  const email = String(config.email ?? "");
  if (!/^https:\/\//.test(baseUrl)) throw new ConnectorError("De Jira-URL moet met https:// beginnen.");
  if (!email || !secrets.api_token) throw new ConnectorError("E-mailadres of API-token ontbreekt.");
  return {
    baseUrl,
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${secrets.api_token}`).toString("base64")}`,
      Accept: "application/json",
    },
  };
}

async function testJira(config: Record<string, unknown>, secrets: Record<string, string>): Promise<ConnectionTest> {
  const { baseUrl, headers } = jiraAuth(config, secrets);
  const response = await request(`${baseUrl}/rest/api/3/myself`, { headers });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, detail: "Jira weigert de inloggegevens. Controleer e-mailadres en API-token." };
  }
  if (!response.ok) return { ok: false, detail: `Jira gaf HTTP ${response.status}.` };
  const me = (await response.json()) as { displayName?: string };
  if (listOf(config.project_keys).length === 0) return { ok: false, detail: "Geef minimaal één projectsleutel op." };
  return { ok: true, detail: `Verbonden met ${baseUrl} als ${me.displayName ?? "onbekend"}.` };
}

/** Flattens Atlassian Document Format to plain text. */
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  const inner = (n.content ?? []).map(adfToText).join("");
  return ["paragraph", "heading", "listItem"].includes(n.type ?? "") ? `${inner}\n` : inner;
}

async function syncJira(config: Record<string, unknown>, secrets: Record<string, string>): Promise<IngestMessage[]> {
  const { baseUrl, headers } = jiraAuth(config, secrets);
  const keys = listOf(config.project_keys).filter((k) => /^[A-Z][A-Z0-9_]+$/.test(k));
  if (keys.length === 0) throw new ConnectorError("Geen geldige projectsleutels opgegeven.");
  const jql = `project in (${keys.join(",")}) AND statusCategory = Done AND resolved >= -14d AND issuetype in (Epic, Story, Task) ORDER BY resolved DESC`;
  const params = new URLSearchParams({
    jql,
    maxResults: "50",
    fields: "summary,description,resolutiondate,issuetype,assignee,project",
  });
  const response = await request(`${baseUrl}/rest/api/3/search/jql?${params}`, { headers });
  if (!response.ok) throw new ConnectorError(`Jira gaf HTTP ${response.status} bij het ophalen van issues.`);
  const json = (await response.json()) as {
    issues?: {
      key: string;
      fields: {
        summary?: string;
        description?: unknown;
        resolutiondate?: string;
        issuetype?: { name?: string };
        assignee?: { displayName?: string } | null;
        project?: { name?: string; key?: string };
      };
    }[];
  };
  return (json.issues ?? []).map((issue) => ({
    source: "jira" as const,
    externalId: issue.key,
    channel: issue.fields.project?.key ?? null,
    authorName: issue.fields.assignee?.displayName ?? null,
    title: `${issue.key}: ${issue.fields.summary ?? ""} (afgerond)`,
    body: `${issue.fields.issuetype?.name ?? "Issue"} afgerond in project ${issue.fields.project?.name ?? ""}. ${adfToText(issue.fields.description).trim()}`.trim(),
    url: `${baseUrl}/browse/${issue.key}`,
    occurredAt: issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate).toISOString() : new Date().toISOString(),
    metadata: { project: issue.fields.project?.name ?? null, issue_type: issue.fields.issuetype?.name ?? null },
  }));
}

// --- CMS webhook ------------------------------------------------------------
export function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export async function postCmsWebhook(
  config: Record<string, unknown>,
  secrets: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<ConnectionTest> {
  const url = String(config.webhook_url ?? "");
  if (!/^https?:\/\//.test(url)) return { ok: false, detail: "De webhook-URL is ongeldig." };
  if (!secrets.signing_secret || secrets.signing_secret.length < 16) {
    return { ok: false, detail: "Het ondertekeningsgeheim ontbreekt of is korter dan 16 tekens." };
  }
  const body = JSON.stringify(payload);
  const response = await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CommsHub-Signature": signPayload(body, secrets.signing_secret),
      "X-CommsHub-Event": String(payload.event ?? "unknown"),
    },
    body,
  });
  if (!response.ok) return { ok: false, detail: `De webhook antwoordde met HTTP ${response.status}.` };
  return { ok: true, detail: `De webhook antwoordde met HTTP ${response.status}.` };
}

// --- Dispatch ---------------------------------------------------------------
export function hasConnector(provider: IntegrationProvider): boolean {
  return provider === "slack" || provider === "jira" || provider === "cms";
}

export async function testConnection(
  provider: IntegrationProvider,
  config: Record<string, unknown>,
  secrets: Record<string, string>,
): Promise<ConnectionTest> {
  try {
    switch (provider) {
      case "slack":
        return await testSlack(config, secrets);
      case "jira":
        return await testJira(config, secrets);
      case "cms":
        return await postCmsWebhook(config, secrets, { event: "ping", sent_at: new Date().toISOString() });
      default:
        return {
          ok: false,
          detail: "Voor deze integratie is nog geen live koppeling beschikbaar: de OAuth-autorisatie is in deze MVP niet gebouwd.",
        };
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Onbekende fout." };
  }
}

export async function fetchMessages(
  provider: IntegrationProvider,
  config: Record<string, unknown>,
  secrets: Record<string, string>,
  since: Date,
): Promise<IngestMessage[]> {
  switch (provider) {
    case "slack":
      return syncSlack(config, secrets, since);
    case "jira":
      return syncJira(config, secrets);
    default:
      throw new ConnectorError("Deze integratie levert (nog) geen berichten aan.");
  }
}
