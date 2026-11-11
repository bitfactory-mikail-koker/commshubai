"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logUserAction } from "@/lib/audit";
import { can, requireActionSession } from "@/lib/auth";
import { listSlackMembers, slackChannelInfo } from "@/lib/integrations/connectors";
import { loadSecrets } from "@/lib/integrations/service";
import { handleChannelMessage, handleInboundMail, handleReaction, handleTip } from "@/lib/redactie/intake";
import { handleDirectMessage } from "@/lib/redactie/interview-flow";
import { explainInChannel } from "@/lib/redactie/rhythms";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { OrgSettings, RuleStep } from "@/lib/types";

/**
 * What the administrator sets up: people, roles, teams, groups, rhythms,
 * projects, channels, emoji, approval rules and the bot's conduct. Writes go
 * through the signed-in user's client, so RLS enforces who may change what.
 */

const refresh = () => revalidatePath("/", "layout");
const uuid = z.uuid();
const time = z.string().regex(/^\d{2}:\d{2}$/, "Gebruik het formaat uu:mm.");
const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

// =============================================================================
// People
// =============================================================================
const personSchema = z.object({
  userId: uuid,
  teamId: uuid.nullable(),
  functionalRoleIds: z.array(uuid).max(8),
  botMayContact: z.boolean(),
  botFollows: z.boolean(),
  inPilot: z.boolean(),
  absentUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  slackUserId: z.string().trim().max(40).nullable(),
});

export async function updatePerson(input: z.input<typeof personSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const data = personSchema.parse(input);
    const db = await createClient();
    const person = unwrap(await db.from("profiles").select("full_name").eq("id", data.userId).single());
    check(
      await db
        .from("profiles")
        .update({
          team_id: data.teamId,
          bot_may_contact: data.botMayContact,
          bot_follows: data.botFollows,
          in_pilot: data.inPilot,
          absent_until: data.absentUntil,
          slack_user_id: data.slackUserId || null,
        })
        .eq("id", data.userId),
    );
    check(await db.from("profile_functional_roles").delete().eq("profile_id", data.userId));
    if (data.functionalRoleIds.length > 0) {
      check(
        await db.from("profile_functional_roles").insert(
          data.functionalRoleIds.map((id) => ({ profile_id: data.userId, functional_role_id: id, organization_id: session.organization.id })),
        ),
      );
    }
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "person.updated",
      entityType: "profile",
      entityId: data.userId,
      summary: `Instellingen van ${person.full_name} bijgewerkt (rollen, team, benaderbaarheid).`,
    });
    refresh();
    return ok("Opgeslagen.");
  });
}

/** What everyone decides for themselves: absence, a pause, or not being approached at all. */
export async function updateOwnAvailability(input: {
  absentUntil: string | null;
  contactOptOut: boolean;
  pauseWeeks: number;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const absentUntil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().parse(input.absentUntil || null);
    // -1 keeps a pause that is already running.
    const pauseWeeks = z.number().int().min(-1).max(26).parse(input.pauseWeeks);
    const db = await createClient();
    check(
      await db
        .from("profiles")
        .update({
          absent_until: absentUntil,
          contact_opt_out: Boolean(input.contactOptOut),
          ...(pauseWeeks >= 0
            ? { contact_paused_until: pauseWeeks > 0 ? new Date(Date.now() + pauseWeeks * 7 * 86_400_000).toISOString() : null }
            : {}),
        })
        .eq("id", session.userId),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "person.availability",
      summary: `${session.profile.full_name} paste de eigen bereikbaarheid voor de bot aan${input.contactOptOut ? " (niet benaderen)" : pauseWeeks > 0 ? ` (pauze van ${pauseWeeks} weken)` : ""}.`,
    });
    refresh();
    return ok("Opgeslagen.");
  });
}

export async function saveFunctionalRole(input: { id?: string; name: string; description?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const name = z.string().trim().min(2, "Geef de rol een naam.").max(60).parse(input.name);
    const description = z.string().trim().max(200).optional().parse(input.description) ?? "";
    const db = await createClient();
    if (input.id) {
      check(await db.from("functional_roles").update({ name, description }).eq("id", uuid.parse(input.id)));
    } else {
      const { count } = await db.from("functional_roles").select("id", { count: "exact", head: true });
      check(
        await db
          .from("functional_roles")
          .insert({ organization_id: session.organization.id, key: slug(name), name, description, sort_order: ((count ?? 0) + 1) * 10 }),
      );
    }
    refresh();
    return ok("Rol opgeslagen.");
  });
}

