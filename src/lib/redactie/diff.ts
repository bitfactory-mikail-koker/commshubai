import { stripHtml } from "@/lib/format";

/**
 * Word-level comparison of two versions of a text. After a change, people who
 * already approved only have to look at what is different.
 */

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

/** Paragraph-aware plain text: block elements become line breaks. */
export function htmlToParagraphs(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "$&\n")
    .split("\n")
    .map((block) => stripHtml(block).trim())
    .filter(Boolean)
    .join("\n");
}

const tokenize = (text: string) => text.split(/(\s+)/).filter((token) => token.length > 0);

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);

  // Trim the common head and tail first: most edits touch a small part of the text.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };

  push("same", a.slice(0, head).join(""));

  if (midA.length * midB.length > 4_000_000) {
    // Too large to align precisely; show the middle as replaced.
    push("removed", midA.join(""));
    push("added", midB.join(""));
  } else {
    const rows = midA.length + 1;
    const cols = midB.length + 1;
    const table = new Uint32Array(rows * cols);
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        table[i * cols + j] =
          midA[i] === midB[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        push("same", midA[i]);
        i++;
        j++;
      } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
        push("removed", midA[i++]);
      } else {
        push("added", midB[j++]);
      }
    }
    while (i < midA.length) push("removed", midA[i++]);
    while (j < midB.length) push("added", midB[j++]);
  }

  push("same", a.slice(a.length - tail).join(""));
  return parts;
}

export function diffHtml(beforeHtml: string, afterHtml: string): DiffPart[] {
  return diffWords(htmlToParagraphs(beforeHtml), htmlToParagraphs(afterHtml));
}

export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((part) => part.type !== "same" && part.text.trim().length > 0);
}
