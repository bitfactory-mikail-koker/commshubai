"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { addNewsletterItem } from "@/actions/newsletters";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { ContentStatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_TYPE_LABELS } from "@/lib/constants";
import type { AgentKind } from "@/lib/types";
import type { EligibleArticle } from "./items";

const READY = ["approved", "scheduled", "published"];

export function AddItemDialog({
  newsletterId,
  kind,
  articles,
  variant = "outline",
}: {
  newsletterId: string;
  kind: AgentKind;
  articles: EligibleArticle[];
  variant?: "outline" | "default";
}) {
  const [open, setOpen] = useState(false);
  const add = useAction();
  const custom = useAction();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [section, setSection] = useState(kind === "external" ? "Ontwikkelingen" : "Organisatienieuws");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <Plus />
          Item toevoegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Item toevoegen</DialogTitle>
          <DialogDescription>
            Kies een bestaand {kind === "external" ? "extern" : "intern"} contentitem of schrijf een vrij item voor deze nieuwsbrief.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="existing">
          <TabsList variant="line">
            <TabsTrigger value="existing">Bestaand contentitem</TabsTrigger>
            <TabsTrigger value="custom">Vrij item</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="pt-3">
            {articles.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Geen contentitems beschikbaar"
                description={`Alle ${kind === "external" ? "externe" : "interne"} contentitems staan al in deze nieuwsbrief, of er zijn er nog geen.`}
                className="py-8"
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {articles.map((article) => {
                  const ready = READY.includes(article.status);
                  return (
                    <li key={article.id} className="flex items-start gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground ">
                          {CONTENT_TYPE_LABELS[article.contentType]}
                        </p>
                        <p className="text-sm leading-snug font-medium">{article.title}</p>
                        {article.excerpt && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{article.excerpt}</p>}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <ContentStatusBadge status={article.status} />
                          {!ready && <span className="text-xs text-warning">Nog niet goedgekeurd</span>}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={add.pending}
                        onClick={() => {
                          setAddingId(article.id);
                          add.run(() => addNewsletterItem({ newsletterId, articleId: article.id }));
                        }}
                      >
                        {add.pending && addingId === article.id ? "Toevoegen…" : "Toevoegen"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="custom" className="pt-3">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                custom.run(() => addNewsletterItem({ newsletterId, customTitle: title, customSummary: summary, section }), {
                  onSuccess: () => {
                    setTitle("");
                    setSummary("");
                    setOpen(false);
                  },
                });
              }}
            >
              <FormField label="Titel" htmlFor="custom-item-title" required>
                <Input id="custom-item-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={160} />
              </FormField>
              <FormField
                label="Tekst"
                htmlFor="custom-item-summary"
                help="Een korte tekst van minimaal 10 tekens. Gebruik alleen informatie die gedeeld mag worden."
                required
              >
                <Textarea
                  id="custom-item-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                  required
                  minLength={10}
                  maxLength={1200}
                />
              </FormField>
              <FormField label="Sectie" htmlFor="custom-item-section" required>
                <Input id="custom-item-section" value={section} onChange={(e) => setSection(e.target.value)} required maxLength={60} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={custom.pending}>
                  Annuleren
                </Button>
                <SubmitButton pending={custom.pending}>Vrij item toevoegen</SubmitButton>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