export async function deleteFunctionalRole(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("users.manage");
    const db = await createClient();
    const { data, error } = await db.from("functional_roles").delete().eq("id", uuid.parse(input.id)).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return fail("Deze rol kon niet worden verwijderd.");
    refresh();
    return ok("Rol verwijderd. Goedkeuringsregels die deze rol noemen vallen terug op de redactie.");
  });
}

export async function saveTeam(input: { id?: string; name: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const name = z.string().trim().min(2, "Geef het team een naam.").max(60).parse(input.name);
    const db = await createClient();
    if (input.id) check(await db.from("teams").update({ name }).eq("id", uuid.parse(input.id)));
    else check(await db.from("teams").insert({ organization_id: session.organization.id, name }));
    refresh();
    return ok("Team opgeslagen.");
  });
}

export async function deleteTeam(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("users.manage");
    check(await (await createClient()).from("teams").delete().eq("id", uuid.parse(input.id)));
    refresh();
    return ok("Team verwijderd.");
  });
}

/** People come from Slack: every full member with an address on the organization's own domain. */
export async function importSlackMembers(): Promise<ActionResult<{ created: number; linked: number; skipped: number }>> {
  return runAction<{ created: number; linked: number; skipped: number }>(async () => {
    const session = await requireActionSession("users.manage");
    const admin = createAdminClient();
    const { data: integration } = await admin
      .from("integrations")
      .select("id, status")
      .eq("organization_id", session.organization.id)
      .eq("provider", "slack")
      .maybeSingle();
    if (!integration || integration.status !== "connected") {
      return fail("Slack is niet verbonden. Verbind en test de Slack-app eerst bij Integraties.");
    }
    const token = (await loadSecrets(integration.id)).bot_token;
    if (!token) return fail("Er is geen bot-token opgeslagen.");
    const domain = (session.organization.settings.mail_domain ?? "").toLowerCase();
    if (!domain) return fail("Stel eerst het eigen e-maildomein in bij de botinstellingen. Alleen collega's met zo'n adres worden opgehaald.");

    const members = await listSlackMembers(token);
    const { data: employeeRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", session.organization.id)
      .eq("key", "employee")
      .single();
    if (!employeeRole) return fail("De rol Medewerker ontbreekt.");
    const { data: existing } = await admin.from("profiles").select("id, email, slack_user_id").eq("organization_id", session.organization.id);
    const byEmail = new Map((existing ?? []).map((p) => [p.email.toLowerCase(), p]));

    let created = 0;
    let linked = 0;
    let skipped = 0;
    for (const member of members) {
      // Guests are customers or freelancers: never imported.
      if (member.isGuest || !member.email || !member.email.endsWith(`@${domain}`)) {
        skipped++;
        continue;
      }
      const known = byEmail.get(member.email);
      if (known) {
        if (known.slack_user_id !== member.id) {
          await admin.from("profiles").update({ slack_user_id: member.id }).eq("id", known.id);
          linked++;
        }
        continue;
      }
      // No password is ever handed out: people sign in with their Slack account.
      const { data: user, error } = await admin.auth.admin.createUser({
        email: member.email,
        email_confirm: true,
        password: crypto.randomUUID() + crypto.randomUUID(),
        user_metadata: { full_name: member.name },
      });
      if (error || !user.user) {
        skipped++;
        continue;
      }
      const { error: profileError } = await admin.from("profiles").insert({
        id: user.user.id,
        organization_id: session.organization.id,
        role_id: employeeRole.id,
        full_name: member.name,
        email: member.email,
        job_title: member.title,
        slack_user_id: member.id,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(user.user.id);
        skipped++;
      } else created++;
    }
    await logUserAction(await createClient(), session.userId, {
      organizationId: session.organization.id,
      action: "people.imported",
      summary: `Personen opgehaald uit Slack: ${created} nieuw, ${linked} gekoppeld, ${skipped} overgeslagen (gasten, bots of een ander domein).`,
    });
    refresh();
    return ok(`${created} nieuw, ${linked} gekoppeld, ${skipped} overgeslagen.`, { created, linked, skipped });
  });
}

// =============================================================================
// Groups and rhythms
// =============================================================================
const groupSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(2, "Geef de groep een naam.").max(80),
    goal: z.string().trim().max(600),
    bureau: z.enum(["internal", "external"]),
    memberKind: z.enum(["role", "team", "persons"]),
    functionalRoleId: uuid.nullable(),
    teamId: uuid.nullable(),
    memberIds: z.array(uuid).max(200),
    frequency: z.enum(["weekly", "biweekly", "monthly", "rhythm_only"]),
    weekday: z.number().int().min(1).max(7),
    windowStart: time,
    windowEnd: time,
    reminderCount: z.number().int().min(0).max(3),
    reminderAfterDays: z.number().int().min(1).max(14),
    afterNoReply: z.enum(["notify_editors", "nothing"]),
    enabled: z.boolean(),
  })
  .refine((v) => v.memberKind !== "role" || v.functionalRoleId, { message: "Kies een rol.", path: ["functionalRoleId"] })
  .refine((v) => v.memberKind !== "team" || v.teamId, { message: "Kies een team.", path: ["teamId"] })
  .refine((v) => v.windowStart < v.windowEnd, { message: "Het einde moet na het begin liggen.", path: ["windowEnd"] });

