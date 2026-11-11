"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { PERMISSION_KEYS, roleLabel } from "@/lib/permissions";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");
const AVATAR_COLORS = ["slate", "teal", "amber", "violet", "blue", "rose", "green"];

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Vul een naam in.").max(120),
  email: z.email("Vul een geldig e-mailadres in.").max(200),
  roleId: z.uuid("Kies een rol."),
  jobTitle: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
});

/**
 * Adds a user to the organization with a one-time temporary password that is
 * shown once to the administrator.
 */
export async function inviteUser(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult<{ temporaryPassword: string; email: string }>> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const data = inviteSchema.parse(input);
    const db = await createClient();

    // The role must belong to the caller's organization (RLS scopes this read).
    const role = unwrap(await db.from("roles").select("id, key").eq("id", data.roleId).single());

    const admin = createAdminClient();
    const temporaryPassword = randomBytes(9).toString("base64url");
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) {
      if (/already/i.test(error?.message ?? "")) return fail("Er bestaat al een gebruiker met dit e-mailadres.", { email: "Dit e-mailadres is al in gebruik." });
      throw new Error(error?.message ?? "Gebruiker kon niet worden aangemaakt.");
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      organization_id: session.organization.id,
      role_id: role.id,
      full_name: data.fullName,
      email: data.email.toLowerCase(),
      job_title: data.jobTitle || null,
      department: data.department || null,
      avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw new Error(profileError.message);
    }

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "user.invited",
      entityType: "profile",
      entityId: created.user.id,
      summary: `${data.fullName} toegevoegd als ${roleLabel(role.key)}.`,
    });
    refresh();
    return ok("Gebruiker toegevoegd.", { temporaryPassword, email: data.email.toLowerCase() });
  });
}

export async function updateUserRole(input: { userId: string; roleId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const userId = z.uuid().parse(input.userId);
    const roleId = z.uuid().parse(input.roleId);
    if (userId === session.userId) return fail("Je kunt je eigen rol niet wijzigen.");
    const db = await createClient();
    const role = unwrap(await db.from("roles").select("id, key").eq("id", roleId).single());
    const profile = unwrap(await db.from("profiles").select("full_name, role:roles(key)").eq("id", userId).single());

    // Never leave the organization without an administrator.
    if (profile.role?.key === "administrator" && role.key !== "administrator") {
      const { count } = await db
        .from("profiles")
        .select("id, roles!inner(key)", { count: "exact", head: true })
        .eq("roles.key", "administrator")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) return fail("Er moet minimaal één actieve beheerder overblijven.");
    }

    const { data: updated, error } = await db.from("profiles").update({ role_id: role.id }).eq("id", userId).select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) return fail("Je hebt geen rechten voor deze actie.");
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "user.role_changed",
      entityType: "profile",
      entityId: userId,
      summary: `Rol van ${profile.full_name} gewijzigd naar ${roleLabel(role.key)}.`,
    });
    refresh();
    return ok("Rol gewijzigd.");
  });
}

export async function setUserActive(input: { userId: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const userId = z.uuid().parse(input.userId);
    if (userId === session.userId) return fail("Je kunt jezelf niet deactiveren.");
    const db = await createClient();
    const profile = unwrap(await db.from("profiles").select("full_name, role:roles(key)").eq("id", userId).single());
    if (!input.active && profile.role?.key === "administrator") {
      const { count } = await db
        .from("profiles")
        .select("id, roles!inner(key)", { count: "exact", head: true })
        .eq("roles.key", "administrator")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) return fail("Er moet minimaal één actieve beheerder overblijven.");
    }
    const { data: updated, error } = await db.from("profiles").update({ is_active: input.active }).eq("id", userId).select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) return fail("Je hebt geen rechten voor deze actie.");

    // Deactivated users lose their session immediately.
    if (!input.active) {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    } else {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    }

    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: input.active ? "user.activated" : "user.deactivated",
      entityType: "profile",
      entityId: userId,
      summary: `${profile.full_name} ${input.active ? "geactiveerd" : "gedeactiveerd"}.`,
    });
    refresh();
    return ok(input.active ? "Gebruiker geactiveerd." : "Gebruiker gedeactiveerd.");
  });
}

export async function setRolePermission(input: {
  roleId: string;
  permission: string;
  enabled: boolean;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const roleId = z.uuid().parse(input.roleId);
    const permission = z.enum(PERMISSION_KEYS).parse(input.permission);
    const db = await createClient();
    const role = unwrap(await db.from("roles").select("key").eq("id", roleId).single());
    if (role.key === "administrator") return fail("De rechten van de beheerder kunnen niet worden aangepast.");

    if (input.enabled) {
      check(await db.from("role_permissions").upsert({ role_id: roleId, permission_key: permission }));
    } else {
      check(await db.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", permission));
    }
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "role.permission_changed",
      entityType: "role",
      entityId: roleId,
      summary: `Recht “${permission}” ${input.enabled ? "toegekend aan" : "ingetrokken voor"} rol ${roleLabel(role.key)}.`,
    });
    refresh();
    return ok("Rechten bijgewerkt.");
  });
}
