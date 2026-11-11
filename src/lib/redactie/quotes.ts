import { stripHtml } from "@/lib/format";

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

/** Text of every <blockquote> in a body, without markup. */
export function blockquotes(bodyHtml: string): string[] {
  const out: string[] = [];
  const re = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(bodyHtml))) {
    const text = stripHtml(match[1]).trim();
    if (text) out.push(text);
  }
  return out;
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Wraps the given quotes in <mark class="quote-mark"> inside sanitized HTML.
 * Only text between tags is touched, so markup and attributes stay as they
 * are; a quote that runs across inline markup is left unmarked. Matching
 * ignores the kind of quotation marks and whitespace.
 */
export function highlightQuotes(bodyHtml: string, quotes: string[]): string {
  // Punctuation and quotation marks may differ between the stored quote and the text; words may not.
  const patterns = quotes
    .map((quote) =>
      quote
        .replace(/[“”„"‘’«»]/g, "")
        .trim()
        .split(/\s+/)
        .map((word) => word.replace(/^[.,;:!?]+|[.,;:!?]+$/g, ""))
        .filter(Boolean)
        .map(escapeRegExp),
    )
    .filter((words) => words.length >= 3)
    .map((words) => new RegExp(words.join("[\\s“”„\"‘’«».,;:!?]+"), "i"));
  if (patterns.length === 0) return bodyHtml;

  return bodyHtml
    .split(/(<[^>]+>)/)
    .map((segment) => {
      if (segment.startsWith("<")) return segment;
      let text = segment;
      for (const pattern of patterns) text = text.replace(pattern, (match) => `<mark class="quote-mark">${match}</mark>`);
      return text;
    })
    .join("");
}

/** Removes the block quote (or sentence) that carries a quote. Returns null when it is not found. */
export function removeQuote(bodyHtml: string, quote: string): string | null {
  const target = normalizeQuote(quote);
  if (!target) return null;
  const core = target.slice(0, Math.max(16, Math.floor(target.length * 0.7)));

  let removed = false;
  let html = bodyHtml.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, (block) => {
    if (!removed && normalizeQuote(stripHtml(block)).includes(core)) {
      removed = true;
      return "";
    }
    return block;
  });
  if (removed) return html;

  // Not a block quote: drop the sentence that contains the quote.
  html = bodyHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (paragraph, inner: string) => {
    if (removed || !normalizeQuote(stripHtml(inner)).includes(core)) return paragraph;
    const sentences = inner.split(/(?<=[.!?][”"’]?)\s+/);
    const kept = sentences.filter((sentence) => !normalizeQuote(stripHtml(sentence)).includes(core.slice(0, 24)));
    removed = kept.length !== sentences.length;
    return kept.length > 0 ? `<p>${kept.join(" ")}</p>` : "";
  });
  return removed ? html : null;
}
