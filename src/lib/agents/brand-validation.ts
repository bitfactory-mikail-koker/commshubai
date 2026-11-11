import escapeRegExp from "escape-string-regexp";
import { stripHtml } from "@/lib/html-text";
import type { BrandCheck, BrandIssue, Classification, TermRule } from "@/lib/types";

/**
 * Deterministic brand & fact validation. Runs on every generated draft and on
 * demand from the editor, independent of the AI provider.
 *
 * Besides tone-of-voice rules it guards the "never invent facts" rule: numbers
 * and quotes in the text must be traceable to the source material.
 */

const normalize = (t: string) =>
  t
    .toLowerCase()
    .replace(/[„“”"'’‘.,;:!?()\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();


export function validateBrand(input: {
  html: string;
  title?: string;
  wordsToAvoid: string[];
  terminology: TermRule[];
  sourceTexts: string[];
  classification: Classification;
  /** Names that must not appear, e.g. a customer who may only be described anonymously. */
  forbiddenNames?: string[];
  /** Findings established outside this function (e.g. internal-only source material). */
  extraIssues?: BrandIssue[];
}): BrandCheck {
  const issues: BrandIssue[] = [];
  const text = `${input.title ?? ""}\n${stripHtml(input.html)}`;
  const lower = text.toLowerCase();
  const sourceNormalized = normalize(input.sourceTexts.join("\n"));
  const sourceDigits = input.sourceTexts.join("\n").replace(/\s+/g, " ");

  // 1. Words to avoid (including common Dutch inflections: -e, -en, -f → -ve)
  for (const word of input.wordsToAvoid) {
    const w = word.trim().toLowerCase();
    if (!w) continue;
    const variants = [w, `${w}e`, `${w}en`];
    if (w.endsWith("f")) variants.push(`${w.slice(0, -1)}ve`, `${w.slice(0, -1)}ver`);
    const pattern = new RegExp(`(?<![\\p{L}])(?:${variants.map(escapeRegExp).join("|")})(?![\\p{L}])`, "gu");
    const matches = lower.match(pattern);
    if (matches?.length) {
      issues.push({
        severity: "warning",
        type: "word_to_avoid",
        message: `Het woord “${word.trim()}” staat op de lijst met te vermijden woorden (${matches.length}×).`,
        excerpt: matches[0],
      });
    }
  }

  // 2. Preferred terminology
  for (const rule of input.terminology) {
    const avoid = rule.instead_of?.trim();
    if (!avoid || !rule.term?.trim()) continue;
    if (new RegExp(`(?<![\\p{L}])${escapeRegExp(avoid.toLowerCase())}(?![\\p{L}])`, "u").test(lower)) {
      issues.push({
        severity: "warning",
        type: "terminology",
        message: `Gebruik “${rule.term}” in plaats van “${avoid}”.`,
        excerpt: avoid,
      });
    }
  }

  // 3. Numbers that cannot be traced to the source material
  const numberPattern = /\d+(?:[.,]\d+)?(?:\s?(?:%|procent))?/g;
  const seenNumbers = new Set<string>();
  for (const match of text.match(numberPattern) ?? []) {
    const raw = match.trim();
    const digits = raw.replace(/\s?(?:%|procent)/, "");
    const isPercentage = /%|procent/.test(raw);
    if (!isPercentage && digits.replace(/[.,]/g, "").length < 2) continue; // ignore single digits
    if (seenNumbers.has(digits)) continue;
    seenNumbers.add(digits);
    const found = new RegExp(`(?<![\\d.,])${escapeRegExp(digits)}(?![\\d])`).test(sourceDigits);
    if (!found) {
      issues.push({
        severity: "error",
        type: "unverified_number",
        message: `Het cijfer “${raw}” komt niet voor in het bronmateriaal. Controleer de herkomst.`,
        excerpt: raw,
      });
    }
  }

  // 4. Quotes that cannot be traced to the source material
  const quotePattern = /[„“"]([^„“”"]{20,400})[”"]/g;
  let quoteMatch: RegExpExecArray | null;
  while ((quoteMatch = quotePattern.exec(text)) !== null) {
    const quote = quoteMatch[1];
    const probe = normalize(quote).slice(0, 45);
    if (probe.length >= 15 && !sourceNormalized.includes(probe)) {
      issues.push({
        severity: "error",
        type: "unverified_quote",
        message: "Deze quote is niet terug te vinden in het interview of bronmateriaal.",
        excerpt: quote.length > 90 ? `${quote.slice(0, 90)}…` : quote,
      });
    }
  }

  // 5. Open placeholders
  const placeholders = text.match(/\[AANVULLEN[^\]]*\]/g) ?? [];
  for (const placeholder of placeholders) {
    issues.push({
      severity: "warning",
      type: "open_placeholder",
      message: "Er staat nog een open plek in de tekst die aangevuld moet worden.",
      excerpt: placeholder,
    });
  }

  // 6. Readability: very long sentences
  const longSentences = text
    .split(/(?<=[.!?][”"’')]?)\s+|\n+/)
    .filter((s) => s.split(/\s+/).filter(Boolean).length > 35);
  if (longSentences.length > 0) {
    issues.push({
      severity: "info",
      type: "long_sentence",
      message: `${longSentences.length} zin(nen) zijn langer dan 35 woorden. Overweeg ze op te splitsen.`,
      excerpt: `${longSentences[0].slice(0, 90)}…`,
    });
  }

  // 7. External content must not reference internal systems
  if (input.classification === "external") {
    const internalRef = text.match(/#[a-z0-9][a-z0-9_-]{2,}|\b[A-Z]{2,6}-\d{2,5}\b/);
    if (internalRef) {
      issues.push({
        severity: "warning",
        type: "confidential",
        message: "De tekst verwijst naar een intern kanaal of ticketnummer. Verwijder dit uit externe content.",
        excerpt: internalRef[0],
      });
    }
  }

  // 8. Names that must stay out (anonymous customer)
  for (const name of input.forbiddenNames ?? []) {
    const clean = name.trim();
    if (clean.length < 3) continue;
    if (lower.includes(clean.toLowerCase())) {
      issues.push({
        severity: "error",
        type: "confidential",
        message: `“${clean}” mag in dit stuk niet bij naam worden genoemd.`,
        excerpt: clean,
      });
    }
  }
  issues.push(...(input.extraIssues ?? []));

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  return {
    checked_at: new Date().toISOString(),
    score: Math.max(0, 100 - errors * 15 - warnings * 6 - infos * 2),
    issues,
  };
}
