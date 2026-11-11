import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Notice, PageHeader, Panel } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { PERMISSION_KEYS, ROLE_LABELS, type PermissionKey } from "@/lib/permissions";
import { isoDay } from "@/lib/redactie/conduct";
import { createClient } from "@/lib/supabase/server";
import { InviteDialog } from "./_components/invite-dialog";
import { PermissionMatrix, type MatrixRole } from "./_components/permission-matrix";
import {
  AddRoleButton,
  AddTeamButton,
  FunctionalRolesList,
  TeamsList,
  type FunctionalRoleRow,
  type TeamRow,
} from "./_components/roles-teams";
import { SlackImport } from "./_components/slack-import";
import { UsersTable, type TeamUser } from "./_components/users-table";

export const metadata: Metadata = { title: "Mensen en rollen" };

export default async function TeamPage() {
  const session = await requireSession();
  const db = await createClient();
  const canManage = can(session, "users.manage");
  // How colleagues set their own contact with the bot is for the administrator and the editors, not for everyone.
  const showBot = canManage || can(session, "agents.manage", "content.create", "content.edit", "content.review", "content.approve");

  const [
    { data: profiles, error: profilesError },
    { data: roles, error: rolesError },
    { data: functionalRoles, error: functionalError },
    { data: assignments, error: assignmentsError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    db
      .from("profiles")
      .select(
        "id, full_name, email, job_title, department, avatar_color, is_active, created_at, role_id, team_id, slack_user_id, bot_may_contact, bot_follows, in_pilot, absent_until, contact_paused_until, contact_opt_out",
      )
      .order("is_active", { ascending: false })
      .order("full_name"),
    db.from("roles").select("id, key, name, sort_order, role_permissions(permission_key)").order("sort_order"),
    db.from("functional_roles").select("id, name, description, sort_order").order("sort_order").order("name"),
    db.from("profile_functional_roles").select("profile_id, functional_role_id"),
    db.from("teams").select("id, name").order("name"),
  ]);
  for (const error of [profilesError, rolesError, functionalError, assignmentsError, teamsError]) {
    if (error) throw new Error(error.message);
  }

  const roleOptions = (roles ?? []).map((r) => ({ id: r.id, key: r.key, label: ROLE_LABELS[r.key]?.label ?? r.name }));
  const roleKeyById = new Map((roles ?? []).map((r) => [r.id, r.key]));

  const users: TeamUser[] = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    email: p.email,
    jobTitle: p.job_title,
    department: p.department,
    avatarColor: p.avatar_color,
    isActive: p.is_active,
    createdAt: p.created_at,
    roleId: p.role_id,
    roleKey: roleKeyById.get(p.role_id) ?? "",
    functionalRoleIds: (assignments ?? []).filter((a) => a.profile_id === p.id).map((a) => a.functional_role_id),
    teamId: p.team_id,
    slackUserId: p.slack_user_id,
    botMayContact: showBot ? p.bot_may_contact : true,
    botFollows: showBot && p.bot_follows,
    inPilot: showBot && p.in_pilot,
    absentUntil: showBot ? p.absent_until : null,
    contactPausedUntil: showBot ? p.contact_paused_until : null,
    contactOptOut: showBot && p.contact_opt_out,
  }));

  const activeUsers = users.filter((u) => u.isActive);
  const functionalRoleRows: FunctionalRoleRow[] = (functionalRoles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    members: activeUsers.filter((u) => u.functionalRoleIds.includes(r.id)).map((u) => u.name),
  }));
  const teamRows: TeamRow[] = (teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    members: activeUsers.filter((u) => u.teamId === team.id).map((u) => u.name),
  }));
  const functionalRoleOptions = functionalRoleRows.map(({ id, name }) => ({ id, name }));
  const teamOptions = teamRows.map(({ id, name }) => ({ id, name }));

  const matrixRoles: MatrixRole[] = (roles ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    label: ROLE_LABELS[r.key]?.label ?? r.name,
    permissions: r.role_permissions
      .map((rp) => rp.permission_key as PermissionKey)
      .filter((p) => (PERMISSION_KEYS as readonly string[]).includes(p)),
  }));

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mensen en rollen"
        description="Wie er werkt, welke rollen en welk team iemand heeft, of de bot iemand mag benaderen en wat iemand in de hub mag. Rechten worden ook in de database afgedwongen."
        actions={canManage ? <InviteDialog roles={roleOptions} /> : undefined}
      />

      {!canManage && (
        <Notice tone="info" icon={Lock} title="Alleen-lezen">
          Je kunt mensen, rollen en teams inzien. Wijzigen kan alleen met het recht ‘Gebruikers beheren’. Je eigen afwezigheid en of
          de bot je mag benaderen stel je in onder Voor mij.
        </Notice>
      )}

      <Panel
        title="Mensen"
        description={`${activeCount} actief${users.length > activeCount ? `, ${users.length - activeCount} gedeactiveerd` : ""}`}
        flush
      >
        {canManage && <SlackImport />}
        <UsersTable
          users={users}
          roles={roleOptions}
          functionalRoles={functionalRoleOptions}
          teams={teamOptions}
          today={isoDay(new Date())}
          currentUserId={session.userId}
          canManage={canManage}
          showBot={showBot}
        />
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel
          title="Rollen in de organisatie"
          description="Iemand kan meer rollen hebben. Groepen en goedkeuringsregels verwijzen ernaar."
          actions={canManage ? <AddRoleButton /> : undefined}
          flush
        >
          <FunctionalRolesList roles={functionalRoleRows} canManage={canManage} />
        </Panel>
        <Panel
          title="Teams"
          description="Elk team heeft een DM en een Team Lead als aanspreekpunt."
          actions={canManage ? <AddTeamButton /> : undefined}
          flush
        >
          <TeamsList teams={teamRows} canManage={canManage} />
        </Panel>
      </div>

      <Panel
        title="Toegang en rechten"
        description={
          canManage
            ? "Vink aan wat een toegangsrol mag in de hub. Wijzigingen gelden direct. De rechten van de beheerder liggen vast."
            : "Overzicht van wat elke toegangsrol mag in de hub."
        }
        flush
      >
        <PermissionMatrix roles={matrixRoles} canManage={canManage} />
      </Panel>

      <Panel title="Wat doet elke toegangsrol?">
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          {matrixRoles.map((role) => {
            const members = users.filter((u) => u.roleId === role.id && u.isActive).length;
            return (
              <div key={role.id} className="space-y-1">
                <dt className="flex items-baseline justify-between gap-2 text-sm font-medium">
                  {role.label}
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {members} {members === 1 ? "gebruiker" : "gebruikers"}
                  </span>
                </dt>
                <dd className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {ROLE_LABELS[role.key]?.description ?? "Aangepaste rol."}
                </dd>
              </div>
            );
          })}
        </dl>
      </Panel>
    </div>
  );
}
