"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ListPlus, Pencil, Trash2 } from "lucide-react";
import { removeNewsletterItem, updateNewsletterItem } from "@/actions/newsletters";
import { reorderNewsletterItems } from "@/actions/studio-extra";
import { ActionButton, FormField, useAction } from "@/components/shared/actions";
import { ContentStatusBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { groupBySection, type BuilderItem } from "./items";

function ItemEditor({ item, onDone }: { item: BuilderItem; onDone: () => void }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState(item.customTitle ?? "");
  const [summary, setSummary] = useState(item.customSummary ?? "");
  const [section, setSection] = useState(item.section);
  const isCustom = !item.article;
  const invalid = !section.trim() || (isCustom && (title.trim().length < 3 || summary.trim().length < 10));

  return (
    <form
      className="space-y-3 rounded-lg border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            updateNewsletterItem({
              id: item.id,
              customTitle: title.trim() || null,
              customSummary: summary.trim() || null,
              section: section.trim(),
            }),
          { onSuccess: onDone },
        );
      }}
    >
      <FormField
        label="Titel in de nieuwsbrief"
        htmlFor={`item-title-${item.id}`}
        help={item.article ? "Leeg laten om de titel van het contentitem te gebruiken." : undefined}
      >
        <Input
          id={`item-title-${item.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={item.article?.title ?? "Titel"}
          maxLength={160}
          className="bg-card"
        />
      </FormField>
      <FormField
        label="Korte tekst"
        htmlFor={`item-summary-${item.id}`}
        help={item.article ? "Leeg laten om de samenvatting van het contentitem te gebruiken." : "Minimaal 10 tekens."}
      >
        <Textarea
          id={`item-summary-${item.id}`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={item.article?.excerpt ?? "Korte tekst"}
          rows={3}
          maxLength={1200}
          className="bg-card"
        />
      </FormField>
      <FormField label="Sectie" htmlFor={`item-section-${item.id}`}>
        <Input
          id={`item-section-${item.id}`}
          value={section}
          onChange={(e) => setSection(e.target.value)}
          maxLength={60}
          required
          className="bg-card"
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
          Annuleren
        </Button>
        <Button type="submit" size="sm" disabled={pending || invalid}>
          {pending ? "Opslaan…" : "Item opslaan"}
        </Button>
      </div>
    </form>
  );
}

export function ItemsPanel({
  newsletterId,
  items,
  editable,
  addButton,
}: {
  newsletterId: string;
  items: BuilderItem[];
  editable: boolean;
  /** "Item toevoegen" trigger, rendered in the empty state too. */
  addButton?: React.ReactNode;
}) {
  const toggle = useAction();
  const reorder = useAction();
  const [editingId, setEditingId] = useState<string | null>(null);
  const groups = groupBySection(items);
  const busy = toggle.pending || reorder.pending;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ListPlus}
        title="Nog geen items"
        description="Voeg goedgekeurde of gepubliceerde content toe, of schrijf een vrij item."
        action={addButton}
      />
    );
  }

  /** Swaps an item with its neighbour inside the same section and stores the full order. */
  const move = (sectionIndex: number, itemIndex: number, delta: number) => {
    const next = groups.map((g) => [...g.items]);
    const list = next[sectionIndex];
    const target = itemIndex + delta;
    if (target < 0 || target >= list.length) return;
    [list[itemIndex], list[target]] = [list[target], list[itemIndex]];
    reorder.run(() => reorderNewsletterItems({ newsletterId, orderedIds: next.flat().map((i) => i.id) }), { silent: true });
  };

  return (
    <div className="divide-y">
      {groups.map((group, sectionIndex) => (
        <div key={group.section} className="space-y-3 px-5 py-4">
          <h3 className="text-xs font-semibold text-muted-foreground ">{group.section}</h3>
          <ul className="space-y-3">
            {group.items.map((item, itemIndex) => (
              <li key={item.id} className="space-y-3">
                <div className={cn("flex items-start gap-3", !item.included && "opacity-60")}>
                  <Switch
                    checked={item.included}
                    disabled={!editable || busy}
                    onCheckedChange={(checked) =>
                      toggle.run(() => updateNewsletterItem({ id: item.id, included: checked }), { silent: true })
                    }
                    aria-label={`${item.title} ${item.included ? "uitsluiten van" : "opnemen in"} de nieuwsbrief`}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm leading-snug font-medium">{item.title || "Zonder titel"}</p>
                    {item.summary && <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">{item.summary}</p>}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5">
                      {item.article ? (
                        <>
                          <ContentStatusBadge status={item.article.status} />
                          <Link
                            href={`/editorial/${item.article.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-2"
                          >
                            {CONTENT_TYPE_LABELS[item.article.contentType]} openen
                          </Link>
                          {(item.customTitle || item.customSummary) && <ToneBadge tone="slate">Tekst aangepast</ToneBadge>}
                        </>
                      ) : (
                        <ToneBadge tone="slate">Vrij item</ToneBadge>
                      )}
                      {!item.included && <span className="text-xs text-muted-foreground">Niet opgenomen</span>}
                    </div>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                        aria-label="Item bewerken"
                        aria-expanded={editingId === item.id}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => move(sectionIndex, itemIndex, -1)}
                        disabled={itemIndex === 0 || busy}
                        aria-label="Item omhoog"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => move(sectionIndex, itemIndex, 1)}
                        disabled={itemIndex === group.items.length - 1 || busy}
                        aria-label="Item omlaag"
                      >
                        <ArrowDown />
                      </Button>
                      <ActionButton
                        action={removeNewsletterItem.bind(null, { id: item.id })}
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Item verwijderen"
                        confirm={{
                          title: "Item verwijderen uit de nieuwsbrief?",
                          description: item.article
                            ? "Het contentitem zelf blijft bestaan; je kunt het later opnieuw toevoegen."
                            : "Dit vrije item en de tekst ervan worden definitief verwijderd.",
                          confirmLabel: "Verwijderen",
                          destructive: true,
                        }}
                      >
                        <Trash2 />
                      </ActionButton>
                    </div>
                  )}
                </div>
                {editable && editingId === item.id && <ItemEditor item={item} onDone={() => setEditingId(null)} />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
