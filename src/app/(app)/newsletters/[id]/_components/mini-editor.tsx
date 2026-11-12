"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact rich-text field for the newsletter introduction and conclusion. */
export function MiniEditor({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false })],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "prose-editorial prose-compact min-h-28! px-3.5 py-3",
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  const tools = [
    { key: "bold", label: "Vet", icon: Bold, run: () => editor?.chain().focus().toggleBold().run() },
    { key: "italic", label: "Cursief", icon: Italic, run: () => editor?.chain().focus().toggleItalic().run() },
    { key: "bulletList", label: "Opsomming", icon: List, run: () => editor?.chain().focus().toggleBulletList().run() },
  ];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-70",
      )}
    >
      <div className="flex items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1" role="toolbar" aria-label={`Opmaak ${ariaLabel}`}>
        {tools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={tool.run}
            disabled={disabled || !editor}
            aria-label={tool.label}
            aria-pressed={editor?.isActive(tool.key) ?? false}
            title={tool.label}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              editor?.isActive(tool.key) && "bg-foreground/10 text-foreground",
            )}
          >
            <tool.icon className="size-3.5" strokeWidth={2} />
          </button>
        ))}
      </div>
      {editor ? <EditorContent editor={editor} /> : <div className="min-h-28 px-3.5 py-3" aria-hidden />}
    </div>
  );
}
