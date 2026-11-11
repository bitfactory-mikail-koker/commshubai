import "server-only";
import { escapeText } from "entities";
import escapeHtmlText from "escape-html";
import { compile } from "html-to-text";

const BLOCK = { leadingLineBreaks: 1, trailingLineBreaks: 1 };
const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const toPlainText = compile({
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "p", options: BLOCK },
    { selector: "div", options: BLOCK },
    { selector: "blockquote", format: "block", options: BLOCK },
    { selector: "ul", format: "block", options: BLOCK },
    { selector: "ol", format: "block", options: BLOCK },
    { selector: "li", format: "block", options: BLOCK },
    ...HEADINGS.map((selector) => ({ selector, options: { uppercase: false, ...BLOCK } })),
  ],
});

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return toPlainText(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(text: string): string {
  return escapeHtmlText(text);
}

export function escapeTextNode(text: string): string {
  return escapeText(text);
}

export function htmlBlocks(html: string | null | undefined): string[] {
  return stripHtml(html)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function wordCount(html: string | null | undefined): number {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function htmlTextLength(html: string | null | undefined): number {
  return stripHtml(html).length;
}
