"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { createSocialDrafts } from "@/actions/articles";
import { SubmitButton, useAction } from "@/components/shared/actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Lets the external agent draft a LinkedIn post for an existing external content item. */
export function CreateSocialDraft({ articles }: { articles: { id: string; title: string }[] }) {
  const [articleId, setArticleId] = useState<string>("");
  const { run, pending } = useAction();

  if (articles.length === 0) return null;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        if (!articleId) return;
        run(() => createSocialDrafts({ id: articleId }), { onSuccess: () => setArticleId("") });
      }}
    >
      <Select value={articleId} onValueChange={setArticleId}>
        <SelectTrigger className="w-full sm:w-72" aria-label="Kies een extern contentitem">
          <SelectValue placeholder="Kies een extern contentitem…" />
        </SelectTrigger>
        <SelectContent>
          {articles.map((article) => (
            <SelectItem key={article.id} value={article.id}>
              {article.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SubmitButton pending={pending} size="sm" variant="outline" disabled={!articleId}>
        {!pending && <Sparkles data-icon="inline-start" />}
        {pending ? "Concept schrijven…" : "LinkedIn-concept opstellen"}
      </SubmitButton>
    </form>
  );
}
