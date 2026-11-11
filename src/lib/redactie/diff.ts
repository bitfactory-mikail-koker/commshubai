import { diffWords as diffWordTokens } from "diff";
import { htmlBlocks } from "@/lib/html-text";

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

export function htmlToParagraphs(html: string): string {
  return htmlBlocks(html).join("\n");
}

export function diffWords(before: string, after: string): DiffPart[] {
  return diffWordTokens(before, after).map((change) => ({
    type: change.added ? "added" : change.removed ? "removed" : "same",
    text: change.value,
  }));
}

export function diffHtml(beforeHtml: string, afterHtml: string): DiffPart[] {
  return diffWords(htmlToParagraphs(beforeHtml), htmlToParagraphs(afterHtml));
}

export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((part) => part.type !== "same" && part.text.trim().length > 0);
}