export async function saveGroup(input: z.input<typeof groupSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const session = await requireActionSession("users.manage");
    const data = groupSchema.parse(input);
    const db = await createClient();
    const row = {
      organization_id: session.organization.id,
      name: data.name,
      goal: data.goal,
      bureau: data.bureau,
      member_kind: data.memberKind,
      functional_role_id: data.memberKind === "role" ? data.functionalRoleId : null,
      team_id: data.memberKind === "team" ? data.teamId : null,
      frequency: data.frequency,
      weekday: data.weekday,
      window_start: data.windowStart,
      window_end: data.windowEnd,
      reminder_count: data.reminderCount,
      reminder_after_days: data.reminderAfterDays,
      after_no_reply: data.afterNoReply,
      enabled: data.enabled,
    };
    const saved = data.id
      ? unwrap(await db.from("outreach_groups").update(row).eq("id", data.id).select("id").single())
      : unwrap(await db.from("outreach_groups").insert(row).select("id").single());

    check(await db.from("outreach_group_members").delete().eq("group_id", saved.id));
    if (data.memberKind === "persons" && data.memberIds.length > 0) {
      check(
        await db
          .from("outreach_group_members")
          .insert(data.memberIds.map((id) => ({ group_id: saved.id, profile_id: id, organization_id: session.organization.id }))),
      );
    }
    refresh();
    return ok("Groep opgeslagen.", { id: saved.id });
  });
}

export async function deleteGroup(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("users.manage");
    check(await (await createClient()).from("outreach_groups").delete().eq("id", uuid.parse(input.id)));
    refresh();
    return ok("Groep verwijderd.");
  });
}

const rhythmSchema = z.object({
  id: uuid,
  daysOfMonth: z.array(z.number().int().min(1).max(28)).max(4),
  weekday: z.number().int().min(1).max(7).nullable(),
  timeOfDay: time,
  deadlineDays: z.number().int().min(0).max(31),
  groupId: uuid.nullable(),
  enabled: z.boolean(),
});

export async function saveRhythm(input: z.input<typeof rhythmSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("users.manage");
    const data = rhythmSchema.parse(input);
    if (!data.weekday && data.daysOfMonth.length === 0) return fail("Kies minimaal één dag.");
    check(
      await (await createClient())
        .from("rhythms")
        .update({
          days_of_month: data.weekday ? [] : Array.from(new Set(data.daysOfMonth)).sort((a, b) => a - b),
          weekday: data.weekday,
          time_of_day: data.timeOfDay,
          deadline_days: data.deadlineDays,
          group_id: data.groupId,
          enabled: data.enabled,
        })
        .eq("id", data.id),
    );
    refresh();
    return ok("Ritme opgeslagen.");
  });
}

// =============================================================================
// Projects
// =============================================================================
const projectSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, "Geef het project een naam.").max(120),
  clientName: z.string().trim().max(120),
  externalNaming: z.enum(["unknown", "allowed", "anonymous", "not_allowed"]),
  anonymousLabel: z.string().trim().max(120),
  notes: z.string().trim().max(2000),
  members: z.array(z.object({ profileId: uuid, role: z.string().trim().min(1).max(40) })).max(40),
  channelIds: z.array(uuid).max(20),
});

