"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { parseDateInput } from "@/lib/format";
import { toJson } from "@/lib/json";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import type { OrgSettings } from "@/lib/types";

const refresh = () => revalidatePath("/", "layout");

const orgSchema = z.object({
  name: z.string().trim().min(2, "Vul een organisatienaam in.").max(120),
  timezone: z.string().trim().min(3).max(60),
  requireFourEyes: z.boolean(),
  retentionDays: z.number().int().min(30, "Minimaal 30 dagen.").max(3650, "Maximaal 10 jaar."),
});

export async function updateOrganization(input: z.input<typeof orgSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("users.manage");
    const data = orgSchema.parse(input);
    const db = await createClient();
    const { data: updated, error } = await db
      .from("organizations")
      .update({
        name: data.name,
        timezone: data.timezone,
        settings: toJson({
          ...(session.organization.settings as OrgSettings),
          require_four_eyes: data.requireFourEyes,
          retention_days: data.retentionDays,
        }),
      })
      .eq("id", session.organization.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) return fail("Je hebt geen rechten voor deze actie.");
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "organization.updated",
      entityType: "organization",
      entityId: session.organization.id,
      summary: `Organisatie-instellingen bijgewerkt (vier-ogenprincipe ${data.requireFourEyes ? "aan" : "uit"}, bewaartermijn ${data.retentionDays} dagen).`,
    });
    refresh();
    return ok("Organisatie-instellingen opgeslagen.");
  });
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Vul je naam in.").max(120),
  jobTitle: z.string().trim().max(120),
  department: z.string().trim().max(120),
});

export async function updateOwnProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession();
    const data = profileSchema.parse(input);
    const db = await createClient();
    check(
      await db
        .from("profiles")
        .update({ full_name: data.fullName, job_title: data.jobTitle || null, department: data.department || null })
        .eq("id", session.userId),
    );
    refresh();
    return ok("Profiel opgeslagen.");
  });
}

export async function changePassword(input: { password: string; confirm: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession();
    const password = z.string().min(10, "Gebruik minimaal 10 tekens.").max(128).parse(input.password);
    if (password !== input.confirm) return fail("De wachtwoorden komen niet overeen.", { confirm: "Komt niet overeen." });
    const db = await createClient();
    const { error } = await db.auth.updateUser({ password });
    if (error) return fail(/different from the old/i.test(error.message) ? "Kies een ander wachtwoord dan het huidige." : error.message);
    return ok("Wachtwoord gewijzigd.");
  });
}

// --- Calendar ----------------------------------------------------------------
const deadlineSchema = z.object({
  title: z.string().trim().min(3, "Geef een titel.").max(160),
  startsAt: z.string().min(1, "Kies een datum en tijd."),
  notes: z.string().trim().max(600).optional(),
  classification: z.enum(["internal", "external"]).nullable(),
});

export async function createCalendarDeadline(input: z.input<typeof deadlineSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create", "content.publish");
    const data = deadlineSchema.parse(input);
    const date = parseDateInput(data.startsAt);
    if (!date) return fail("Kies een geldige datum en tijd.");
    const db = await createClient();
    check(
      await db.from("content_calendar").insert({
        organization_id: session.organization.id,
        title: data.title,
        entry_type: "deadline",
        starts_at: date.toISOString(),
        notes: data.notes || null,
        classification: data.classification,
        created_by: session.userId,
      }),
    );
    refresh();
    return ok("Deadline toegevoegd aan de kalender.");
  });
}

export async function deleteCalendarEntry(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.create", "content.publish");
    const db = await createClient();
    const entry = unwrap(await db.from("content_calendar").select("entity_id").eq("id", z.uuid().parse(input.id)).single());
    if (entry.entity_id) {
      return fail("Dit kalenderitem hoort bij een contentitem. Wijzig de planning op het item zelf.");
    }
    check(await db.from("content_calendar").delete().eq("id", input.id));
    refresh();
    return ok("Kalenderitem verwijderd.");
  });
}

export async function setCalendarEntryDone(input: { id: string; done: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.create", "content.publish");
    const db = await createClient();
    check(
      await db
        .from("content_calendar")
        .update({ status: input.done ? "done" : "planned" })
        .eq("id", z.uuid().parse(input.id))
        .is("entity_id", null),
    );
    refresh();
    return ok();
  });
}
