"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { toJson } from "@/lib/json";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");

const guidelinesSchema = z.object({
  brandPersonality: z.string().trim().max(3000),
  writingStyle: z.string().trim().max(3000),
  sentenceStructure: z.string().trim().max(3000),
  toneInternal: z.string().trim().max(3000),
  toneExternal: z.string().trim().max(3000),
  toneSocial: z.string().trim().max(3000),
  communicationPolicies: z.string().trim().max(6000),
  boilerplate: z.string().trim().max(1500),
  wordsToAvoid: z.array(z.string().trim().min(1).max(60)).max(100),
  terminology: z
    .array(
      z.object({
        term: z.string().trim().min(1, "Vul de voorkeursterm in.").max(80),
        instead_of: z.string().trim().min(1, "Vul in welke term vermeden moet worden.").max(80),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .max(100),
});

export async function saveBrandGuidelines(input: z.input<typeof guidelinesSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("brand.manage");
    const data = guidelinesSchema.parse(input);
    const db = await createClient();
    check(
      await db.from("brand_guidelines").upsert(
        {
          organization_id: session.organization.id,
          brand_personality: data.brandPersonality,
          writing_style: data.writingStyle,
          sentence_structure: data.sentenceStructure,
          tone_internal: data.toneInternal,
          tone_external: data.toneExternal,
          tone_social: data.toneSocial,
          communication_policies: data.communicationPolicies,
          boilerplate: data.boilerplate,
          words_to_avoid: Array.from(new Set(data.wordsToAvoid)),
          preferred_terminology: toJson(data.terminology),
          updated_by: session.userId,
        },
        { onConflict: "organization_id" },
      ),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "brand.updated",
      entityType: "brand_guidelines",
      summary: "Merkrichtlijnen en tone of voice bijgewerkt. Beide agents gebruiken de nieuwe instellingen vanaf nu.",
    });
    refresh();
    return ok("Merkrichtlijnen opgeslagen.");
  });
}

const CATEGORIES = ["guideline", "logo", "visual", "writing_example", "tone_document", "policy"] as const;
const MAX_BYTES = 20 * 1024 * 1024;
const TEXT_TYPES = ["text/plain", "text/markdown", "text/html", "text/csv"];

export async function uploadBrandAsset(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("brand.manage");
    const category = z.enum(CATEGORIES).parse(formData.get("category"));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Kies een bestand om te uploaden.");
    if (file.size > MAX_BYTES) return fail("Het bestand is groter dan 20 MB.");

    const db = await createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${session.organization.id}/${category}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await db.storage
      .from("brand-assets")
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    // Text files double as context for the agents (e.g. writing examples).
    let extractedText: string | null = null;
    if (TEXT_TYPES.includes(file.type) || /\.(txt|md)$/i.test(file.name)) {
      extractedText = (await file.text()).slice(0, 20_000);
    }

    const { error } = await db.from("brand_assets").insert({
      organization_id: session.organization.id,
      category,
      name: file.name.slice(0, 160),
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      extracted_text: extractedText,
      uploaded_by: session.userId,
    });
    if (error) {
      await db.storage.from("brand-assets").remove([path]);
      throw new Error(error.message);
    }
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "brand.asset_uploaded",
      entityType: "brand_asset",
      summary: `Merkbestand geüpload: ${file.name}.`,
    });
    refresh();
    return ok(
      extractedText
        ? "Bestand geüpload. De tekst is beschikbaar als context voor de agents."
        : "Bestand geüpload.",
    );
  });
}

export async function deleteBrandAsset(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("brand.manage");
    const db = await createClient();
    const asset = unwrap(await db.from("brand_assets").select("*").eq("id", z.uuid().parse(input.id)).single());
    const { error: storageError } = await db.storage.from("brand-assets").remove([asset.storage_path]);
    if (storageError) console.error("[brand] storage delete failed", storageError.message);
    check(await db.from("brand_assets").delete().eq("id", asset.id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "brand.asset_deleted",
      entityType: "brand_asset",
      summary: `Merkbestand verwijderd: ${asset.name}.`,
    });
    refresh();
    return ok("Bestand verwijderd.");
  });
}

/** Short-lived signed URL to view or download a private brand asset. */
export async function getBrandAssetUrl(input: { id: string }): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    await requireActionSession();
    const db = await createClient();
    const asset = unwrap(await db.from("brand_assets").select("storage_path").eq("id", z.uuid().parse(input.id)).single());
    const { data, error } = await db.storage.from("brand-assets").createSignedUrl(asset.storage_path, 300);
    if (error || !data) throw new Error(error?.message ?? "Het bestand kon niet worden geopend.");
    return ok(undefined, { url: data.signedUrl });
  });
}
