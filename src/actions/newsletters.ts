"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newsletterSection, prepareNewsletter, regenerateNewsletterFraming } from "@/lib/agents/pipelines";
import { decideApproval, requestApproval, withdrawApprovals } from "@/lib/approvals";
import { logUserAction } from "@/lib/audit";
import { can, requireActionSession } from "@/lib/auth";
import { removeCalendarEntry, upsertCalendarEntry } from "@/lib/calendar";
import { parseDateInput } from "@/lib/format";
import type { PermissionKey } from "@/lib/permissions";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { sanitizeHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");
const EDITABLE = ["draft", "changes_requested"];

export async function prepareNewsletterAction(input: {
  kind: string;
  month: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const kind = z.enum(["external", "internal"]).parse(input.kind);
    if (!/^\d{4}-\d{2}$/.test(input.month)) return fail("Kies een geldige maand.");
    const result = await prepareNewsletter({
      organizationId: session.organization.id,
      kind,
      month: new Date(`${input.month}-01T12:00:00`),
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(
      result.created
        ? `Nieuwsbrief voorbereid met ${result.itemCount} item(s).`
        : "Deze nieuwsbrief bestond al; hij is bijgewerkt met nieuwe content.",
      { id: result.newsletterId },
    );
  });
}

const updateSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(3, "Geef een titel.").max(160),
  subject: z.string().trim().min(3, "Geef een onderwerpregel.").max(160),
  introHtml: z.string().max(20_000),
  outroHtml: z.string().max(20_000),
});

export async function updateNewsletter(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const data = updateSchema.parse(input);
    const db = await createClient();
    const newsletter = unwrap(await db.from("newsletters").select("status, current_version").eq("id", data.id).single());
    if (!EDITABLE.includes(newsletter.status)) return fail("Deze nieuwsbrief is vergrendeld. Heropen hem als concept om te bewerken.");
    check(
      await db
        .from("newsletters")
        .update({
          title: data.title,
          subject: data.subject,
          intro_html: sanitizeHtml(data.introHtml),
          outro_html: sanitizeHtml(data.outroHtml),
          current_version: newsletter.current_version + 1,
        })
        .eq("id", data.id),
    );
    refresh();
    return ok("Nieuwsbrief opgeslagen.");
  });
}

async function assertEditable(newsletterId: string) {
  const db = await createClient();
  const newsletter = unwrap(await db.from("newsletters").select("*").eq("id", newsletterId).single());
  if (!EDITABLE.includes(newsletter.status)) {
    throw new Error("Deze nieuwsbrief is vergrendeld. Heropen hem als concept om de inhoud te wijzigen.");
  }
  return { db, newsletter };
}

/** Any change to the selection bumps the version, which invalidates older approvals. */
async function bumpVersion(db: Awaited<ReturnType<typeof createClient>>, id: string, current: number) {
  check(await db.from("newsletters").update({ current_version: current + 1 }).eq("id", id));
}

export async function addNewsletterItem(input: {
  newsletterId: string;
  articleId?: string;
  customTitle?: string;
  customSummary?: string;
  section?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit");
    const { db, newsletter } = await assertEditable(z.uuid().parse(input.newsletterId));
    const { data: last } = await db
      .from("newsletter_items")
      .select("position")
      .eq("newsletter_id", newsletter.id)
      .order("position", { ascending: false })
      .limit(1);
    const position = (last?.[0]?.position ?? -1) + 1;

    if (input.articleId) {
      const article = unwrap(
        await db.from("articles").select("id, content_type, classification, status").eq("id", z.uuid().parse(input.articleId)).single(),
      );
      if (newsletter.kind === "external" && article.classification !== "external") {
        return fail("Interne content kan niet in de externe nieuwsbrief worden opgenomen.");
      }
      const { data: exists } = await db
        .from("newsletter_items")
        .select("id")
        .eq("newsletter_id", newsletter.id)
        .eq("article_id", article.id)
        .maybeSingle();
      if (exists) return fail("Dit item staat al in de nieuwsbrief.");
      check(
        await db.from("newsletter_items").insert({
          organization_id: session.organization.id,
          newsletter_id: newsletter.id,
          article_id: article.id,
          section: input.section?.trim() || newsletterSection(newsletter.kind, article.content_type),
          position,
        }),
      );
    } else {
      const title = z.string().trim().min(3, "Geef het item een titel.").max(160).parse(input.customTitle ?? "");
      const summary = z.string().trim().min(10, "Schrijf een korte tekst van minimaal 10 tekens.").max(1200).parse(input.customSummary ?? "");
      check(
        await db.from("newsletter_items").insert({
          organization_id: session.organization.id,
          newsletter_id: newsletter.id,
          custom_title: title,
          custom_summary: summary,
          section: input.section?.trim() || (newsletter.kind === "external" ? "Ontwikkelingen" : "Organisatienieuws"),
          position,
        }),
      );
    }
    await bumpVersion(db, newsletter.id, newsletter.current_version);
    refresh();
    return ok("Item toegevoegd aan de nieuwsbrief.");
  });
}