export async function saveProject(input: z.input<typeof projectSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const session = await requireActionSession();
    const data = projectSchema.parse(input);
    if (data.externalNaming === "anonymous" && !data.anonymousLabel) {
      return fail("Geef aan hoe de klant anoniem wordt omschreven, bijvoorbeeld “een landelijke retailer”.", { anonymousLabel: "Verplicht bij anoniem." });
    }
    const db = await createClient();
    const row = {
      organization_id: session.organization.id,
      name: data.name,
      client_name: data.clientName || null,
      external_naming: data.externalNaming,
      anonymous_label: data.anonymousLabel || null,
      notes: data.notes || null,
    };
    let previous: { external_naming: string } | null = null;
    let id = data.id ?? null;
    if (id) {
      previous = unwrap(await db.from("projects").select("external_naming").eq("id", id).single());
      const { data: updated, error } = await db.from("projects").update(row).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!updated?.length) return fail("Je kunt dit project niet wijzigen. Alleen de redactie en de betrokkenen bij het project kunnen dat.");
    } else {
      if (!can(session, "content.create")) return fail("Alleen de redactie kan een project toevoegen.");
      id = unwrap(
        await db
          .from("projects")
          .insert({ ...row, status: "confirmed", confirmed_by: session.userId, confirmed_at: new Date().toISOString() })
          .select("id")
          .single(),
      ).id;
    }

    // The update above went through RLS, so this person may manage the project. The member list is
    // replaced in one go with the service client: a member who edits would otherwise lose their own
    // right halfway, between deleting the old list and inserting the new one.
    const members = createAdminClient();
    check(await members.from("project_members").delete().eq("project_id", id).eq("organization_id", session.organization.id));
    if (data.members.length > 0) {
      check(
        await members.from("project_members").insert(
          data.members.map((m) => ({
            project_id: id as string,
            profile_id: m.profileId,
            organization_id: session.organization.id,
            project_role: m.role,
            confirmed: true,
          })),
        ),
      );
    }
    if (can(session, "integrations.manage")) {
      await db.from("channels").update({ project_id: null }).eq("project_id", id);
      if (data.channelIds.length > 0) await db.from("channels").update({ project_id: id }).in("id", data.channelIds);
    }

    // "Mag het extern?" is a decision someone takes; the log says who.
    if (!previous || previous.external_naming !== data.externalNaming) {
      const admin = createAdminClient();
      const permission =
        data.externalNaming === "allowed" || data.externalNaming === "anonymous" ? "granted" : data.externalNaming === "not_allowed" ? "denied" : "unknown";
      const { data: topics } = await admin
        .from("content_opportunities")
        .update({ external_permission: permission, ...(data.externalNaming === "not_allowed" ? { internal_only: true } : {}) })
        .eq("organization_id", session.organization.id)
        .eq("project_id", id)
        .eq("classification", "external")
        .select("article_id");
      const articleIds = (topics ?? []).map((t) => t.article_id).filter((a): a is string => Boolean(a));
      if (articleIds.length > 0) {
        await admin
          .from("articles")
          .update({ external_permission: permission })
          .in("id", articleIds)
          .in("status", ["new_signal", "research", "interview_requested", "interview_completed", "draft", "in_review", "changes_requested"]);
      }
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "project.external_naming",
        category: "approval",
        entityType: "project",
        entityId: id,
        summary: `${session.profile.full_name} legde vast voor project “${data.name}”: ${
          { unknown: "nog niet bekend of het extern mag", allowed: "de klant mag extern bij naam worden genoemd", anonymous: "alleen anoniem extern", not_allowed: "alleen intern" }[
            data.externalNaming
          ]
        }.`,
      });
    }
    refresh();
    return ok("Project opgeslagen.", { id });
  });
}

