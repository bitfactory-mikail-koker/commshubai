"use client";

import { useEffect, useState } from "react";
import { Lock, Save } from "lucide-react";
import { saveArticleContent } from "@/actions/articles";
import { FormField, SubmitButton, useAction } from "@/components/shared/actions";
import { Notice } from "@/components/shared/layout";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { wordCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChannelPreview } from "./channel-preview";
import { CommentsTab } from "./comments-tab";
import { RichTextEditor } from "./rich-text-editor";
import type { CommentItem, EditorArticle, VersionItem } from "./types";
import { VersionsTab } from "./versions-tab";

export function EditorWorkspace({
  article,
  readOnlyReason,
  versions,
  comments,
  currentUserId,
  canComment,
  canModerate,
  canRestore,
  organizationName,
  authorName,
}: {
  article: EditorArticle;
  /** When set, the text cannot be edited and this explains why. */
  readOnlyReason: string | null;
  versions: VersionItem[];
  comments: CommentItem[];
  currentUserId: string;
  canComment: boolean;
  /** May resolve other people's comments. */
  canModerate: boolean;
  canRestore: boolean;
  organizationName: string;
  authorName: string;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [tab, setTab] = useState("edit");
  const [title, setTitle] = useState(article.title);
  const [subtitle, setSubtitle] = useState(article.subtitle ?? "");
  const [html, setHtml] = useState(article.bodyHtml);
  const [changeSummary, setChangeSummary] = useState("");
  const [selection, setSelection] = useState("");

  const editable = readOnlyReason === null;
  const dirty = editable && (title !== article.title || subtitle !== (article.subtitle ?? "") || html !== article.bodyHtml);
  const words = wordCount(html);
  const openComments = comments.filter((c) => !c.resolved && !c.parent_id).length;

  // Warn before leaving the page with unsaved text.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const save = () =>
    run(() =>
      saveArticleContent({
        id: article.id,
        title,
        subtitle: subtitle.trim() || null,
        bodyHtml: html,
        changeSummary: changeSummary.trim() || undefined,
      }),
    );

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line">
          <TabsTrigger value="edit">Bewerken</TabsTrigger>
          <TabsTrigger value="preview">Voorbeeld</TabsTrigger>
          <TabsTrigger value="versions">
            Versies <span className="text-muted-foreground tabular-nums">{versions.length}</span>
          </TabsTrigger>
          <TabsTrigger value="comments">
            Opmerkingen{" "}
            <span className={cn("tabular-nums", openComments > 0 ? "font-semibold text-warning" : "text-muted-foreground")}>
              {openComments}
            </span>
          </TabsTrigger>
        </TabsList>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          <span className="tabular-nums">{words}</span> woorden
          {editable && (
            <>
              {" · "}
              {dirty ? (
                <span className="font-medium text-warning">Niet-opgeslagen wijzigingen</span>
              ) : (
                <span>Alles opgeslagen</span>
              )}
            </>
          )}
        </p>
      </div>

      <TabsContent value="edit" className="space-y-4">
        {readOnlyReason && (
          <Notice tone="warning" icon={Lock} title="Alleen-lezen">
            {readOnlyReason}
          </Notice>
        )}
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-3 rounded-lg border bg-card p-5">
            <FormField label="Titel" htmlFor="article-title" error={fieldErrors.title} required>
              {/* A textarea that grows with its content, so long titles never clip on narrow screens. */}
              <Textarea
                id="article-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
                readOnly={!editable}
                required
                minLength={3}
                maxLength={200}
                rows={1}
                className="min-h-10 resize-none py-2 text-base leading-6 font-semibold tracking-[-0.011em] md:text-base"
              />
            </FormField>
            <FormField label="Ondertitel" htmlFor="article-subtitle" error={fieldErrors.subtitle}>
              <Textarea
                id="article-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                readOnly={!editable}
                maxLength={300}
                rows={2}
                placeholder="Korte inleiding of onderkop (optioneel)"
                className="min-h-0 resize-none"
              />
            </FormField>
          </div>

          <RichTextEditor value={article.bodyHtml} editable={editable} onChange={setHtml} onSelectionChange={setSelection} />

          {editable && (
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
              <FormField
                label="Wat is er gewijzigd?"
                htmlFor="change-summary"
                help="Optioneel. Komt in de versiegeschiedenis te staan."
                className="flex-1"
              >
                <Input
                  id="change-summary"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  maxLength={200}
                  placeholder="Bijvoorbeeld: quote aangescherpt, cijfers gecontroleerd"
                />
              </FormField>
              <SubmitButton pending={pending} disabled={!dirty} className="sm:mb-[1.4rem]">
                {!pending && <Save />}
                Opslaan als versie {article.version + 1}
              </SubmitButton>
            </div>
          )}
        </form>
      </TabsContent>

      <TabsContent value="preview" className="space-y-3">
        {dirty && (
          <Notice tone="info">Je ziet de tekst zoals die nu in de editor staat, inclusief niet-opgeslagen wijzigingen.</Notice>
        )}
        <ChannelPreview
          channel={article.channel}
          contentType={article.contentType}
          title={title}
          subtitle={subtitle}
          html={html}
          organizationName={organizationName}
          authorName={authorName}
          date={article.publishedAt ?? article.publishAt}
        />
      </TabsContent>

      <TabsContent value="versions">
        <VersionsTab articleId={article.id} currentVersion={article.version} versions={versions} canRestore={canRestore && editable} />
      </TabsContent>

      <TabsContent value="comments">
        <CommentsTab
          articleId={article.id}
          comments={comments}
          currentUserId={currentUserId}
          canComment={canComment}
          canModerate={canModerate}
          selection={selection}
        />
      </TabsContent>
    </Tabs>
  );
}
