import "server-only";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { createInterview, pairQuestionsAndAnswers } from "@/lib/agents/pipelines";
import { withRun } from "@/lib/agents/runtime";
import type { TranscriptEntry } from "@/lib/ai/types";
import { logSystemAction } from "@/lib/audit";
import { toZoned } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { appLink, loadRedactieSettings, sendBotMessage } from "@/lib/redactie/bot";
import { isoDay } from "@/lib/redactie/conduct";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Channel, InterviewQuestion, OutreachGroup, Rhythm, RhythmKey } from "@/lib/types";

/**
 * Vaste ritmes: the monthly team round, the MD-update twice a month, the two
 * newsletters and the weekly overview for the editors. Plus the bot's periodic
 * explanation in every channel it follows.
 */

type Trigger = "manual" | "schedule" | "event" | "demo";

// --- Groups -------------------------------------------------------------------
export async function groupMembers(db: AdminClient, group: Pick<OutreachGroup, "id" | "organization_id" | "member_kind" | "functional_role_id" | "team_id">) {
  let ids: string[] = [];
  if (group.member_kind === "role" && group.functional_role_id) {
    const { data } = await db.from("profile_functional_roles").select("profile_id").eq("functional_role_id", group.functional_role_id);
    ids = (data ?? []).map((r) => r.profile_id);
  } else if (group.member_kind === "team" && group.team_id) {
    const { data } = await db.from("profiles").select("id").eq("organization_id", group.organization_id).eq("team_id", group.team_id);
    ids = (data ?? []).map((r) => r.id);
  } else {
    const { data } = await db.from("outreach_group_members").select("profile_id").eq("group_id", group.id);
    ids = (data ?? []).map((r) => r.profile_id);
  }
  if (ids.length === 0) return [];
  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, job_title")
    .eq("organization_id", group.organization_id)
    .eq("is_active", true)
    .in("id", ids)
    .order("full_name");
  return profiles ?? [];
}

/** Asks every member of a group for input, by direct message. Their answers come back as tips. */
export async function runOutreachRound(options: {
  organizationId: string;
  groupId: string;
  now?: Date;
}): Promise<{ asked: number; held: number; blocked: { name: string; reason: string }[] }> {
  const db = createAdminClient();
  const { data: group } = await db.from("outreach_groups").select("*").eq("organization_id", options.organizationId).eq("id", options.groupId).single();
  if (!group) throw new Error("Groep niet gevonden.");
  const settings = await loadRedactieSettings(db, options.organizationId);
  const members = await groupMembers(db, group);

  let asked = 0;
  let held = 0;
  const blocked: { name: string; reason: string }[] = [];
  for (const member of members) {
    const result = await sendBotMessage({
      organizationId: options.organizationId,
      kind: "input_request",
      medium: "dm",
      recipientProfileId: member.id,
      countsAsRequest: true,
      entityType: "outreach_group",
      entityId: group.id,
      now: options.now,
      body: [
        `Hoi ${member.full_name.split(" ")[0]}, ik ben de ${settings.botName}, de bot van de redactie.`,
        group.goal.trim() ||
          (group.bureau === "external"
            ? "Is er de afgelopen tijd iets gebeurd dat klanten en relaties zouden moeten weten? Denk aan een oplevering, een resultaat of een nieuwe klant."
            : "Wat is er de afgelopen tijd in jouw team gebeurd dat collega's zouden moeten weten?"),
        "Antwoord gerust in een paar zinnen. Ik leg het voor aan de redactie; zij beslissen of we er iets mee doen. Niets te melden? Dan hoef je niets te doen.",
      ].join("\n\n"),
    });
    if (result.status === "blocked") blocked.push({ name: member.full_name, reason: result.reason ?? "" });
    else if (result.status === "shadow" || result.status === "scheduled") held++;
    else asked++;
  }

  await db.from("outreach_groups").update({ last_run_at: (options.now ?? new Date()).toISOString() }).eq("id", group.id);
  await logSystemAction(db, {
    organizationId: options.organizationId,
    action: "outreach.round",
    category: "requested",
    summary: `Inputronde “${group.name}”: ${asked} verstuurd, ${held} vastgehouden (schaduwmodus of buiten werktijd), ${blocked.length} tegengehouden.`,
    metadata: { group_id: group.id, blocked },
  });
  return { asked, held, blocked };
}