/** The bot proposed a project; a person confirms it (and the members the bot suggested). */
export async function confirmProject(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const id = uuid.parse(input.id);
    const db = await createClient();
    const project = unwrap(await db.from("projects").select("name, status").eq("id", id).single());
    if (project.status !== "proposed") return fail("Dit project is al bevestigd.");
    const { data: updated, error } = await db
      .from("projects")
      .update({ status: "confirmed", confirmed_by: session.userId, confirmed_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) return fail("Alleen de redactie en de betrokkenen bij het project kunnen het bevestigen.");
    check(await db.from("project_members").update({ confirmed: true }).eq("project_id", id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "project.confirmed",
      entityType: "project",
      entityId: id,
      summary: `${session.profile.full_name} bevestigde het door de bot voorgestelde project “${project.name}”.`,
    });
    refresh();
    return ok("Project bevestigd.");
  });
}

export async function archiveProject(input: { id: string; archived: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.create");
    check(
      await (await createClient())
        .from("projects")
        .update({ status: input.archived ? "archived" : "confirmed" })
        .eq("id", uuid.parse(input.id)),
    );
    refresh();
    return ok(input.archived ? "Project gearchiveerd." : "Project teruggezet.");
  });
}

// =============================================================================
// Channels and emoji
// =============================================================================
const channelSchema = z.object({
  id: uuid.optional(),
  slackChannelId: z.string().trim().min(2, "Vul het kanaal-ID in.").max(40),
  name: z
    .string()
    .trim()
    .min(1, "Geef de naam van het kanaal.")
    .max(80)
    .transform((v) => v.replace(/^#/, "")),
  isPrivate: z.boolean(),
  hasExternalMembers: z.boolean(),
  followed: z.boolean(),
  expectation: z.string().trim().max(600),
  followMode: z.enum(["emoji_only", "listen", "active"]),
  bureau: z.enum(["internal", "external", "both"]),
  confidentiality: z.enum(["internal_only", "external_after_approval"]),
  projectId: uuid.nullable(),
  explainEveryDays: z.number().int().min(0).max(365),
  lookbackDays: z.number().int().min(0).max(365),
});

export async function saveChannel(input: z.input<typeof channelSchema>): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const session = await requireActionSession("integrations.manage");
    const data = channelSchema.parse(input);
    const admin = createAdminClient();

    // With a live connection Slack is the authority on what kind of channel this is.
    let isPrivate = data.isPrivate;
    let hasExternalMembers = data.hasExternalMembers;
    let name = data.name;
    const { data: integration } = await admin
      .from("integrations")
      .select("id, status")
      .eq("organization_id", session.organization.id)
      .eq("provider", "slack")
      .maybeSingle();
    if (integration?.status === "connected") {
      const token = (await loadSecrets(integration.id)).bot_token;
      if (token) {
        const info = await slackChannelInfo(token, data.slackChannelId);
        isPrivate = info.isPrivate;
        hasExternalMembers = info.hasExternalMembers;
        name = info.name;
        if (data.followed && !info.isMember) return fail(`De bot is nog geen lid van #${info.name}. Nodig de bot eerst uit in het kanaal.`);
      }
    }
    if (data.followed && isPrivate) return fail("Dit is een besloten kanaal. De bot volgt nooit besloten kanalen.");
    if (data.followed && hasExternalMembers) return fail("In dit kanaal zitten klanten of gasten. De bot volgt nooit kanalen met externen.");
    const maxLookback = Number((session.organization.settings as OrgSettings).lookback_max_days ?? 90);
    if (data.lookbackDays > maxLookback) return fail(`Terugkijken kan maximaal ${maxLookback} dagen (ingesteld bij de botinstellingen).`);

    const db = await createClient();
    const row = {
      organization_id: session.organization.id,
      slack_channel_id: data.slackChannelId,
      name,
      is_private: isPrivate,
      has_external_members: hasExternalMembers,
      followed: data.followed,
      expectation: data.expectation,
      follow_mode: data.followMode,
      bureau: data.bureau,
      confidentiality: data.confidentiality,
      project_id: data.projectId,
      explain_every_days: data.explainEveryDays,
      lookback_days: data.lookbackDays,
    };
    const before = data.id ? unwrap(await db.from("channels").select("followed").eq("id", data.id).single()) : null;
    const saved = data.id
      ? unwrap(await db.from("channels").update(row).eq("id", data.id).select("id").single())
      : unwrap(await db.from("channels").insert(row).select("id").single());

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "channel.saved",
      entityType: "channel",
      entityId: saved.id,
      summary: `Kanaal #${name} ${data.followed ? `wordt gevolgd (${data.followMode === "emoji_only" ? "alleen emoji's" : data.followMode === "listen" ? "meelezen" : "actief ophalen"})` : "wordt niet gevolgd"}.`,
    });
    // The bot says why it is there as soon as it starts following a channel.
    if (data.followed && !before?.followed) await explainInChannel(saved.id, "intro");
    refresh();
    return ok(data.followed && !before?.followed ? "Kanaal opgeslagen. De bot stelt zich voor in het kanaal." : "Kanaal opgeslagen.", { id: saved.id });
  });
}

