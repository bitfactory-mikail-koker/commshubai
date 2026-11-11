import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConnectorError,
  fetchSlackMessage,
  listSlackMembers,
  postSlackMessage,
  searchSlackHistory,
  slackChannelInfo,
} from "@/lib/integrations/connectors";

type Call = { method: string; body: Record<string, string> };

let server: Server;
const calls: Call[] = [];
let usersPage = 0;

const RESPONSES: Record<string, (body: Record<string, string>) => Record<string, unknown>> = {
  "chat.postMessage": (body) => ({ ok: true, ts: "1700000000.000100", channel: body.channel }),
  "conversations.info": (body) =>
    body.channel === "CMISSING"
      ? { ok: false, error: "channel_not_found" }
      : { ok: true, channel: { id: body.channel, name: "project-x", is_private: false, is_member: true, is_shared: false } },
  "conversations.history": () => ({
    ok: true,
    messages: [
      { ts: "1700000001.000000", text: "Klantcase live gegaan bij Veldhuis", user: "U1" },
      { ts: "1700000002.000000", text: "bot bericht", bot_id: "B1" },
      { ts: "1700000003.000000", text: "joined", subtype: "channel_join", user: "U2" },
      { ts: "1700000004.000000", text: "Iets heel anders", user: "U3" },
    ],
  }),
  "users.list": () => {
    usersPage++;
    return usersPage === 1
      ? {
          ok: true,
          members: [
            { id: "U1", name: "tim", profile: { real_name: "Tim Hoekstra", email: "TIM@Noordlicht.example", title: "DM" } },
            { id: "UBOT", is_bot: true },
            { id: "UGONE", deleted: true },
            { id: "UGUEST", name: "gast", is_restricted: true },
          ],
          response_metadata: { next_cursor: "page2" },
        }
      : { ok: true, members: [{ id: "U9", name: "sanne" }], response_metadata: { next_cursor: "" } };
  },
};

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const method = (request.url ?? "").replace(/^\//, "").split("?")[0];
      const params = new URLSearchParams(Buffer.concat(chunks).toString());
      const body = Object.fromEntries(params.entries());
      calls.push({ method, body });
      const handler = RESPONSES[method];
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(handler ? handler(body) : { ok: false, error: "unknown_method" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SLACK_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(() => {
  delete process.env.SLACK_API_URL;
  server.close();
});

describe("Slack connector on the official client", () => {
  it("posts a message and returns where it landed", async () => {
    const result = await postSlackMessage("xoxb-test", { channel: "C1", text: "Hoi", threadTs: "1.2" });
    expect(result).toEqual({ ts: "1700000000.000100", channel: "C1" });
    const call = calls.find((c) => c.method === "chat.postMessage");
    expect(call?.body).toMatchObject({ channel: "C1", text: "Hoi", thread_ts: "1.2" });
  });

  it("reads channel facts", async () => {
    expect(await slackChannelInfo("xoxb-test", "C1")).toEqual({
      id: "C1",
      name: "project-x",
      isPrivate: false,
      hasExternalMembers: false,
      isMember: true,
    });
  });

  it("turns a Slack error into a Dutch connector error", async () => {
    await expect(slackChannelInfo("xoxb-test", "CMISSING")).rejects.toThrow(new ConnectorError("Slack meldt: channel_not_found."));
  });

  it("finds messages by term and skips bots and joins", async () => {
    const found = await searchSlackHistory("xoxb-test", "C1", new Date("2023-11-01T00:00:00Z"), ["veldhuis"], 8);
    expect(found.map((m) => m.text)).toEqual(["Klantcase live gegaan bij Veldhuis"]);
    expect(found[0].occurredAt).toBe(new Date(1700000001 * 1000).toISOString());
  });

  it("fetches one message by timestamp and ignores bot messages", async () => {
    const message = await fetchSlackMessage("xoxb-test", "C1", "1700000001.000000");
    expect(message?.user).toBe("U1");
  });

  it("follows pagination and filters bots, deleted users and the Slackbot", async () => {
    usersPage = 0;
    const members = await listSlackMembers("xoxb-test");
    expect(members.map((m) => m.id)).toEqual(["U1", "UGUEST", "U9"]);
    expect(members[0]).toMatchObject({ name: "Tim Hoekstra", email: "tim@noordlicht.example", title: "DM", isGuest: false });
    expect(members[1].isGuest).toBe(true);
  });

  it("reports an unreachable Slack as a connector error", async () => {
    const previous = process.env.SLACK_API_URL;
    process.env.SLACK_API_URL = "http://127.0.0.1:1/";
    try {
      await expect(slackChannelInfo("xoxb-test", "C1")).rejects.toBeInstanceOf(ConnectorError);
    } finally {
      process.env.SLACK_API_URL = previous;
    }
  }, 30_000);
});
