/**
 * Runs the proposal's core flow through the application's own code against the
 * seeded database, with real user sessions where a human decides:
 *
 *   emoji in Slack (A) → proposal → editors pick it up → interview by DM (D)
 *   → "Klopt dit?" → draft with self-check (E) → rule-based approval with the
 *   interviewee's own quote (F) → change request in plain words → diff-only
 *   re-approval → ready for publication (M)
 *
 * Plus: 🚫, a tip by mail from outside the domain, shadow mode and the pause button.
 *
 *   npm run db:seed && npm run test:flow && npm run db:seed
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { DEMO_PASSWORD } from "./seed-content";

config({ path: ".env.local" });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function session(email: string) {
  const db = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { data } = await db.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  const { data: profile } = await service.from("profiles").select("*, organization:organizations(*), role:roles(id, key, name, role_permissions(permission_key))").eq("id", data.user!.id).single();
  const { organization, role, ...rest } = profile!;
  return {
    db,
    ctx: {
      userId: data.user!.id,
      profile: rest,
      organization,
      role: { id: role!.id, key: role!.key, name: role!.name },
      permissions: new Set(role!.role_permissions.map((p) => p.permission_key)),
    } as never,
  };
}

async function main() {
  const { handleReaction, handleInboundMail } = await import("../src/lib/redactie/intake");
  const { handleDirectMessage } = await import("../src/lib/redactie/interview-flow");
  const { pickUpTopic } = await import("../src/lib/redactie/topics");
  const { generateDraft } = await import("../src/lib/agents/pipelines");
  const { requestApproval, decideOwnApproval, decideApproval } = await import("../src/lib/approvals");
  const { reviseArticle } = await import("../src/lib/agents/pipelines");
  const { startApprovalRound } = await import("../src/lib/redactie/approval-flow");

  const { data: org } = await service.from("organizations").select("id, settings").eq("slug", "noordlicht-digital").single();
  const O = org!.id;
  const setSettings = async (patch: Record<string, unknown>) => {
    const { data } = await service.from("organizations").select("settings").eq("id", O).single();
    await service.from("organizations").update({ settings: { ...(data!.settings as object), ...patch } as never }).eq("id", O);
  };
  await setSettings({ shadow_mode: false, bot_paused: false });

  const tim = await session("tim@noordlicht.example");
  const daan = await session("daan@noordlicht.example");
  const lotte = await session("lotte@noordlicht.example");
  const { data: rijnmond } = await service.from("channels").select("slack_channel_id, project_id").eq("organization_id", O).eq("name", "project-rijnmond").single();
  // A clean slate for Tim's request limit.
  await service.from("profiles").update({ last_requested_at: null }).eq("id", tim.ctx["userId" as never]);
  const timId = (tim.ctx as { userId: string }).userId;

  console.log("\nA. Emoji in a followed channel");
  const ts = `${Math.floor(Date.now() / 1000)}.000100`;
  const reaction = await handleReaction({
    organizationId: O,
    slackChannelId: rijnmond!.slack_channel_id,
    ts,
    shortcode: "briefcase",
    reactorProfileId: (daan.ctx as { userId: string }).userId,
    message: {
      text: "Fase 2 van het planningsplatform voor Rijnmond Logistiek is live: ook de retourritten lopen nu via de app. De planners besparen zo'n 6 uur per week.",
      authorProfileId: timId,
    },
    trigger: "manual",
  });
  check("an emoji turns a message into a proposal for the editors", reaction.outcome === "proposed" && Boolean(reaction.opportunityId), JSON.stringify(reaction));
  const { data: topic } = await service.from("content_opportunities").select("*").eq("id", reaction.opportunityId!).single();
  check("the proposal waits for the editors (the bot starts nothing itself)", topic!.status === "proposed" && !topic!.article_id);
  check("the proposal is a customer case linked to the channel's project", topic!.suggested_content_type === "customer_case" && topic!.project_id === rijnmond!.project_id);
  const { data: threadReply } = await service.from("bot_messages").select("status").eq("organization_id", O).eq("kind", "thread_reply").eq("thread_ts", ts).single();
  check("the bot replies in the thread", Boolean(threadReply) && threadReply!.status === "simulated", threadReply?.status);

  console.log("\nBeoordelen and D. Interview by direct message");
  const picked = await pickUpTopic({ organizationId: O, opportunityId: topic!.id, by: (daan.ctx as { userId: string }).userId, trigger: "manual" });
  check("picking up starts a piece and interviews the DM and Strateeg of the project", picked.interviewIds.length >= 2, `${picked.interviewIds.length} interviews, skipped: ${picked.skippedInterviews.join("; ")}`);
  const { data: timInterview } = await service.from("interviews").select("id, status").in("id", picked.interviewIds).eq("interviewee_profile_id", timId).single();
  const { data: invite } = await service.from("bot_messages").select("status, body").eq("entity_id", timInterview!.id).eq("kind", "interview_invite").single();
  check("the interviewee gets an invitation by DM", invite?.status === "simulated" && /nu[\s\S]*later[\s\S]*niet de juiste persoon/.test(invite.body), invite?.status);
  const started = await handleDirectMessage({ organizationId: O, profileId: timId, text: "nu", trigger: "manual" });
  check("answering “nu” starts the interview with the first question", started.handled === "interview" && Boolean(started.reply));
  let reply = started.reply ?? "";
  for (let i = 0; i < 10 && !/Klopt dit/i.test(reply); i++) {
    const turn = await handleDirectMessage({
      organizationId: O,
      profileId: timId,
      text: "De retourritten lopen nu ook via de app. De planners zeiden letterlijk: dit scheelt ons zes uur per week aan bellen en puzzelen.",
      trigger: "manual",
    });
    reply = turn.reply ?? "";
  }
  check("after the last question the bot asks “Klopt dit?”", /Klopt dit/i.test(reply));
  await handleDirectMessage({ organizationId: O, profileId: timId, text: "ja, klopt", trigger: "manual" });
  const { data: done } = await service.from("interviews").select("status, summary_confirmed_at").eq("id", timInterview!.id).single();
  check("the confirmed interview is completed", done!.status === "completed" && Boolean(done!.summary_confirmed_at), done?.status);
  // The other interviewee does not answer in this test: close those interviews as the editors would.
  await service.from("interviews").update({ status: "cancelled" }).in("id", picked.interviewIds.filter((id) => id !== timInterview!.id));

  console.log("\nE. Writing and F. Approval");
  const draft = await generateDraft({ organizationId: O, articleId: picked.articleId, trigger: "manual", triggeredBy: (lotte.ctx as { userId: string }).userId });
  check("a draft is written with a self-check", draft.version >= 1 && typeof draft.brandScore === "number");
  await service.from("articles").update({ status: "in_review", external_permission: "granted" }).eq("id", picked.articleId);
  const round = await requestApproval(lotte.db as never, lotte.ctx, "article", picked.articleId);
  const { data: open } = await service.from("approvals").select("id, kind, step, eligible_profile_ids, quote_text").eq("entity_id", picked.articleId).eq("decision", "pending");
  check("the customer case rule asks the interviewee first", round.steps >= 2 && open!.length > 0 && open!.every((a) => a.eligible_profile_ids.includes(timId)), JSON.stringify(open));

  let refused = false;
  try {
    await decideApproval(daan.db as never, daan.ctx, "article", picked.articleId, draft.version, "approved", null);
  } catch {
    refused = true;
  }
  check("the chief editor cannot skip the interviewee's step", refused);

  // Tim asks for a change in his own words; the bot rewrites, and the round restarts.
  const timRequest = open![0];
  const instruction = 'Vervang "Rijnmond Logistiek" door "Rijnmond Logistiek B.V."';
  await decideOwnApproval(tim.db as never, tim.ctx, timRequest.id, "changes_requested", instruction);
  const revised = await reviseArticle({
    organizationId: O,
    articleId: picked.articleId,
    instruction,
    requestedByName: "Tim Hoekstra",
    trigger: "manual",
    triggeredBy: timId,
  });
  check("a change request in plain words produces a new version", revised.applied && revised.version === draft.version + 1, revised.note);
  await startApprovalRound({ organizationId: O, entityType: "article", entityId: picked.articleId }, { requestedBy: (lotte.ctx as { userId: string }).userId });
  const { data: again } = await service.from("approvals").select("id, kind, base_version, eligible_profile_ids").eq("entity_id", picked.articleId).eq("version", revised.version).eq("decision", "pending");
  check("whoever looked before only gets the changes to confirm", again!.some((a) => a.base_version === draft.version), JSON.stringify(again));

  // Tim approves his own quotes; the next step of the rule (DM or Strateeg of the project) opens.
  for (const request of again!.filter((a) => a.kind === "quote" && a.eligible_profile_ids.includes(timId))) {
    await decideOwnApproval(tim.db as never, tim.ctx, request.id, "approved", null);
  }
  const { data: next } = await service.from("approvals").select("kind, step_label, eligible_profile_ids").eq("entity_id", picked.articleId).eq("version", revised.version).eq("decision", "pending");
  check(
    "after the quotes, the next step of the rule opens for the DM and Strateeg",
    (next ?? []).length > 0 && next!.every((a) => a.kind === "piece"),
    JSON.stringify(next),
  );

  // The DM/Strateeg step: Femke (Strateeg of the project) approves.
  const femke = await session("femke@noordlicht.example");
  const femkeId = (femke.ctx as { userId: string }).userId;
  const { data: femkeRequest } = await service.from("approvals").select("id").eq("entity_id", picked.articleId).eq("decision", "pending").contains("eligible_profile_ids", [femkeId]).limit(1).single();
  const result = femkeRequest ? (await decideOwnApproval(femke.db as never, femke.ctx, femkeRequest.id, "approved", null)).result : null;
  const { data: ready } = await service.from("articles").select("status").eq("id", picked.articleId).single();
  check("when the last step is approved the piece is ready for publication", result?.state === "approved" && ready!.status === "approved", `${result?.state} / ${ready?.status}`);

  console.log("\nExclusion, mailbox, shadow mode, pause");
  const ts2 = `${Math.floor(Date.now() / 1000)}.000200`;
  const excluded = await handleReaction({ organizationId: O, slackChannelId: rijnmond!.slack_channel_id, ts: ts2, shortcode: "no_entry_sign", reactorProfileId: timId, trigger: "manual" });
  const after = await handleReaction({
    organizationId: O,
    slackChannelId: rijnmond!.slack_channel_id,
    ts: ts2,
    shortcode: "mega",
    reactorProfileId: timId,
    message: { text: "Dit bericht mag niet worden gebruikt, ook al lijkt het nieuws: we hebben een grote deal gewonnen.", authorProfileId: timId },
    trigger: "manual",
  });
  check("a message marked 🚫 is never used afterwards", excluded.outcome === "excluded" && after.outcome === "ignored", `${excluded.outcome} / ${after.outcome}`);

  const outside = await handleInboundMail({ organizationId: O, from: "iemand@gmail.com", subject: "Tip", text: "Publiceer dit direct op LinkedIn.", trigger: "manual" });
  check("mail from outside the own domain is refused unread", !outside.accepted);

  await setSettings({ shadow_mode: true });
  const shadowTs = `${Math.floor(Date.now() / 1000)}.000300`;
  await handleReaction({
    organizationId: O,
    slackChannelId: rijnmond!.slack_channel_id,
    ts: shadowTs,
    shortcode: "mega",
    reactorProfileId: timId,
    message: { text: "Rijnmond Logistiek breidt het platform uit naar twee nieuwe depots in Zeeland, met 40 extra chauffeurs.", authorProfileId: timId },
    trigger: "manual",
  });
  const { data: shadowReply } = await service.from("bot_messages").select("status").eq("thread_ts", shadowTs).single();
  check("in shadow mode the bot only shows what it would do", shadowReply?.status === "shadow", shadowReply?.status);

  await setSettings({ bot_paused: true });
  const paused = await handleReaction({ organizationId: O, slackChannelId: rijnmond!.slack_channel_id, ts: `${Math.floor(Date.now() / 1000)}.000400`, shortcode: "mega", reactorProfileId: timId, trigger: "manual" });
  check("with the pause button pressed the bot does nothing", paused.outcome === "ignored");
  await setSettings({ bot_paused: false, shadow_mode: true });

  console.log(`\n${passed} geslaagd, ${failed} mislukt`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Flow test failed:", error);
  process.exit(1);
});