export async function deleteChannel(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("integrations.manage");
    check(await (await createClient()).from("channels").delete().eq("id", uuid.parse(input.id)));
    refresh();
    return ok("Kanaal verwijderd. Opgeslagen signalen uit dit kanaal blijven staan.");
  });
}

export async function explainChannelNow(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("integrations.manage");
    const id = uuid.parse(input.id);
    unwrap(await (await createClient()).from("channels").select("id").eq("id", id).single());
    const result = await explainInChannel(id, "periodic");
    refresh();
    if (!result) return fail("Dit kanaal wordt niet gevolgd.");
    return ok(result.status === "blocked" ? `Niet verstuurd: ${result.reason}` : "Uitlegbericht klaargezet. Zie het postvak van de bot.");
  });
}

const emojiSchema = z.object({
  id: uuid.optional(),
  emoji: z.string().trim().min(1, "Kies een emoji.").max(16),
  shortcode: z
    .string()
    .trim()
    .min(1, "Vul de Slack-naam in, bijvoorbeeld mega.")
    .max(60)
    .transform((v) => v.replace(/:/g, "").toLowerCase()),
  goal: z.string().trim().min(2, "Beschrijf waar de emoji voor staat.").max(80),
  action: z.enum(["external_news", "customer_case", "internal_newsletter", "social_post", "interview", "exclude"]),
  directStart: z.boolean(),
  enabled: z.boolean(),
});

export async function saveEmojiRule(input: z.input<typeof emojiSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const data = emojiSchema.parse(input);
    const db = await createClient();
    const row = {
      organization_id: session.organization.id,
      emoji: data.emoji,
      shortcode: data.shortcode,
      goal: data.goal,
      action: data.action,
      // "Do not use" never starts anything.
      direct_start: data.action === "exclude" ? false : data.directStart,
      enabled: data.enabled,
    };
    if (data.id) check(await db.from("emoji_rules").update(row).eq("id", data.id));
    else {
      const { count } = await db.from("emoji_rules").select("id", { count: "exact", head: true });
      check(await db.from("emoji_rules").insert({ ...row, sort_order: ((count ?? 0) + 1) * 10 }));
    }
    refresh();
    return ok("Emoji opgeslagen.");
  });
}

export async function deleteEmojiRule(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("users.manage");
    check(await (await createClient()).from("emoji_rules").delete().eq("id", uuid.parse(input.id)));
    refresh();
    return ok("Emoji verwijderd.");
  });
}

// =============================================================================
// Approval rules
// =============================================================================
const stepSchema = z.object({
  who: z.enum(["interviewees", "project_roles", "functional_roles", "persons", "editors"]),
  roles: z.array(z.string().max(40)).max(8).optional(),
  profile_ids: z.array(uuid).max(20).optional(),
  min: z.number().int().min(1).max(5).optional(),
  label: z.string().trim().max(80).optional(),
});
const ruleSchema = z.object({
  contentKey: z.string().min(2).max(40),
  steps: z.array(stepSchema).min(1, "Een regel heeft minimaal één stap.").max(5),
  quotesByInterviewee: z.boolean(),
  deadlineDays: z.number().int().min(1).max(30),
});

export async function saveApprovalRule(input: z.input<typeof ruleSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const data = ruleSchema.parse(input);
    for (const step of data.steps) {
      if ((step.who === "project_roles" || step.who === "functional_roles") && !step.roles?.length) return fail("Kies bij elke rolstap minimaal één rol.");
      if (step.who === "persons" && !step.profile_ids?.length) return fail("Kies bij elke stap met aangewezen personen minimaal één persoon.");
    }
    const db = await createClient();
    check(
      await db.from("approval_rules").upsert(
        {
          organization_id: session.organization.id,
          content_key: data.contentKey,
          steps: data.steps as RuleStep[],
          quotes_by_interviewee: data.quotesByInterviewee,
          deadline_days: data.deadlineDays,
          updated_by: session.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,content_key" },
      ),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "approval_rule.saved",
      category: "approval",
      summary: `Goedkeuringsregel voor “${data.contentKey}” gewijzigd: ${data.steps.map((s) => s.label || s.who).join(" → ")}.`,
      metadata: { steps: data.steps },
    });
    refresh();
    return ok("Goedkeuringsregel opgeslagen. Lopende goedkeuringen houden hun stappen.");
  });
}

