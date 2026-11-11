"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, FileUp, ImageIcon, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBrandAsset, getBrandAssetUrl, uploadBrandAsset } from "@/actions/brand";
import { ActionButton, useAction } from "@/components/shared/actions";
import { Panel } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AssetRow = {
  id: string;
  category: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  usedAsContext: boolean;
  createdAt: string;
  uploader: string | null;
};

const CATEGORIES: { key: string; label: string; description: string; accept?: string }[] = [
  { key: "guideline", label: "Merkrichtlijnen", description: "Brandbook, huisstijlhandboek en vergelijkbare documenten." },
  { key: "logo", label: "Logo's", description: "Logo's in de gangbare varianten en formaten.", accept: "image/*,.svg,.eps,.ai,.pdf" },
  { key: "visual", label: "Beeldmateriaal", description: "Foto's, illustraties en andere visuele middelen.", accept: "image/*,.pdf" },
  {
    key: "writing_example",
    label: "Schrijfvoorbeelden",
    description: "Teksten die laten zien hoe de organisatie schrijft. Tekstbestanden (.txt of .md) gaan als voorbeeld mee naar de agents.",
  },
  { key: "tone_document", label: "Tone-of-voice-documenten", description: "Uitgewerkte toon- en stijlgidsen." },
  { key: "policy", label: "Communicatiebeleid", description: "Beleidsstukken, woordvoeringslijnen en afspraken over publicatie." },
];

const MAX_BYTES = 20 * 1024 * 1024;

function formatSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`;
}

function OpenButton({ id, name }: { id: string; name: string }) {
  const [pending, setPending] = useState(false);
  const open = async () => {
    setPending(true);
    try {
      const result = await getBrandAssetUrl({ id });
      if (result.ok) window.open(result.data.url, "_blank", "noopener,noreferrer");
      else toast.error(result.error);
    } catch {
      toast.error("Het bestand kon niet worden geopend.");
    } finally {
      setPending(false);
    }
  };
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={open} disabled={pending} aria-label={`${name} openen`} title="Openen">
      {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
    </Button>
  );
}

function UploadControl({ category, accept }: { category: string; accept?: string }) {
  const { run, pending } = useAction();
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Het bestand is groter dan 20 MB.");
      return;
    }
    const formData = new FormData();
    formData.set("category", category);
    formData.set("file", file);
    run(() => uploadBrandAsset(formData));
  };

  return (
    <>
      <input ref={inputRef} type="file" className="sr-only" accept={accept} onChange={onChange} tabIndex={-1} aria-hidden />
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-busy={pending} onClick={() => inputRef.current?.click()}>
        {pending ? <Loader2 className="animate-spin" /> : <FileUp />}
        {pending ? "Uploaden…" : "Bestand uploaden"}
      </Button>
    </>
  );
}

export function AssetManager({ assets, canManage }: { assets: AssetRow[]; canManage: boolean }) {
  return (
    <Panel
      title="Documenten en beeld"
      description="Privé opgeslagen per organisatie. Maximaal 20 MB per bestand. Bestanden openen via een tijdelijke link van vijf minuten."
      flush
    >
      <div className="divide-y">
        {CATEGORIES.map((category) => {
          const files = assets.filter((a) => a.category === category.key);
          return (
            <section key={category.key} className="px-5 py-5" aria-labelledby={`cat-${category.key}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <h3 id={`cat-${category.key}`} className="text-sm font-medium">
                    {category.label}{" "}
                    <span className="font-normal text-muted-foreground tabular-nums">({files.length})</span>
                  </h3>
                  <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{category.description}</p>
                </div>
                {canManage && <UploadControl category={category.key} accept={category.accept} />}
              </div>

              {files.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
                  Nog geen bestanden in deze categorie.
                </p>
              ) : (
                <ul className="mt-3 divide-y rounded-lg border">
                  {files.map((file) => {
                    const isImage = file.mimeType?.startsWith("image/");
                    const Icon = isImage ? ImageIcon : FileText;
                    return (
                      <li key={file.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Icon className="size-4" strokeWidth={1.5} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span>{formatSize(file.sizeBytes)}</span>
                            <span aria-hidden>·</span>
                            <span>{formatDate(file.createdAt)}</span>
                            {file.uploader && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{file.uploader}</span>
                              </>
                            )}
                            {file.usedAsContext && (
                              <span
                                className={cn("inline-flex items-center gap-1 font-medium text-success")}
                                title="De tekst van dit bestand is beschikbaar als context voor de agents"
                              >
                                <Sparkles className="size-3" />
                                Context voor agents
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <OpenButton id={file.id} name={file.name} />
                          {canManage && (
                            <ActionButton
                              action={deleteBrandAsset.bind(null, { id: file.id })}
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${file.name} verwijderen`}
                              title="Verwijderen"
                              confirm={{
                                title: "Bestand verwijderen?",
                                description: `“${file.name}” wordt definitief verwijderd en is niet meer beschikbaar voor de agents.`,
                                confirmLabel: "Verwijderen",
                                destructive: true,
                              }}
                            >
                              <Trash2 className="text-muted-foreground" />
                            </ActionButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
