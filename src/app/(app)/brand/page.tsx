import type { Metadata } from "next";
import { BadgeCheck, Lock, Megaphone, Users } from "lucide-react";
import { Notice, PageHeader, Panel } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { fromJson } from "@/lib/json";
import { createClient } from "@/lib/supabase/server";
import type { TermRule } from "@/lib/types";
import { AssetManager, type AssetRow } from "./_components/asset-manager";
import { BrandForm, type BrandFormValues } from "./_components/brand-form";

export const metadata: Metadata = { title: "Merk & tone of voice" };

export default async function BrandPage() {
  const session = await requireSession();
  const db = await createClient();
  const canManage = can(session, "brand.manage");

  const [{ data: brand, error: brandError }, { data: assets, error: assetsError }] = await Promise.all([
    db.from("brand_guidelines").select("*").maybeSingle(),
    db
      .from("brand_assets")
      .select("id, category, name, mime_type, size_bytes, extracted_text, created_at, uploader:profiles(full_name)")
      .order("created_at", { ascending: false }),
  ]);
  if (brandError) throw new Error(brandError.message);
  if (assetsError) throw new Error(assetsError.message);

  const initial: BrandFormValues = {
    brandPersonality: brand?.brand_personality ?? "",
    writingStyle: brand?.writing_style ?? "",
    sentenceStructure: brand?.sentence_structure ?? "",
    toneInternal: brand?.tone_internal ?? "",
    toneExternal: brand?.tone_external ?? "",
    toneSocial: brand?.tone_social ?? "",
    communicationPolicies: brand?.communication_policies ?? "",
    boilerplate: brand?.boilerplate ?? "",
    wordsToAvoid: brand?.words_to_avoid ?? [],
    terminology: fromJson<TermRule[]>(brand?.preferred_terminology, []).map((t) => ({
      term: t.term ?? "",
      instead_of: t.instead_of ?? "",
      note: t.note ?? "",
    })),
  };

  const assetRows: AssetRow[] = (assets ?? []).map((a) => ({
    id: a.id,
    category: a.category,
    name: a.name,
    mimeType: a.mime_type,
    sizeBytes: a.size_bytes,
    usedAsContext: Boolean(a.extracted_text),
    createdAt: a.created_at,
    uploader: a.uploader?.full_name ?? null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Merk & tone of voice"
        description="Eén plek voor hoe de organisatie klinkt. Beide agents gebruiken deze instellingen bij elke tekst die ze schrijven."
        actions={
          brand?.updated_at ? (
            <span className="text-xs text-muted-foreground">Laatst bijgewerkt {formatDateTime(brand.updated_at)}</span>
          ) : undefined
        }
      />

      {!canManage && (
        <Notice tone="info" icon={Lock} title="Alleen-lezen">
          Je kunt de merkrichtlijnen inzien. Bewerken en uploaden kan alleen met het recht ‘Merkrichtlijnen beheren’.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <BrandForm key={brand?.updated_at ?? "new"} initial={initial} canManage={canManage} />

        <aside className="space-y-6">
          <Panel title="Zo gebruiken de agents dit">
            <ul className="space-y-4 text-sm leading-relaxed">
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Megaphone className="size-3.5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="font-medium">Externe agent</span>
                  <span className="block text-muted-foreground">
                    Schrijft met de externe toon; voor LinkedIn met de toon voor social media. Voegt bij externe stukken de
                    boilerplate toe.
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Users className="size-3.5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="font-medium">Interne agent</span>
                  <span className="block text-muted-foreground">
                    Schrijft updates, voorstelrondes en Slack- en e-mailconcepten met de interne toon.
                  </span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <BadgeCheck className="size-3.5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="font-medium">Merkcontrole op elk concept</span>
                  <span className="block text-muted-foreground">
                    Na elke generatie - en op verzoek in de editor - wordt de tekst gecontroleerd op:
                  </span>
                </span>
              </li>
            </ul>
            <ul className="mt-3 ml-10 list-disc space-y-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
              <li>woorden uit de lijst ‘Woorden om te vermijden’;</li>
              <li>termen waarvoor een voorkeursterm is vastgelegd;</li>
              <li>cijfers die niet in het bronmateriaal voorkomen;</li>
              <li>quotes die niet in een interview of bron terug te vinden zijn;</li>
              <li>open plekken ([AANVULLEN: …]) en erg lange zinnen.</li>
            </ul>
            <p className="mt-4 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
              Wijzigingen gelden direct voor nieuwe concepten. Bestaande teksten veranderen niet; voer daar de merkcontrole
              opnieuw uit.
            </p>
          </Panel>
        </aside>
      </div>

      <AssetManager assets={assetRows} canManage={canManage} />
    </div>
  );
}