const itemSchema = z.object({
  id: z.uuid(),
  included: z.boolean().optional(),
  customTitle: z.string().trim().max(160).nullable().optional(),
  customSummary: z.string().trim().max(1200).nullable().optional(),
  section: z.string().trim().min(1).max(60).optional(),
});

export async function updateNewsletterItem(input: z.input<typeof itemSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const data = itemSchema.parse(input);
    const dbUser = await createClient();
    const item = unwrap(await dbUser.from("newsletter_items").select("newsletter_id").eq("id", data.id).single());
    const { db, newsletter } = await assertEditable(item.newsletter_id);
    check(
      await db
        .from("newsletter_items")
        .update({
          ...(data.included !== undefined ? { included: data.included } : {}),
          ...(data.customTitle !== undefined ? { custom_title: data.customTitle || null } : {}),
          ...(data.customSummary !== undefined ? { custom_summary: data.customSummary || null } : {}),
          ...(data.section ? { section: data.section } : {}),
        })
        .eq("id", data.id),
    );
    await bumpVersion(db, newsletter.id, newsletter.current_version);
    refresh();
    return ok("Item bijgewerkt.");
  });
}

export async function removeNewsletterItem(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const id = z.uuid().parse(input.id);
    const dbUser = await createClient();
    const item = unwrap(await dbUser.from("newsletter_items").select("newsletter_id").eq("id", id).single());
    const { db, newsletter } = await assertEditable(item.newsletter_id);
    check(await db.from("newsletter_items").delete().eq("id", id));
    await bumpVersion(db, newsletter.id, newsletter.current_version);
    refresh();
    return ok("Item verwijderd uit de nieuwsbrief.");
  });
}

export async function moveNewsletterItem(input: { id: string; direction: "up" | "down" }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const id = z.uuid().parse(input.id);
    const dbUser = await createClient();
    const item = unwrap(await dbUser.from("newsletter_items").select("newsletter_id").eq("id", id).single());
    const { db, newsletter } = await assertEditable(item.newsletter_id);
    const { data: items } = await db
      .from("newsletter_items")
      .select("id, position")
      .eq("newsletter_id", newsletter.id)
      .order("position")
      .order("created_at");
    const list = items ?? [];
    const index = list.findIndex((i) => i.id === id);
    const target = input.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return ok();
    [list[index], list[target]] = [list[target], list[index]];
    const moved = list.flatMap((row, position) => (row.position !== position ? [{ id: row.id, position }] : []));
    const results = await Promise.all(moved.map(({ id: itemId, position }) => db.from("newsletter_items").update({ position }).eq("id", itemId)));
    results.forEach(check);
    await bumpVersion(db, newsletter.id, newsletter.current_version);
    refresh();
    return ok();
  });
}

export async function regenerateFraming(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.edit");
    await regenerateNewsletterFraming({
      organizationId: session.organization.id,
      newsletterId: z.uuid().parse(input.id),
      trigger: "manual",
      triggeredBy: session.userId,
    });
    const db = await createClient();
    const newsletter = unwrap(await db.from("newsletters").select("current_version").eq("id", input.id).single());
    await bumpVersion(db, input.id, newsletter.current_version);
    refresh();
    return ok("Inleiding en afsluiting zijn opnieuw geschreven.");
  });
}