// =============================================================================
// The bot's conduct
// =============================================================================
const botSchema = z
  .object({
    botName: z.string().trim().min(2, "Geef de bot een naam.").max(60),
    shadowMode: z.boolean(),
    pilotOnly: z.boolean(),
    minDaysBetweenRequests: z.number().int().min(0).max(90),
    workStart: time,
    workEnd: time,
    lookbackMaxDays: z.number().int().min(0).max(365),
    aiBudgetEur: z.number().min(0).max(100_000),
    mailDomain: z
      .string()
      .trim()
      .max(120)
      .transform((v) => v.toLowerCase().replace(/^@/, "")),
    mailboxAddress: z.union([z.literal(""), z.email("Vul een geldig e-mailadres in.")]),
    contactPerson: z.string().trim().max(120),
    signalRetentionMonths: z.number().int().min(1).max(120),
  })
  .refine((v) => v.workStart < v.workEnd, { message: "Het einde van de werkdag moet na het begin liggen.", path: ["workEnd"] })
  .refine((v) => !v.mailDomain || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v.mailDomain), { message: "Vul een domein in, bijvoorbeeld nobears.nl.", path: ["mailDomain"] });

export async function updateBotSettings(input: z.input<typeof botSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage");
    const data = botSchema.parse(input);
    const db = await createClient();
    const current = session.organization.settings as OrgSettings;
    const settings: OrgSettings = {
      ...current,
      bot_name: data.botName,
      shadow_mode: data.shadowMode,
      pilot_only: data.pilotOnly,
      min_days_between_requests: data.minDaysBetweenRequests,
      work_start: data.workStart,
      work_end: data.workEnd,
      lookback_max_days: data.lookbackMaxDays,
      ai_budget_eur: data.aiBudgetEur,
      mail_domain: data.mailDomain,
      mailbox_address: data.mailboxAddress,
      contact_person: data.contactPerson,
      signal_retention_months: data.signalRetentionMonths,
    };
    // Checked above: managing the bot is its own permission, separate from managing users.
    check(await createAdminClient().from("organizations").update({ settings }).eq("id", session.organization.id));

    const changes: string[] = [];
    if ((current.shadow_mode ?? true) !== data.shadowMode) changes.push(data.shadowMode ? "schaduwmodus aangezet" : "schaduwmodus uitgezet: de bot stuurt nu echt berichten");
    if ((current.pilot_only ?? false) !== data.pilotOnly) changes.push(data.pilotOnly ? "alleen de proefgroep wordt benaderd" : "iedereen kan worden benaderd");
    if (Number(current.ai_budget_eur ?? 150) !== data.aiBudgetEur) changes.push(`maandplafond AI-kosten € ${data.aiBudgetEur}`);
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "bot.settings",
      summary: `Botinstellingen gewijzigd door ${session.profile.full_name}${changes.length ? `: ${changes.join("; ")}` : ""}.`,
    });
    refresh();
    return ok("Botinstellingen opgeslagen.");
  });
}

/** The pause button: one click stops every message and every new proposal. */
export async function setBotPaused(input: { paused: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage");
    const db = await createClient();
    const settings: OrgSettings = { ...(session.organization.settings as OrgSettings), bot_paused: Boolean(input.paused) };
    check(await createAdminClient().from("organizations").update({ settings }).eq("id", session.organization.id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: input.paused ? "bot.paused" : "bot.resumed",
      summary: input.paused
        ? `${session.profile.full_name} heeft de bot gepauzeerd. Er gaan geen berichten uit en er komen geen nieuwe voorstellen.`
        : `${session.profile.full_name} heeft de bot hervat.`,
    });
    refresh();
    return ok(input.paused ? "De bot is gepauzeerd." : "De bot is hervat.");
  });
}

