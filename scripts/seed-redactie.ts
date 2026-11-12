/**
 * Demo data for the redactie: people and roles, teams, projects, channels,
 * groups and rhythms, plus a few flows in progress. The flows are produced by
 * the application's own code (approval engine, MD-update, outreach round), so
 * the seeded state is exactly what the app would have produced.
 */
import { addDays, addWeeks } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

type Db = SupabaseClient<Database>;
type Ctx = {
  db: Db;
  orgId: string;
  users: Record<string, string>;
  articles: Record<string, string>;
  opportunities: Record<string, string>;
  signals: Record<string, string>;
  socialPostInReview: string;
};

const must = <T>(result: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(`${what}: ${result.error?.message ?? "geen resultaat"}`);
  return result.data as NonNullable<T>;
};

export async function seedRedactie({ db, orgId: O, users: U, articles: A, opportunities: P, signals: G, socialPostInReview }: Ctx) {
  const setSettings = async (patch: Record<string, unknown>) => {
    const org = must(await db.from("organizations").select("settings").eq("id", O).single(), "settings");
    const { error } = await db
      .from("organizations")
      .update({ settings: { ...(org.settings as Record<string, unknown>), ...patch } as never })
      .eq("id", O);
    if (error) throw new Error(error.message);
  };
  await setSettings({
    bot_name: "Content Director",
    mail_domain: "noordlicht.example",
    mailbox_address: "redactie@noordlicht.example",
    contact_person: "Daan Bakker van de redactie",
    // While the flows below are produced, messages count as delivered (there is no Slack connection, so: simulated).
    shadow_mode: false,
  });

  // --- Teams, functional roles, per-person settings ---------------------------
  const team: Record<string, string> = {};
  for (const name of ["Projecten", "Development", "Marketing", "Directie"]) {
    team[name] = must(await db.from("teams").insert({ organization_id: O, name }).select("id").single(), "team").id;
  }
  const roles = must(await db.from("functional_roles").select("id, key").eq("organization_id", O), "functional roles");
  const role = (key: string) => roles.find((r) => r.key === key)!.id;

  const people: { key: string; team: string; roles: string[]; pilot?: boolean; follows?: boolean; patch?: Record<string, unknown> }[] = [
    { key: "sanne", team: "Marketing", roles: ["md"], pilot: true, follows: true },
    { key: "daan", team: "Marketing", roles: [], pilot: true },
    { key: "lotte", team: "Marketing", roles: [], pilot: true },
    { key: "femke", team: "Marketing", roles: ["commercial_lead", "strateeg"], pilot: true },
    { key: "tim", team: "Projecten", roles: ["dm"], pilot: true },
    { key: "ruben", team: "Development", roles: ["team_lead"], patch: { contact_paused_until: addWeeks(new Date(), 2).toISOString() } },
    { key: "joost", team: "Development", roles: ["developer"], pilot: true },
    { key: "bram", team: "Development", roles: ["developer"], patch: { absent_until: addDays(new Date(), 6).toISOString().slice(0, 10) } },
    { key: "marieke", team: "Directie", roles: ["md"], pilot: true, follows: true },
  ];
  for (const person of people) {
    const { error } = await db
      .from("profiles")
      .update({
        team_id: team[person.team],
        slack_user_id: `U0${person.key.toUpperCase()}`,
        in_pilot: Boolean(person.pilot),
        bot_follows: Boolean(person.follows),
        ...(person.patch ?? {}),
      } as never)
      .eq("id", U[person.key]);
    if (error) throw new Error(`profile ${person.key}: ${error.message}`);
    if (person.roles.length) {
      const { error: roleError } = await db
        .from("profile_functional_roles")
        .insert(person.roles.map((key) => ({ profile_id: U[person.key], functional_role_id: role(key), organization_id: O })));
      if (roleError) throw new Error(roleError.message);
    }
  }

  // --- Projects ---------------------------------------------------------------
  const project = async (
    row: Partial<Database["public"]["Tables"]["projects"]["Insert"]> & { name: string },
    members: [string, string, boolean?][],
  ) => {
    const id = must(await db.from("projects").insert({ organization_id: O, is_demo: true, ...row }).select("id").single(), `project ${row.name}`).id;
    const { error } = await db
      .from("project_members")
      .insert(members.map(([key, projectRole, confirmed]) => ({ project_id: id, profile_id: U[key], organization_id: O, project_role: projectRole, confirmed: confirmed ?? true })));
    if (error) throw new Error(error.message);
    return id;
  };
  const now = new Date().toISOString();
  const rijnmond = await project(
    { name: "Rijnmond Logistiek: Planningsplatform", client_name: "Rijnmond Logistiek", external_naming: "allowed", status: "confirmed", confirmed_by: U.tim, confirmed_at: now },
    [["tim", "dm"], ["femke", "strateeg"], ["joost", "developer"]],
  );
  const ketel = await project(
    { name: "Brouwerij De Koperen Ketel: Webshop", client_name: "Brouwerij De Koperen Ketel", external_naming: "unknown", status: "confirmed", confirmed_by: U.tim, confirmed_at: now },
    [["tim", "dm"], ["joost", "developer"]],
  );
  const lezen = await project(
    { name: "Stichting Lezen Verbindt: Voorleesapp", client_name: "Stichting Lezen Verbindt", external_naming: "anonymous", anonymous_label: "een landelijke leesstichting", status: "confirmed", confirmed_by: U.tim, confirmed_at: now },
    [["tim", "dm"], ["ruben", "team_lead"]],
  );
  // Proposed by the bot from a signal; nobody confirmed it yet.
  await project(
    { name: "Havenbedrijf Delfzijl B.V.: Klantportaal", client_name: "Havenbedrijf Delfzijl B.V.", external_naming: "unknown", status: "proposed", proposed_by_bot: true },
    [["femke", "betrokkene", false]],
  );

  for (const [topic, projectId] of [["o1", rijnmond], ["o2", ketel], ["o3", lezen]] as const) {
    if (P[topic]) await db.from("content_opportunities").update({ project_id: projectId }).eq("id", P[topic]);
  }
  for (const [signal, projectId] of [["g1", rijnmond], ["g2", ketel], ["g3", lezen]] as const) {
    if (G[signal]) await db.from("content_signals").update({ project_id: projectId }).eq("id", G[signal]);
  }

  // --- Channels -----------------------------------------------------------------
  const channels: Database["public"]["Tables"]["channels"]["Insert"][] = [
    { organization_id: O, slack_channel_id: "C0ALGEMEEN", name: "algemeen", followed: true, follow_mode: "listen", bureau: "both", confidentiality: "internal_only", expectation: "bedrijfsnieuws en nieuwe collega's op te pikken voor de interne nieuwsbrief", explain_every_days: 30, lookback_days: 30 },
    { organization_id: O, slack_channel_id: "C0RIJNMOND", name: "project-rijnmond", followed: true, follow_mode: "emoji_only", bureau: "external", confidentiality: "external_after_approval", project_id: rijnmond, expectation: "opleveringen op te pikken voor klantcases", explain_every_days: 60, lookback_days: 30 },
    { organization_id: O, slack_channel_id: "C0KETEL", name: "project-koperenketel", followed: true, follow_mode: "emoji_only", bureau: "external", confidentiality: "external_after_approval", project_id: ketel, expectation: "opleveringen op te pikken voor klantcases", explain_every_days: 60, lookback_days: 30 },
    { organization_id: O, slack_channel_id: "C0LEZEN", name: "project-lezenverbindt", followed: true, follow_mode: "active", bureau: "external", confidentiality: "external_after_approval", project_id: lezen, expectation: "mijlpalen op te pikken en door te vragen voor een klantcase", explain_every_days: 60, lookback_days: 45 },
    { organization_id: O, slack_channel_id: "C0DEV", name: "team-development", followed: true, follow_mode: "emoji_only", bureau: "internal", confidentiality: "internal_only", expectation: "teamprestaties op te pikken voor de interne nieuwsbrief", explain_every_days: 90, lookback_days: 14 },
    { organization_id: O, slack_channel_id: "C0RANDOM", name: "random", followed: false },
    // These two can never be followed: the database refuses it.
    { organization_id: O, slack_channel_id: "C0SHARED", name: "klant-rijnmond", has_external_members: true, followed: false },
    { organization_id: O, slack_channel_id: "G0DIRECTIE", name: "directie-besloten", is_private: true, followed: false },
  ];
  const savedChannels = must(await db
      .from("channels")
      // defaultToNull:false → columns missing from a row use their database default.
      .insert(channels.map((c) => ({ is_demo: true, joined_at: now, last_explained_at: now, ...c })), { defaultToNull: false })
      .select("id, name"),
    "channels",
  );
  for (const channel of savedChannels) {
    await db.from("source_messages").update({ channel_id: channel.id }).eq("organization_id", O).eq("source", "slack").eq("channel", `#${channel.name}`);
  }
  // How these stories reached the editors.
  await db.from("content_signals").update({ origin: "emoji", emoji: "💼" }).in("id", [G.g1, G.g2].filter(Boolean));
  await db.from("content_opportunities").update({ origin: "emoji" }).in("id", [P.o1, P.o2].filter(Boolean));
  await db.from("content_signals").update({ origin: "tip" }).eq("id", G.g11);
  await db.from("content_opportunities").update({ origin: "tip" }).in("id", [P.o10].filter(Boolean));
  // News from an internal-only channel stays internal until an editor releases it.
  await db.from("content_opportunities").update({ internal_only: true }).in("id", [P.o8, P.o6].filter(Boolean));

  // --- Groups and rhythms ---------------------------------------------------------
  const group = async (row: Database["public"]["Tables"]["outreach_groups"]["Insert"], members: string[] = []) => {
    const id = must(await db.from("outreach_groups").insert(row).select("id").single(), `group ${row.name}`).id;
    if (members.length) {
      const { error } = await db.from("outreach_group_members").insert(members.map((key) => ({ group_id: id, profile_id: U[key], organization_id: O })));
      if (error) throw new Error(error.message);
    }
    return id;
  };
  const leads = await group(
    { organization_id: O, name: "DM's en Team Leads", goal: "Wat is er de afgelopen maand in jouw team gebeurd dat collega's zouden moeten weten? Denk aan een oplevering, een nieuwe collega of iets waar je trots op bent.", bureau: "internal", member_kind: "persons", frequency: "rhythm_only", weekday: 2 },
    ["tim", "ruben", "bram"],
  );
  const mds = await group({ organization_id: O, name: "MD's", goal: "Korte vragen voor de MD-update.", bureau: "internal", member_kind: "role", functional_role_id: role("md"), frequency: "rhythm_only", weekday: 1 });
  const external = await group(
    { organization_id: O, name: "Input externe nieuwsbrief", goal: "Welke oplevering, nieuwe klant of resultaat van de afgelopen maand moeten klanten en relaties weten?", bureau: "external", member_kind: "persons", frequency: "rhythm_only", weekday: 2 },
    ["femke", "tim"],
  );
  for (const [key, groupId] of [["team_round", leads], ["md_update", mds], ["external_newsletter", external]] as const) {
    await db.from("rhythms").update({ group_id: groupId }).eq("organization_id", O).eq("key", key);
  }

  // --- Flows in progress, produced by the app's own code ----------------------------
  const { startApprovalRound } = await import("../src/lib/redactie/approval-flow");
  const { runOutreachRound, startMdUpdate, composeMdUpdate, explainInChannel } = await import("../src/lib/redactie/rhythms");
  const { advanceInterview, confirmInterviewSummary } = await import("../src/lib/agents/pipelines");

  // The two pieces in review: the rule decides who is asked. Replace the placeholder requests.
  for (const key of ["a2", "a7"]) {
    await db.from("approvals").delete().eq("entity_type", "article").eq("entity_id", A[key]).eq("decision", "pending");
    await startApprovalRound({ organizationId: O, entityType: "article", entityId: A[key] }, { requestedBy: U.lotte });
  }
  // A social post about a customer case: the editors first, then the DM or Strateeg of the project.
  must(await db.from("social_posts").update({ status: "in_review" }).eq("id", socialPostInReview).select("id").single(), "social post");
  await startApprovalRound({ organizationId: O, entityType: "social_post", entityId: socialPostInReview }, { requestedBy: U.lotte });

  // The monthly team round: Ruben paused the bot and Bram is absent, so two requests are held back.
  await runOutreachRound({ organizationId: O, groupId: leads });

  // MD-update: both MDs are invited; Marieke has answered, Sanne has not yet.
  const mdUpdate = await startMdUpdate({ organizationId: O, trigger: "demo", triggeredBy: U.daan });
  const mdInterviews = must(
    await db.from("interviews").select("id, interviewee_profile_id").eq("organization_id", O).contains("metadata", { edition_id: mdUpdate.newsletterId }),
    "md interviews",
  );
  const mariekes = mdInterviews.find((i) => i.interviewee_profile_id === U.marieke);
  if (mariekes) {
    const answers = [
      "De afgelopen twee weken stonden in het teken van de oplevering voor Stichting Lezen Verbindt en de start van het jaarplan. Het MT heeft de eerste versie besproken.",
      "De prioriteit ligt bij de zorgsector en bij toegankelijkheid. Daar zien we de meeste vraag en daar kunnen we het verschil maken.",
      "We verwelkomden deze maand een nieuwe klant, Havenbedrijf Delfzijl. In januari starten we met de bouw van het klantportaal.",
      "Een compliment voor het developmentteam: voor het eerst dit jaar stonden er nul bugs open op productie.",
    ];
    const base = { organizationId: O, interviewId: mariekes.id, trigger: "demo" as const, triggeredBy: U.marieke };
    await db.from("interviews").update({ invite_choice: "now", is_demo: true }).eq("id", mariekes.id);
    await advanceInterview(base);
    for (let i = 0; i < 12; i++) {
      await db.from("interview_messages").insert({
        organization_id: O,
        interview_id: mariekes.id,
        role: "interviewee",
        content: answers[Math.min(i, answers.length - 1)],
        author_profile_id: U.marieke,
      });
      const turn = await advanceInterview(base);
      if (turn.done) break;
    }
    await confirmInterviewSummary({ ...base, confirmedBy: U.marieke });
    await composeMdUpdate({ organizationId: O, newsletterId: mdUpdate.newsletterId, trigger: "demo", triggeredBy: U.daan });
  }
  await db.from("interviews").update({ is_demo: true }).contains("metadata", { edition_id: mdUpdate.newsletterId });
  await db.from("newsletters").update({ is_demo: true }).eq("id", mdUpdate.newsletterId);

  // From here on the bot runs in shadow mode, as it would at the start of a pilot.
  await setSettings({ shadow_mode: true });
  const general = savedChannels.find((c) => c.name === "algemeen");
  if (general) await explainInChannel(general.id, "periodic");

  return { mdUpdateId: mdUpdate.newsletterId };
}
