"use client";

import { Loader2 } from "lucide-react";
import { setUserActive, updateUserRole } from "@/actions/team";
import { useAction } from "@/components/shared/actions";
import { ToneBadge } from "@/components/shared/badges";
import { EmptyState, UserAvatar } from "@/components/shared/layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PersonDialog, type FunctionalRoleOption, type TeamOption } from "./person-dialog";

export type TeamUser = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  avatarColor: string;
  isActive: boolean;
  createdAt: string;
  roleId: string;
  roleKey: string;
  functionalRoleIds: string[];
  teamId: string | null;
  slackUserId: string | null;
  botMayContact: boolean;
  botFollows: boolean;
  inPilot: boolean;
  absentUntil: string | null;
  contactPausedUntil: string | null;
  contactOptOut: boolean;
};

type RoleOption = { id: string; key: string; label: string };

/** What currently keeps the bot from approaching someone, in the order the bot checks it. */
function botStatus(user: TeamUser, today: string): { label: string; held: boolean } {
  if (!user.botMayContact) return { label: "Niet benaderen", held: true };
  if (user.contactOptOut) return { label: "Wil niet benaderd worden", held: true };
  if (user.contactPausedUntil && user.contactPausedUntil.slice(0, 10) >= today) {
    return { label: `Zelf gepauzeerd tot ${formatDate(user.contactPausedUntil, "d MMM")}`, held: true };
  }
  if (user.absentUntil && user.absentUntil >= today) {
    return { label: `Afwezig t/m ${formatDate(user.absentUntil, "d MMM")}`, held: true };
  }
  return { label: "Benaderbaar", held: false };
}

function UserRow({
  user,
  roles,
  functionalRoles,
  teams,
  today,
  isSelf,
  canManage,
  showBot,
}: {
  user: TeamUser;
  roles: RoleOption[];
  functionalRoles: FunctionalRoleOption[];
  teams: TeamOption[];
  today: string;
  isSelf: boolean;
  canManage: boolean;
  showBot: boolean;
}) {
  const role = useAction();
  const active = useAction();
  const roleLabel = roles.find((r) => r.id === user.roleId)?.label ?? "Onbekend";
  const editable = canManage && !isSelf;
  const roleNames = functionalRoles.filter((r) => user.functionalRoleIds.includes(r.id)).map((r) => r.name);
  const teamName = teams.find((t) => t.id === user.teamId)?.name ?? null;
  const bot = botStatus(user, today);
  const botExtras = [user.inPilot && "Proefgroep", user.botFollows && "Berichten altijd beoordeeld"].filter(Boolean) as string[];

  return (
    <TableRow className={cn(!user.isActive && "bg-muted/30")}>
      <TableCell className="py-3 pl-5">
        <div className="flex items-center gap-3">
          <UserAvatar name={user.name} color={user.avatarColor} className={cn(!user.isActive && "opacity-50")} />
          <div className="min-w-0">
            <p className={cn("truncate text-sm font-medium", !user.isActive && "text-muted-foreground")}>
              {user.name}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(jij)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-[0.8125rem]">
        {user.jobTitle ?? <span className="text-muted-foreground">-</span>}
        {user.department && <span className="block text-xs text-muted-foreground">{user.department}</span>}
      </TableCell>
      <TableCell className="text-[0.8125rem]">
        {roleNames.length > 0 ? roleNames.join(", ") : <span className="text-muted-foreground">Geen rol</span>}
        <span className="block text-xs text-muted-foreground">{teamName ? `Team ${teamName}` : "Geen team"}</span>
      </TableCell>
      {showBot && (
        <TableCell className="text-[0.8125rem]">
          {bot.held ? <ToneBadge tone="slate">{bot.label}</ToneBadge> : bot.label}
          {botExtras.length > 0 && <span className="block text-xs text-muted-foreground">{botExtras.join(" · ")}</span>}
        </TableCell>
      )}
      <TableCell>
        {editable ? (
          <div className="flex items-center gap-2">
            <Select
              value={user.roleId}
              disabled={role.pending || !user.isActive}
              onValueChange={(roleId) => {
                if (roleId !== user.roleId) role.run(() => updateUserRole({ userId: user.id, roleId }));
              }}
            >
              <SelectTrigger size="sm" className="w-40" aria-label={`Toegangsrol van ${user.name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role.pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </div>
        ) : (
          <span className="text-[0.8125rem] font-medium">{roleLabel}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2.5">
          {editable && (
            <Switch
              size="sm"
              checked={user.isActive}
              disabled={active.pending}
              aria-label={user.isActive ? `${user.name} deactiveren` : `${user.name} activeren`}
              onCheckedChange={(checked) => active.run(() => setUserActive({ userId: user.id, active: checked }))}
            />
          )}
          {active.pending ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <ToneBadge tone={user.isActive ? "green" : "slate"} dot>
              {user.isActive ? "Actief" : "Gedeactiveerd"}
            </ToneBadge>
          )}
        </div>
      </TableCell>
      {canManage && (
        <TableCell className="pr-3 text-right">
          <PersonDialog user={user} functionalRoles={functionalRoles} teams={teams} today={today} />
        </TableCell>
      )}
    </TableRow>
  );
}

export function UsersTable({
  users,
  roles,
  functionalRoles,
  teams,
  today,
  currentUserId,
  canManage,
  showBot,
}: {
  users: TeamUser[];
  roles: RoleOption[];
  functionalRoles: FunctionalRoleOption[];
  teams: TeamOption[];
  /** Today in the app timezone, yyyy-mm-dd. */
  today: string;
  currentUserId: string;
  canManage: boolean;
  /** The bot column is for the administrator and the editors. */
  showBot: boolean;
}) {
  if (users.length === 0) {
    return <EmptyState title="Nog geen gebruikers" description="Voeg de eerste collega toe om samen te werken." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table className={showBot ? "min-w-[980px]" : "min-w-[760px]"}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Persoon</TableHead>
            <TableHead>Functie</TableHead>
            <TableHead>Rollen en team</TableHead>
            {showBot && <TableHead>Bot</TableHead>}
            <TableHead>Toegang</TableHead>
            <TableHead>Status</TableHead>
            {canManage && (
              <TableHead className="pr-3">
                <span className="sr-only">Bewerken</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              roles={roles}
              functionalRoles={functionalRoles}
              teams={teams}
              today={today}
              isSelf={user.id === currentUserId}
              canManage={canManage}
              showBot={showBot}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
