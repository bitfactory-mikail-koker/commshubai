import escapeRegExp from "escape-string-regexp";
import { parse, TextNode, type Node } from "node-html-parser";
import { stripHtml } from "@/lib/html-text";

/**
 * Finding someone's own words in a text. Used to decide whose consent a piece
 * needs (only the person quoted can approve a quote) and to highlight those
 * quotes on the preview page.
 */

export function normalizeQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”„"'‘’«»]/g, "")
    .replace(/[.,;:!?()…-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function blockquotes(bodyHtml: string): string[] {
  return parse(bodyHtml)
    .querySelectorAll("blockquote")
    .map((quote) => stripHtml(quote.innerHTML).trim())
    .filter(Boolean);
}

export type Speaker = {
  interviewId: string;
  profileId: string | null;
  name: string;
  /** Quotes selected in the interview summary. */
  summaryQuotes: string[];
  /** Everything this person answered. */
  answers: string[];
};

export type AttributedQuote = { text: string; interviewId: string; profileId: string | null; speaker: string };

/**
 * Quotes in the body that can be traced to an interviewee: quotes from the
 * interview summary that appear in the text, and block quotes whose words come
 * from that person's answers.
 */
export function attributeQuotes(bodyHtml: string, speakers: Speaker[]): AttributedQuote[] {
  const body = normalizeQuote(stripHtml(bodyHtml));
  const found: AttributedQuote[] = [];
  const seen = new Set<string>();
  const add = (text: string, speaker: Speaker) => {
    const key = `${speaker.interviewId}:${normalizeQuote(text)}`;
    if (seen.has(key)) return;
    // A summary quote and the block quote that carries it are one quote.
    for (const existing of found) {
      if (existing.interviewId !== speaker.interviewId) continue;
      const a = normalizeQuote(existing.text);
      const b = normalizeQuote(text);
      if (a.includes(b) || b.includes(a)) return;
    }
    seen.add(key);
    found.push({ text: text.trim(), interviewId: speaker.interviewId, profileId: speaker.profileId, speaker: speaker.name });
  };

  for (const speaker of speakers) {
    for (const quote of speaker.summaryQuotes) {
      const normalized = normalizeQuote(quote);
      if (normalized.length >= 12 && body.includes(normalized)) add(quote, speaker);
    }
  }

  for (const quote of blockquotes(bodyHtml)) {
    const normalized = normalizeQuote(quote);
    if (normalized.length < 12) continue;
    // The attribution line ("- Naam, functie") is not part of what was said.
    const core = normalized.slice(0, Math.max(24, Math.floor(normalized.length * 0.7)));
    const speaker = speakers.find((s) => s.answers.some((answer) => normalizeQuote(answer).includes(core)));
    if (speaker) add(quote, speaker);
  }
  return found;
}

function textNodes(node: Node): TextNode[] {
  return node.childNodes.flatMap((child) => (child instanceof TextNode ? [child] : textNodes(child)));
}

export function highlightQuotes(bodyHtml: string, quotes: string[]): string {
  const patterns = quotes
    .map((quote) =>
      quote
        .replace(/[“”„"‘’«»]/g, "")
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/^[.,;:!?]+|[.,;:!?]+$/g, ""))
        .filter(Boolean)
        .map((word) => escapeRegExp(word)),
    )
    .filter((words) => words.length >= 3)
    .map((words) => new RegExp(words.join("[\\s“”„\"‘’«».,;:!?]+"), "i"));
  if (patterns.length === 0) return bodyHtml;

  const root = parse(bodyHtml);
  for (const node of textNodes(root)) {
    let text = node.rawText;
    for (const pattern of patterns) text = text.replace(pattern, (match) => `<mark class="quote-mark">${match}</mark>`);
    if (text !== node.rawText) node.parentNode?.exchangeChild(node, parse(text));
  }
  return root.toString();
}

export function removeQuote(bodyHtml: string, quote: string): string | null {
  const target = normalizeQuote(quote);
  if (!target) return null;
  const core = target.slice(0, Math.max(16, Math.floor(target.length * 0.7)));

  const root = parse(bodyHtml);
  const block = root.querySelectorAll("blockquote").find((candidate) => normalizeQuote(stripHtml(candidate.innerHTML)).includes(core));
  if (block) {
    block.remove();
    return root.toString();
  }

  for (const paragraph of root.querySelectorAll("p")) {
    if (!normalizeQuote(stripHtml(paragraph.innerHTML)).includes(core)) continue;
    const sentences = paragraph.innerHTML.split(/(?<=[.!?][”"’]?)\s+/);
    const kept = sentences.filter((sentence) => !normalizeQuote(stripHtml(sentence)).includes(core.slice(0, 24)));
    if (kept.length === sentences.length) continue;
    if (kept.length > 0) paragraph.set_content(kept.join(" "));
    else paragraph.remove();
    return root.toString();
  }
  return null;
}