// =============================================================================
// Try-outs without Slack: the same code path as a real event
// =============================================================================
const simulateSchema = z.object({
  kind: z.enum(["emoji", "message", "dm", "mail"]),
  channelId: uuid.optional(),
  shortcode: z.string().max(60).optional(),
  authorId: uuid.optional(),
  reactorId: uuid.optional(),
  text: z.string().trim().min(3, "Typ een bericht.").max(6000),
  from: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
});

export async function simulateBotEvent(input: z.input<typeof simulateSchema>): Promise<ActionResult<{ detail: string }>> {
  return runAction<{ detail: string }>(async () => {
    const session = await requireActionSession("agents.manage", "integrations.manage");
    const data = simulateSchema.parse(input);
    const db = await createClient();
    const organizationId = session.organization.id;
    const ts = (Date.now() / 1000).toFixed(6);
    let detail = "";

    if (data.kind === "emoji" || data.kind === "message") {
      if (!data.channelId) return fail("Kies een kanaal.");
      const channel = unwrap(await db.from("channels").select("slack_channel_id, name").eq("id", data.channelId).single());
      const message = { text: data.text, authorProfileId: data.authorId ?? session.userId };
      if (data.kind === "emoji") {
        if (!data.shortcode) return fail("Kies een emoji.");
        const result = await handleReaction({
          organizationId,
          slackChannelId: channel.slack_channel_id,
          ts,
          shortcode: data.shortcode,
          reactorProfileId: data.reactorId ?? session.userId,
          message,
          trigger: "manual",
          isDemo: true,
        });
        detail =
          result.outcome === "proposed"
            ? "Er staat een nieuw voorstel in de inbox."
            : result.outcome === "existing"
              ? "Toegevoegd aan een bestaand onderwerp."
              : result.outcome === "excluded"
                ? "Het bericht is uitgesloten van gebruik."
                : `Genegeerd: ${result.reason}`;
      } else {
        const result = await handleChannelMessage({ organizationId, slackChannelId: channel.slack_channel_id, ts, message, trigger: "manual", isDemo: true });
        detail = result.stored
          ? `Het bericht is als signaal opgenomen${result.opportunityIds.length ? " en er staat een voorstel in de inbox" : ""}.`
          : `Niet opgenomen: ${result.reason ?? "al bekend"}`;
      }
    } else if (data.kind === "dm") {
      const result = await handleDirectMessage({ organizationId, profileId: data.authorId ?? session.userId, text: data.text, trigger: "manual", isDemo: true });
      detail = `Verwerkt als ${{ steering: "instructie over eigen contact", interview: "antwoord in een interview", tip: "tip", ignored: "niets" }[result.handled]}.${result.reply ? ` Antwoord van de bot: “${result.reply}”` : ""}`;
    } else {
      if (!data.from) return fail("Vul een afzender in.");
      const result = await handleInboundMail({ organizationId, from: data.from, subject: data.subject ?? null, text: data.text, trigger: "manual", isDemo: true });
      detail = result.accepted
        ? `Verwerkt: ${{ new_proposal: "nieuw voorstel in de inbox", addition: "aanvulling op een bestaand onderwerp", rubric: "item voor een vaste rubriek", nothing: "geen nieuws; niets bewaard" }[result.result!.outcome]}. Antwoord aan de afzender: “${result.result!.reply}”`
        : `Geweigerd: ${result.reason}`;
    }
    refresh();
    return ok("Proefbericht verwerkt.", { detail });
  });
}

/** The tip form on the website: everyone can use it. The answer is shown on screen. */
export async function submitTip(input: { text: string; subject?: string }): Promise<ActionResult<{ outcome: string; reply: string }>> {
  return runAction<{ outcome: string; reply: string }>(async () => {
    const session = await requireActionSession();
    const text = z.string().trim().min(20, "Vertel in minimaal 20 tekens wat er speelt.").max(6000).parse(input.text);
    const subject = z.string().trim().max(160).optional().parse(input.subject);
    const result = await handleTip({
      organizationId: session.organization.id,
      text,
      subject: subject || null,
      senderProfileId: session.userId,
      senderName: session.profile.full_name,
      via: "form",
      trigger: "manual",
    });
    refresh();
    return ok(result.reply, { outcome: result.outcome, reply: result.reply });
  });
}
