import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/lib/permissions";
import type { Organization, OrgSettings, Profile } from "@/lib/types";

export type SessionContext = {
  userId: string;
  profile: Profile;
  organization: Organization & { settings: OrgSettings };
  role: { id: string; key: string; name: string };
  permissions: ReadonlySet<PermissionKey>;
};

export class PermissionError extends Error {
  constructor(public permission: PermissionKey | PermissionKey[]) {
    super("Je hebt geen rechten voor deze actie.");
    this.name = "PermissionError";
  }
}

export class AuthError extends Error {
  constructor() {
    super("Je sessie is verlopen. Log opnieuw in.");
    this.name = "AuthError";
  }
}

/**
 * Loads the signed-in user with profile, organization, role and permissions.
 * Memoized per request. Returns null when signed out or deactivated.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, role:roles(id, key, name, role_permissions(permission_key)), organization:organizations(*)")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || !profile.role || !profile.organization) return null;

  const { role, organization, ...rest } = profile;
  return {
    userId: user.id,
    profile: rest as Profile,
    organization: organization as Organization & { settings: OrgSettings },
    role: { id: role.id, key: role.key, name: role.name },
    permissions: new Set(role.role_permissions.map((rp) => rp.permission_key as PermissionKey)),
  };
});

/** For pages: redirects to /login when there is no valid session. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function can(session: SessionContext, ...anyOf: PermissionKey[]): boolean {
  return anyOf.some((p) => session.permissions.has(p));
}

/** For server actions: throws instead of redirecting. */
export async function requireActionSession(...anyOf: PermissionKey[]): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new AuthError();
  if (anyOf.length > 0 && !can(session, ...anyOf)) throw new PermissionError(anyOf);
  return session;
}

/** For pages that need a permission: redirects to the dashboard when missing. */
export async function requirePagePermission(...anyOf: PermissionKey[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!can(session, ...anyOf)) redirect("/dashboard?geen-toegang=1");
  return session;
}
