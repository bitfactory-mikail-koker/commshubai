import escapeRegExp from "escape-string-regexp";
import { SNIPPET_END, SNIPPET_START } from "@/lib/search/markers";

export const MIN_HIGHLIGHT_LENGTH = 2;

export type TextPart = { text: string; match: boolean };

export function highlightTerms(text: string, terms: string[]): TextPart[] {
  const usable = terms.filter((term) => term.length >= MIN_HIGHLIGHT_LENGTH);
  if (usable.length === 0 || text.length === 0) return [{ text, match: false }];
  const pattern = new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "giu");
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, match: usable.some((term) => term.toLowerCase() === part.toLowerCase()) }));
}

export function splitSnippet(snippet: string, terms: string[] = []): TextPart[] {
  const parts: TextPart[] = [];
  const plain = (text: string) => parts.push(...highlightTerms(text, terms));
  let rest = snippet;
  while (rest.length > 0) {
    const start = rest.indexOf(SNIPPET_START);
    if (start === -1) {
      plain(rest);
      break;
    }
    if (start > 0) plain(rest.slice(0, start));
    const end = rest.indexOf(SNIPPET_END, start + 1);
    if (end === -1) {
      plain(rest.slice(start + 1));
      break;
    }
    parts.push({ text: rest.slice(start + 1, end), match: true });
    rest = rest.slice(end + 1);
  }
  return parts;
}

function Parts({ parts }: { parts: TextPart[] }) {
  return parts.map((part, index) =>
    part.match ? (
      <mark key={index} className="rounded-xs bg-warning-soft px-0.5 font-medium text-foreground">
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}

export function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  return <Parts parts={highlightTerms(text, terms)} />;
}

export function SearchResultSnippet({ snippet, terms }: { snippet: string; terms: string[] }) {
  return (
    <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
      <Parts parts={splitSnippet(snippet, terms)} />
    </p>
  );
}