// --- MD-update ------------------------------------------------------------------
async function mdProfiles(db: AdminClient, organizationId: string, rhythm: Rhythm | null) {
  if (rhythm?.group_id) {
    const { data: group } = await db.from("outreach_groups").select("*").eq("id", rhythm.group_id).maybeSingle();
    if (group) return groupMembers(db, group);
  }
  const { data: role } = await db.from("functional_roles").select("id").eq("organization_id", organizationId).eq("key", "md").maybeSingle();
  if (!role) return [];
  return groupMembers(db, { id: "", organization_id: organizationId, member_kind: "role", functional_role_id: role.id, team_id: null });
}

/**
 * Starts an MD-update: a new edition, and a short interview with every MD.
 * The edition is compiled from their answers (composeMdUpdate).
 */
export async function startMdUpdate(options: {
  organizationId: string;
  date?: Date;
  trigger: Trigger;
  triggeredBy?: string | null;
}): Promise<{ newsletterId: string; created: boolean; interviews: number; skipped: string[] }> {
  const db = createAdminClient();
  const date = options.date ?? new Date();
  const day = isoDay(date);
  const label = format(toZoned(date), "d MMMM yyyy", { locale: nl });

  const { data: existing } = await db
    .from("newsletters")
    .select("id")
    .eq("organization_id", options.organizationId)
    .eq("kind", "internal")
    .eq("edition_type", "md_update")
    .eq("period_month", day)
    .maybeSingle();
  if (existing) return { newsletterId: existing.id, created: false, interviews: 0, skipped: [] };

  const { data: rhythm } = await db.from("rhythms").select("*").eq("organization_id", options.organizationId).eq("key", "md_update").maybeSingle();
  const { data: agent } = await db.from("agents").select("id").eq("organization_id", options.organizationId).eq("kind", "internal").single();
  const { data: edition, error } = await db
    .from("newsletters")
    .insert({
      organization_id: options.organizationId,
      kind: "internal",
      edition_type: "md_update",
      title: `MD-update ${label}`,
      subject: `MD-update ${label}`,
      period_month: day,
      status: "draft",
      intro_html: "<p>Wat er speelt, in de woorden van de MD's zelf. Per thema lees je wie wat zei.</p>",
      outro_html: "",
      agent_id: agent?.id ?? null,
      created_by: options.triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (error || !edition) throw new Error(error?.message ?? "De editie kon niet worden aangemaakt.");

  const people = await mdProfiles(db, options.organizationId, rhythm ?? null);
  const skipped: string[] = [];
  let interviews = 0;
  for (const person of people) {
    try {
      await createInterview({
        organizationId: options.organizationId,
        trigger: options.trigger,
        triggeredBy: options.triggeredBy,
        agentKind: "internal",
        title: `MD-update ${label}: ${person.full_name}`,
        purpose: "Collega's in een paar alinea's vertellen wat er de afgelopen twee weken speelde en wat eraan komt",
        kind: "management",
        classification: "internal",
        intervieweeProfileId: person.id,
        intervieweeName: person.full_name,
        intervieweeRole: person.job_title,
        questionCount: 4,
        metadata: { edition_id: edition.id },
      });
      interviews++;
    } catch (e) {
      skipped.push(`${person.full_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (people.length === 0) skipped.push("Er is niemand met de rol MD. Wijs de rol toe bij Mensen en rollen.");

  await logSystemAction(db, {
    organizationId: options.organizationId,
    action: "md_update.started",
    category: "requested",
    entityType: "newsletter",
    entityId: edition.id,
    summary: `MD-update ${label} gestart: ${interviews} MD('s) uitgenodigd voor een kort interview.`,
  });
  return { newsletterId: edition.id, created: true, interviews, skipped };
}

/**
 * Compiles the edition from the interviews that are done: ordered by theme,
 * with who said it. Each passage rests on one MD's own answers; that MD
 * approves it before the edition can go out. An MD who did not answer is not
 * in the edition.
 */
export async function composeMdUpdate(options: {
  organizationId: string;
  newsletterId: string;
  trigger: Trigger;
  triggeredBy?: string | null;
}): Promise<{ themes: number; passages: number; contributors: number; missing: string[]; [k: string]: unknown }> {
  return withRun(
    {
      organizationId: options.organizationId,
      agentKind: "internal",
      pipeline: "md_update",
      trigger: options.trigger,
      triggeredBy: options.triggeredBy,
      input: { newsletter_id: options.newsletterId },
    },
    async (rt) => {
      rt.use("prepare_internal_newsletter");
      const { data: edition } = await rt.db
        .from("newsletters")
        .select("id, title, status, current_version, edition_type")
        .eq("organization_id", rt.orgId)
        .eq("id", options.newsletterId)
        .single();
      if (!edition || edition.edition_type !== "md_update") throw new Error("Dit is geen MD-update.");
      if (!["draft", "changes_requested"].includes(edition.status)) {
        throw new Error("Deze editie is al ingediend. Heropen haar als concept om haar opnieuw samen te stellen.");
      }

      const { data: interviews } = await rt.db
        .from("interviews")
        .select("id, status, interviewee_profile_id, interviewee_name, questions")
        .eq("organization_id", rt.orgId)
        .eq("kind", "management")
        .contains("metadata", { edition_id: edition.id });
      const done = (interviews ?? []).filter((i) => i.status === "completed" && i.interviewee_profile_id);
      const missing = (interviews ?? []).filter((i) => i.status !== "completed").map((i) => i.interviewee_name);
      if (done.length === 0) throw new Error("Nog geen enkele MD heeft het interview afgerond.");

      const contributions = [];
      for (const interview of done) {
        const { data: messages } = await rt.db
          .from("interview_messages")
          .select("role, content, question_id")
          .eq("interview_id", interview.id)
          .order("created_at", { ascending: true });
        const transcript: TranscriptEntry[] = (messages ?? []).map((m) => ({
          role: m.role as "agent" | "interviewee",
          content: m.content,
          questionId: m.question_id,
        }));
        contributions.push({
          speakerId: interview.interviewee_profile_id as string,
          speakerName: interview.interviewee_name,
          interviewId: interview.id,
          qa: pairQuestionsAndAnswers(fromJson<InterviewQuestion[]>(interview.questions, []), transcript),
        });
      }

      const draft = await rt.ai.composeMdUpdate({
        periodLabel: edition.title,
        contributions: contributions.map(({ speakerId, speakerName, qa }) => ({ speakerId, speakerName, qa })),
        brand: await rt.brand(),
      });

      // Replace the passages; items an editor added by hand (no contributor) stay.
      await rt.db.from("newsletter_items").delete().eq("newsletter_id", edition.id).not("contributor_profile_id", "is", null);
      const rows = [];
      let position = 0;
      for (const theme of draft.themes) {
        for (const passage of theme.passages) {
          const contribution = contributions.find((c) => c.speakerId === passage.speakerId);
          if (!contribution) continue;
          rows.push({
            organization_id: rt.orgId,
            newsletter_id: edition.id,
            section: theme.theme,
            custom_title: contribution.speakerName,
            custom_summary: passage.text,
            contributor_profile_id: contribution.speakerId,
            interview_id: contribution.interviewId,
            position: position++,
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await rt.db.from("newsletter_items").insert(rows);
        if (error) throw new Error(error.message);
      }
      await rt.db
        .from("newsletters")
        .update({ current_version: edition.current_version + 1, generation_provider: rt.ai.id })
        .eq("id", edition.id);

      rt.step("compose", "MD-update samengesteld", `${draft.themes.length} thema('s), ${rows.length} passage(s)`, "prepare_internal_newsletter");
      await rt.log({
        action: "md_update.composed",
        category: "generated",
        entityType: "newsletter",
        entityId: edition.id,
        summary: `“${edition.title}” samengesteld uit de antwoorden van ${done.length} MD('s): ${draft.themes.length} thema('s), ${rows.length} passage(s).${missing.length ? ` Nog geen antwoord van: ${missing.join(", ")}.` : ""} Elke MD keurt de eigen passages goed.`,
        requiresApproval: true,
      });
      return { themes: draft.themes.length, passages: rows.length, contributors: done.length, missing };
    },
  );
}

// --- Weekly overview --------------------------------------------------------------
export async function sendWeeklyOverview(organizationId: string, now = new Date()): Promise<{ recipients: number; body: string }> {
  const db = createAdminClient();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const count = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;

  const [proposals, interviews, approvals, overdue, ready, published] = await Promise.all([
    count(db.from("content_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "proposed")),
    count(db.from("interviews").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["requested", "in_progress", "awaiting_confirmation"])),
    count(db.from("approvals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("decision", "pending")),
    count(db.from("approvals").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("decision", "pending").lte("due_at", now.toISOString())),
    count(db.from("articles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "approved")),
    count(db.from("articles").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "published").gte("published_at", weekAgo)),
  ]);

  const body = [
    "Weekoverzicht van de redactie",
    "",
    `• ${proposals} voorstel(len) wachten op een besluit in de inbox`,
    `• ${interviews} interview(s) lopen of wachten op antwoord`,
    `• ${approvals} goedkeuringsverzoek(en) staan open${overdue ? `, waarvan ${overdue} over de termijn` : ""}`,
    `• ${ready} stuk(ken) zijn klaar voor publicatie`,
    `• ${published} stuk(ken) zijn de afgelopen week gepubliceerd`,
    "",
    appLink("/for-me"),
  ].join("\n");

  // Everyone on the editorial team: people who may approve or create content.
  const { data: editors } = await db
    .from("profiles")
    .select("id, role:roles!inner(role_permissions!inner(permission_key))")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("role.role_permissions.permission_key", ["content.approve", "content.create"]);
  const ids = Array.from(new Set((editors ?? []).map((e) => e.id)));
  for (const id of ids) {
    await sendBotMessage({ organizationId, kind: "weekly_overview", medium: "dm", recipientProfileId: id, body, now });
  }
  return { recipients: ids.length, body };
}

// --- The bot explains itself in its channels ----------------------------------------
export async function channelExplanation(db: AdminClient, channel: Channel): Promise<string> {
  const settings = await loadRedactieSettings(db, channel.organization_id);
  const { data: rules } = await db
    .from("emoji_rules")
    .select("emoji, goal, action")
    .eq("organization_id", channel.organization_id)
    .eq("enabled", true)
    .order("sort_order");
  const pick = (rules ?? []).filter((r) => r.action !== "exclude");
  const exclude = (rules ?? []).find((r) => r.action === "exclude");
  const expectation = channel.expectation.trim().replace(/\.$/, "");
  return [
    `Ik ben de ${settings.botName}, de bot van de redactie.`,
    expectation ? `Ik volg dit kanaal om ${expectation.charAt(0).toLowerCase()}${expectation.slice(1)}.` : "Ik volg dit kanaal voor de redactie.",
    channel.follow_mode === "emoji_only"
      ? "Ik lees hier niet mee: ik reageer alleen op een bericht waar iemand een emoji bij zet."
      : "Ik lees hier mee en leg wat nieuws lijkt voor aan de redactie.",
    pick.length ? `Zet ${pick.map((r) => `${r.emoji} (${r.goal.toLowerCase()})`).join(", ")} bij een bericht dat ik moet oppakken${exclude ? ` en ${exclude.emoji} bij een bericht dat ik moet laten liggen` : ""}.` : "",
    "Ik publiceer niets zonder akkoord van de betrokkenen.",
    settings.contactPerson ? `Vragen? ${settings.contactPerson}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function explainInChannel(channelId: string, kind: "intro" | "periodic", now = new Date()) {
  const db = createAdminClient();
  const { data: channel } = await db.from("channels").select("*").eq("id", channelId).single();
  if (!channel || !channel.followed) return null;
  const result = await sendBotMessage({
    organizationId: channel.organization_id,
    kind: "channel_intro",
    medium: "channel",
    slackChannelId: channel.slack_channel_id,
    body: await channelExplanation(db, channel),
    entityType: "channel",
    entityId: channel.id,
    now,
  });
  await db
    .from("channels")
    .update({ last_explained_at: now.toISOString(), ...(kind === "intro" ? { joined_at: now.toISOString() } : {}) })
    .eq("id", channel.id);
  return result;
}

async function explainDueChannels(organizationId: string, now: Date): Promise<number> {
  const db = createAdminClient();
  const { data: channels } = await db
    .from("channels")
    .select("id, explain_every_days, last_explained_at, joined_at")
    .eq("organization_id", organizationId)
    .eq("followed", true)
    .gt("explain_every_days", 0);
  let explained = 0;
  for (const channel of channels ?? []) {
    const last = channel.last_explained_at ?? channel.joined_at;
    if (last && now.getTime() - new Date(last).getTime() < channel.explain_every_days * 86_400_000) continue;
    await explainInChannel(channel.id, last ? "periodic" : "intro", now);
    explained++;
  }
  return explained;
}

// --- Which rhythms are due ------------------------------------------------------------
export function rhythmIsDue(rhythm: Pick<Rhythm, "days_of_month" | "weekday" | "time_of_day" | "last_run_at" | "enabled">, now: Date): boolean {
  if (!rhythm.enabled) return false;
  const z = toZoned(now);
  const isoWeekday = z.getDay() === 0 ? 7 : z.getDay();
  const today = rhythm.weekday ? rhythm.weekday === isoWeekday : rhythm.days_of_month.includes(z.getDate());
  if (!today) return false;
  const [h, m] = rhythm.time_of_day.split(":").map(Number);
  if (z.getHours() * 60 + z.getMinutes() < h * 60 + m) return false;
  return !rhythm.last_run_at || isoDay(new Date(rhythm.last_run_at)) !== isoDay(now);
}

export async function runRhythm(options: {
  organizationId: string;
  key: RhythmKey;
  trigger: Trigger;
  triggeredBy?: string | null;
  now?: Date;
}): Promise<{ summary: string }> {
  const db = createAdminClient();
  const now = options.now ?? new Date();
  const { data: rhythm } = await db.from("rhythms").select("*").eq("organization_id", options.organizationId).eq("key", options.key).single();
  if (!rhythm) throw new Error("Dit ritme bestaat niet.");
  if ((await loadRedactieSettings(db, options.organizationId)).botPaused) throw new Error("De bot is gepauzeerd.");

  let summary = "";
  if (options.key === "weekly_overview") {
    const result = await sendWeeklyOverview(options.organizationId, now);
    summary = `Weekoverzicht klaargezet voor ${result.recipients} redactielid/-leden.`;
  } else if (options.key === "md_update") {
    const result = await startMdUpdate({ organizationId: options.organizationId, date: now, trigger: options.trigger, triggeredBy: options.triggeredBy });
    summary = result.created
      ? `MD-update gestart: ${result.interviews} MD('s) uitgenodigd.${result.skipped.length ? ` Niet gelukt: ${result.skipped.join("; ")}` : ""}`
      : "De MD-update van vandaag bestond al.";
  } else {
    // Team round and the two newsletters start with asking the group for input.
    const { data: linked } = rhythm.group_id
      ? await db.from("outreach_groups").select("enabled").eq("id", rhythm.group_id).maybeSingle()
      : { data: null };
    if (rhythm.group_id && linked?.enabled) {
      const round = await runOutreachRound({ organizationId: options.organizationId, groupId: rhythm.group_id, now });
      summary = `Inputronde: ${round.asked} verstuurd, ${round.held} vastgehouden, ${round.blocked.length} tegengehouden.`;
    } else if (rhythm.group_id) {
      summary = "De gekoppelde groep staat uit: er is niemand om input gevraagd.";
    } else {
      summary = "Geen groep gekoppeld: er is niemand om input gevraagd.";
    }
    if (options.key !== "team_round") {
      // The edition itself is prepared when the input deadline has passed.
      const { enqueueTask } = await import("@/lib/agents/tasks");
      const kind = options.key === "external_newsletter" ? "external" : "internal";
      const month = format(toZoned(now), "yyyy-MM");
      await enqueueTask({
        organizationId: options.organizationId,
        type: "prepare_newsletter",
        agentKind: kind,
        title: `${kind === "external" ? "Externe" : "Interne"} nieuwsbrief voorbereiden (${month})`,
        payload: { kind, month: `${month}-01` },
        scheduledFor: new Date(now.getTime() + rhythm.deadline_days * 86_400_000),
        dedupeKey: `newsletter:${kind}:${month}`,
      });
      summary += ` De nieuwsbrief wordt over ${rhythm.deadline_days} dag(en) voorbereid.`;
    }
  }

  await db.from("rhythms").update({ last_run_at: now.toISOString() }).eq("id", rhythm.id);
  await logSystemAction(db, {
    organizationId: options.organizationId,
    action: "rhythm.run",
    summary: `Vast ritme “${rhythm.name}” uitgevoerd. ${summary}`,
    metadata: { key: options.key, trigger: options.trigger },
  });
  return { summary };
}

/** Called by the job tick: runs what is due today and keeps the channels informed. */
export async function runDueRhythms(organizationId: string, now = new Date()): Promise<{ ran: string[]; explained: number; errors: string[] }> {
  const db = createAdminClient();
  const settings = await loadRedactieSettings(db, organizationId);
  const ran: string[] = [];
  const errors: string[] = [];
  if (settings.botPaused) return { ran, explained: 0, errors };

  const { data: rhythms } = await db.from("rhythms").select("*").eq("organization_id", organizationId).eq("enabled", true);
  for (const rhythm of rhythms ?? []) {
    if (!rhythmIsDue(rhythm, now)) continue;
    try {
      await runRhythm({ organizationId, key: rhythm.key as RhythmKey, trigger: "schedule", now });
      ran.push(rhythm.key);
    } catch (error) {
      errors.push(`${rhythm.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Groups with their own frequency (not tied to a rhythm).
  const { data: groups } = await db
    .from("outreach_groups")
    .select("id, name, frequency, weekday, window_start, window_end, last_run_at")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .neq("frequency", "rhythm_only");
  const z = toZoned(now);
  const isoWeekday = z.getDay() === 0 ? 7 : z.getDay();
  for (const group of groups ?? []) {
    if (group.weekday !== isoWeekday) continue;
    const [h, m] = group.window_start.split(":").map(Number);
    const [eh, em] = group.window_end.split(":").map(Number);
    const minutes = z.getHours() * 60 + z.getMinutes();
    // Only inside the group's own time window on its day.
    if (minutes < h * 60 + m || minutes >= eh * 60 + em) continue;
    const gap = { weekly: 6, biweekly: 13, monthly: 27 }[group.frequency as "weekly" | "biweekly" | "monthly"] ?? 27;
    if (group.last_run_at && now.getTime() - new Date(group.last_run_at).getTime() < gap * 86_400_000) continue;
    try {
      await runOutreachRound({ organizationId, groupId: group.id, now });
      ran.push(`groep:${group.name}`);
    } catch (error) {
      errors.push(`${group.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    await processOutreachReminders(organizationId, now);
  } catch (error) {
    errors.push(`Herinneringen: ${error instanceof Error ? error.message : String(error)}`);
  }
  const explained = await explainDueChannels(organizationId, now);
  return { ran, explained, errors };
}

/**
 * Reminders for input rounds, as the group prescribes: after N working days
 * without an answer, at most `reminder_count` reminders; after that the
 * editors are told (or nothing happens). Someone who sent the bot anything
 * since the request counts as having answered.
 */
export async function processOutreachReminders(organizationId: string, now = new Date()): Promise<{ reminded: number; reported: number }> {
  const { workingDaysBetween } = await import("@/lib/redactie/workdays");
  const db = createAdminClient();
  const { data: groups } = await db
    .from("outreach_groups")
    .select("id, name, reminder_count, reminder_after_days, after_no_reply, last_run_at")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .not("last_run_at", "is", null);

  let reminded = 0;
  let reported = 0;
  for (const group of groups ?? []) {
    const since = group.last_run_at as string;
    const { data: messages } = await db
      .from("bot_messages")
      .select("kind, status, recipient_profile_id, created_at")
      .eq("organization_id", organizationId)
      .eq("entity_type", "outreach_group")
      .eq("entity_id", group.id)
      .gte("created_at", since);
    const asked = (messages ?? []).filter((m) => m.kind === "input_request" && ["sent", "simulated"].includes(m.status) && m.recipient_profile_id);
    const silent: string[] = [];
    for (const request of asked) {
      const profileId = request.recipient_profile_id as string;
      const { count: answered } = await db
        .from("source_messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("author_profile_id", profileId)
        .gte("ingested_at", request.created_at);
      if (answered) continue;
      const reminders = (messages ?? []).filter((m) => m.kind === "reminder" && m.recipient_profile_id === profileId);
      const last = reminders.length ? reminders[reminders.length - 1].created_at : request.created_at;
      if (workingDaysBetween(new Date(last), now) < group.reminder_after_days) continue;
      if (reminders.length < group.reminder_count) {
        const result = await sendBotMessage({
          organizationId,
          kind: "reminder",
          medium: "dm",
          recipientProfileId: profileId,
          entityType: "outreach_group",
          entityId: group.id,
          now,
          body: "Even een herinnering aan mijn vraag van een paar dagen geleden: is er iets dat de redactie moet weten? Niets te melden is ook een prima antwoord.",
        });
        if (result.status !== "blocked") reminded++;
      } else {
        silent.push(profileId);
      }
    }
    if (silent.length && group.after_no_reply === "notify_editors") {
      const { count: alreadyReported } = await db
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("action", "outreach.no_reply")
        .eq("entity_id", group.id)
        .gte("created_at", since);
      if (!alreadyReported) {
        const { data: people } = await db.from("profiles").select("full_name").in("id", silent);
        await logSystemAction(db, {
          organizationId,
          action: "outreach.no_reply",
          category: "requested",
          entityType: "outreach_group",
          entityId: group.id,
          summary: `Geen antwoord op de inputronde “${group.name}” van: ${(people ?? []).map((p) => p.full_name).join(", ")}. De bot vraagt het niet nog eens.`,
          requiresApproval: true,
        });
        reported++;
      }
    }
  }
  return { reminded, reported };
}
