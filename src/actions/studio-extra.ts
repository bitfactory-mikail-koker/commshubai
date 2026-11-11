"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionSession } from "@/lib/auth";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const reorderSchema = z.object({
  newsletterId: z.uuid(),
  orderedIds: z.array(z.uuid()).min(1).max(200),
});

/**
 * Stores the complete item order of a newsletter. The builder groups items by
 * section, so a move within a section is sent as the full, flattened order.
 */
export async function reorderNewsletterItems(input: z.input<typeof reorderSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.edit");
    const data = reorderSchema.parse(input);
    const db = await createClient();

    const newsletter = unwrap(
      await db.from("newsletters").select("id, status, current_version").eq("id", data.newsletterId).single(),
    );
    if (!["draft", "changes_requested"].includes(newsletter.status)) {
      return fail("Deze nieuwsbrief is vergrendeld. Heropen hem als concept om de inhoud te wijzigen.");
    }

    const { data: items, error } = await db
      .from("newsletter_items")
      .select("id, position")
      .eq("newsletter_id", newsletter.id);
    if (error) throw new Error(error.message);

    const existing = new Map((items ?? []).map((item) => [item.id, item.position]));
    const unique = new Set(data.orderedIds);
    if (unique.size !== existing.size || data.orderedIds.some((id) => !existing.has(id))) {
      return fail("De volgorde is intussen gewijzigd. Vernieuw de pagina en probeer het opnieuw.");
    }

    for (const [position, id] of data.orderedIds.entries()) {
      if (existing.get(id) !== position) {
        check(await db.from("newsletter_items").update({ position }).eq("id", id));
      }
    }
    // A changed selection or order invalidates earlier approvals.
    check(await db.from("newsletters").update({ current_version: newsletter.current_version + 1 }).eq("id", newsletter.id));

    revalidatePath("/", "layout");
    return ok();
  });
}
