import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { Notice, PageHeader, Panel } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { can, requirePagePermission } from "@/lib/auth";
import { RHYTHM_LABELS } from "@/lib/constants";
import { redactieSettings } from "@/lib/redactie/settings";
import { createClient } from "@/lib/supabase/server";
import type { RhythmKey } from "@/lib/types";
import { GroupDialog } from "./_components/group-dialog";
import { GroupsTable } from "./_components/groups-table";
import { RhythmsTable } from "./_components/rhythms-table";
import type { GroupRow, RhythmRow } from "./_components/types";

export const metadata: Metadata = { title: "Groepen en ritmes" };

const RHYTHM_ORDER: RhythmKey[] = ["team_round", "md_update", "internal_newsletter", "external_newsletter", "weekly_overview"];
const hhmm = (value: string) => value.slice(0, 5);

export default async function GroupsPage() {
  const session = await requirePagePermission(
    "users.manage",
    "agents.manage",
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
  );
  const canManage = can(session, "users.manage");
  const canRun = can(session, "users.manage", "agents.manage");
  const db = await createClient();

  const [groupsResult, membersResult, rhythmsResult, rolesResult, assignmentsResult, teamsResult, peopleResult] = await Promise.all([
    db.from("outreach_groups").select("after_no_reply, bureau, enabled, frequency, functional_role_id, goal, id, last_run_at, member_kind, name, reminder_after_days, reminder_count, team_id, weekday, window_end, window_start").order("name"),
    db.from("outreach_group_members").select("group_id, profile_id"),
    db.from("rhythms").select("days_of_month, deadline_days, enabled, group_id, id, key, last_run_at, name, time_of_day, weekday"),
    db.from("functional_roles").select("id, name").order("sort_order").order("name"),
    db.from("profile_functional_roles").select("profile_id, functional_role_id"),
    db.from("teams").select("id, name").order("name"),
    db.from("profiles").select("id, full_name, team_id").eq("is_active", true).order("full_name"),
  ]);
  for (const result of [groupsResult, membersResult, rhythmsResult, rolesResult, assignmentsResult, teamsResult, peopleResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const people = peopleResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const members = membersResult.data ?? [];

  const rhythms: RhythmRow[] = (rhythmsResult.data ?? [])
    .map((r) => ({
      id: r.id,
      key: r.key as RhythmKey,
      daysOfMonth: r.days_of_month,
      weekday: r.weekday,
      timeOfDay: hhmm(r.time_of_day),
      deadlineDays: r.deadline_days,
      groupId: r.group_id,
      enabled: r.enabled,
      lastRunAt: r.last_run_at,
    }))
    .sort((a, b) => RHYTHM_ORDER.indexOf(a.key) - RHYTHM_ORDER.indexOf(b.key));

  const groups: GroupRow[] = (groupsResult.data ?? []).map((g) => {
    const memberIds = members.filter((m) => m.group_id === g.id).map((m) => m.profile_id);
    const resolvedIds =
      g.member_kind === "role"
        ? assignments.filter((a) => a.functional_role_id === g.functional_role_id).map((a) => a.profile_id)
        : g.member_kind === "team"
          ? people.filter((p) => p.team_id && p.team_id === g.team_id).map((p) => p.id)
          : memberIds;
    return {
      id: g.id,
      name: g.name,
      goal: g.goal,
      bureau: g.bureau,
      memberKind: g.member_kind as GroupRow["memberKind"],
      functionalRoleId: g.functional_role_id,
      teamId: g.team_id,
      memberIds,
      frequency: g.frequency as GroupRow["frequency"],
      weekday: g.weekday,
      windowStart: hhmm(g.window_start),
      windowEnd: hhmm(g.window_end),
      reminderCount: g.reminder_count,
      reminderAfterDays: g.reminder_after_days,
      afterNoReply: g.after_no_reply as GroupRow["afterNoReply"],
      enabled: g.enabled,
      lastRunAt: g.last_run_at,
      // Only active people are approached.
      resolved: people.filter((p) => resolvedIds.includes(p.id)).map((p) => p.full_name),
      usedBy: rhythms.filter((r) => r.groupId === g.id).map((r) => RHYTHM_LABELS[r.key]),
    };
  });

  const roleOptions = rolesResult.data ?? [];
  const teamOptions = teamsResult.data ?? [];
  const peopleOptions = people.map((p) => ({ id: p.id, name: p.full_name }));
  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));
  const settings = redactieSettings(session.organization.settings);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Groepen en ritmes"
        description="Wie de bot om input vraagt, waarvoor en hoe vaak. Groepen zijn de mensen, ritmes zijn de vaste momenten."
        actions={
          canManage ? (
            <GroupDialog
              roles={roleOptions}
              teams={teamOptions}
              people={peopleOptions}
              trigger={
                <Button>
                  <Plus />
                  Groep toevoegen
                </Button>
              }
            />
          ) : undefined
        }
      />

      {!canManage && (
        <Notice tone="info" icon={Lock} title="Alleen-lezen">
          Je kunt de groepen en ritmes inzien. Wijzigen kan alleen met het recht ‘Gebruikers beheren’.
        </Notice>
      )}

      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-y py-3 text-[0.8125rem] leading-relaxed">
        <span>
          {settings.minDaysBetweenRequests > 0 ? (
            <>
              Eén grens geldt voor iedereen: de bot stuurt een persoon nooit vaker dan eens per{" "}
              <strong className="font-semibold tabular-nums">
                {settings.minDaysBetweenRequests} {settings.minDaysBetweenRequests === 1 ? "dag" : "dagen"}
              </strong>{" "}
              een nieuw verzoek, in welke groep iemand ook zit. Goedkeuringsverzoeken tellen niet mee.
            </>
          ) : (
            <>Er geldt nu geen grens voor hoe vaak de bot één persoon een nieuw verzoek stuurt.</>
          )}
        </span>
        <Link href="/bot" className="font-medium underline underline-offset-4 outline-none hover:text-foreground/80 focus-visible:ring-3 focus-visible:ring-ring/50">
          Aanpassen bij Gedrag en postvak
        </Link>
      </p>

      <Panel title="Groepen" description="Een groep volgt een rol, een team of een lijst met personen." flush>
        <GroupsTable groups={groups} roles={roleOptions} teams={teamOptions} people={peopleOptions} canManage={canManage} canRun={canRun} />
      </Panel>

      <Panel
        title="Vaste ritmes"
        description="De bot start deze op de ingestelde dag en tijd. Alles wat eruit komt is een voorstel of concept voor de redactie."
        flush
      >
        <RhythmsTable rhythms={rhythms} groups={groupOptions} canManage={canManage} canRun={canRun} />
      </Panel>
    </div>
  );
}
