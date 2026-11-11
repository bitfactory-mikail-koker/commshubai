"use client";

import { useEffect, useState } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { CharacterCount } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SafeHtml } from "@/lib/safe-html";
import { cn } from "@/lib/utils";

const fromSchemaOutput = (html: string): SafeHtml => html as SafeHtml;

function ToolbarButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          // Keep the text selection in the editor when clicking a tool.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
            active && "bg-secondary text-foreground ring-1 ring-border ring-inset hover:bg-secondary",
          )}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const openLinkDialog = () => {
    setUrl((editor.getAttributes("link").href as string | undefined) ?? "https://");
    setLinkError(null);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = url.trim();
    if (!/^(https?:\/\/|mailto:).+/i.test(href)) {
      setLinkError("Vul een volledige link in die begint met https:// of mailto:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5" role="toolbar" aria-label="Opmaak">
      <ToolbarButton icon={Bold} label="Vet" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Cursief" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        icon={Heading2}
        label="Tussenkop"
        active={state.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={Heading3}
        label="Kleine tussenkop"
        active={state.h3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton
        icon={List}
        label="Opsomming"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={ListOrdered}
        label="Genummerde lijst"
        active={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={Quote}
        label="Citaat"
        active={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ToolbarButton icon={Link2} label={state.link ? "Link wijzigen" : "Link toevoegen"} active={state.link} onClick={openLinkDialog} />
      {state.link && (
        <ToolbarButton icon={Link2Off} label="Link verwijderen" onClick={() => editor.chain().focus().unsetLink().run()} />
      )}
      <span className="ml-auto flex items-center gap-0.5">
        <ToolbarButton icon={Undo2} label="Ongedaan maken" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()} />
        <ToolbarButton icon={Redo2} label="Opnieuw" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()} />
      </span>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              applyLink();
            }}
          >
            <DialogHeader>
              <DialogTitle>Link</DialogTitle>
              <DialogDescription>De link wordt toegepast op de geselecteerde tekst.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                aria-label="Link"
                aria-invalid={Boolean(linkError)}
                autoFocus
              />
              {linkError && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  {linkError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                Annuleren
              </Button>
              <Button type="submit">Toepassen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Tiptap editor limited to the formatting the server-side sanitizer keeps
 * (paragraphs, h2/h3, lists, quotes, bold, italic, links).
 */
export function RichTextEditor({
  value,
  editable,
  onChange,
  onSelectionChange,
}: {
  value: string;
  editable: boolean;
  onChange: (content: { html: string; safeHtml: SafeHtml; text: string; words: number }) => void;
  onSelectionChange: (text: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      CharacterCount,
      Placeholder.configure({ placeholder: "Begin met schrijven, of laat de agent een eerste concept maken…" }),
    ],
    content: value,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "tiptap prose-editorial px-6 py-5 sm:px-8", "aria-label": "Tekst van het contentitem" },
    },
    onUpdate: ({ editor: e }) =>
      onChange({
        html: e.isEmpty ? "" : e.getHTML(),
        safeHtml: fromSchemaOutput(e.isEmpty ? "" : e.getHTML()),
        text: e.getText({ blockSeparator: "\n" }).trim(),
        words: e.storage.characterCount.words(),
      }),
    onSelectionUpdate: ({ editor: e }) => {
      const { from, to } = e.state.selection;
      onSelectionChange(from === to ? "" : e.state.doc.textBetween(from, to, " ").trim());
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return <div className="min-h-[26rem] animate-pulse rounded-lg border bg-muted/40" aria-busy="true" aria-label="Editor wordt geladen" />;
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", !editable && "bg-muted/20")}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