export async function newsletterWorkflow(input: {
  id: string;
  action: "submit" | "approve" | "request_changes" | "reopen" | "schedule" | "send" | "archive";
  note?: string;
  sendAt?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.view");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const newsletter = unwrap(await db.from("newsletters").select("*").eq("id", id).single());
    const log = (action: string, summary: string, category: "approval" | "performed" = "performed") =>
      logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action,
        category,
        entityType: "newsletter",
        entityId: id,
        summary,
      });

    const required: Record<typeof input.action, PermissionKey[]> = {
      submit: ["content.edit", "content.create"],
      approve: ["content.approve"],
      request_changes: ["content.review", "content.approve"],
      reopen: ["content.edit", "content.publish"],
      schedule: ["content.publish"],
      send: ["content.publish"],
      archive: ["content.edit", "content.publish"],
    };
    if (!can(session, ...required[input.action])) return fail("Je hebt geen rechten voor deze actie.");

    switch (input.action) {
      case "submit": {
        if (!EDITABLE.includes(newsletter.status)) return fail("Deze nieuwsbrief kan nu niet worden ingediend.");
        const { count } = await db
          .from("newsletter_items")
          .select("id", { count: "exact", head: true })
          .eq("newsletter_id", id)
          .eq("included", true);
        if (!count) return fail("Selecteer minimaal één item voordat je de nieuwsbrief indient.");
        await requestApproval(db, session, "newsletter", id);
        check(await db.from("newsletters").update({ status: "in_review" }).eq("id", id));
        await log("newsletter.submitted", `“${newsletter.title}” ingediend ter goedkeuring.`, "approval");
        refresh();
        return ok("Nieuwsbrief ingediend ter goedkeuring.");
      }
      case "approve":
      case "request_changes": {
        if (newsletter.status !== "in_review") return fail("Deze nieuwsbrief ligt niet ter review.");
        const decision = input.action === "approve" ? "approved" : "changes_requested";
        if (decision === "changes_requested" && !input.note?.trim()) return fail("Geef een toelichting bij het wijzigingsverzoek.");
        const result = await decideApproval(db, session, "newsletter", id, newsletter.current_version, decision, input.note?.trim() || null);
        if (decision === "changes_requested") {
          check(await db.from("newsletters").update({ status: decision }).eq("id", id));
          await withdrawApprovals(db, "newsletter", id);
        }
        await log(
          `newsletter.${decision}`,
          `“${newsletter.title}” ${decision === "approved" ? "goedgekeurd" : `teruggestuurd: ${input.note}`}.`,
          "approval",
        );
        refresh();
        return ok(
          decision !== "approved"
            ? "Wijzigingen gevraagd."
            : result.state === "approved"
              ? "Nieuwsbrief goedgekeurd."
              : `Akkoord vastgelegd. ${result.label ? `Volgende stap: ${result.label}.` : "De editie wacht nog op andere akkoorden."}`,
        );
      }
      case "reopen": {
        if (newsletter.status === "sent") return fail("Een verzonden nieuwsbrief kan niet worden heropend.");
        check(await db.from("newsletters").update({ status: "draft", send_at: null }).eq("id", id));
        if (newsletter.status === "in_review") await withdrawApprovals(db, "newsletter", id);
        await removeCalendarEntry(db, "newsletter", id, "newsletter");
        await log("newsletter.reopened", `“${newsletter.title}” heropend als concept.`);
        refresh();
        return ok("Nieuwsbrief heropend als concept. Een nieuwe goedkeuring is nodig.");
      }
      case "schedule": {
        const sendAt = parseDateInput(input.sendAt);
        if (!sendAt || sendAt.getTime() < Date.now()) return fail("Kies een verzendmoment in de toekomst.");
        if (!["approved", "scheduled"].includes(newsletter.status)) return fail("Alleen een goedgekeurde nieuwsbrief kan worden ingepland.");
        check(await db.from("newsletters").update({ status: "scheduled", send_at: sendAt.toISOString() }).eq("id", id));
        await upsertCalendarEntry(db, {
          organizationId: session.organization.id,
          entityType: "newsletter",
          entityId: id,
          entryType: "newsletter",
          title: newsletter.title,
          startsAt: sendAt.toISOString(),
          classification: newsletter.kind,
          createdBy: session.userId,
        });
        await log("newsletter.scheduled", `Verzending van “${newsletter.title}” ingepland.`);
        refresh();
        return ok("Verzending ingepland.");
      }
      case "send": {
        if (!["approved", "scheduled"].includes(newsletter.status)) return fail("Alleen een goedgekeurde nieuwsbrief kan worden verzonden.");
        // No e-mail connector in this MVP: the send is recorded as simulated.
        check(await db.from("newsletters").update({ status: "sent", send_mode: "simulated" }).eq("id", id));
        await db.from("content_calendar").update({ status: "done" }).eq("entity_type", "newsletter").eq("entity_id", id);
        await log("newsletter.sent", `“${newsletter.title}” gemarkeerd als verzonden - gesimuleerd, er is geen e-mailkoppeling.`);
        refresh();
        return ok("Gemarkeerd als verzonden (gesimuleerd - er is geen e-mailkoppeling verbonden).");
      }
      case "archive": {
        if (!["draft", "changes_requested", "sent"].includes(newsletter.status)) {
          return fail("Heropen de nieuwsbrief als concept voordat je hem archiveert.");
        }
        check(await db.from("newsletters").update({ status: "archived" }).eq("id", id));
        await removeCalendarEntry(db, "newsletter", id);
        refresh();
        return ok("Nieuwsbrief gearchiveerd.");
      }
    }
  });
}
