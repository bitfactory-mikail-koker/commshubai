import { htmlBlocks } from "@/lib/html-text";

/**
 * Which source supports which paragraph. A rough, explainable match on the
 * words and numbers a paragraph shares with a source; it helps an editor check
 * a text, it does not prove anything.
 */

export type SourceText = { label: string; text: string; internalOnly?: boolean };
export type TracedBlock = { text: string; sources: string[]; internalOnly: boolean };

const STOP = new Set(
  "aan aangezien achter alle alleen als altijd andere anders bij daar daarna daarom dat deze die dit door een eens eerst elke geen geweest haar had heb hebben heeft hem het hier hij hoe hun iets ik in is ja je kan kon kunnen maar me meer men met mij mijn moet na naar niet niets nog nu of om omdat onder ons onze ook op over reeds te tegen toch toen tot uit van veel voor want waren was wat we wel werd wezen wie wij wil worden wordt zal ze zei zelf zich zij zijn zo zonder zou".split(
    " ",
  ),
);

function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}%,.]+/u)) {
    const clean = word.replace(/^[.,]+|[.,]+$/g, "");
    if (!clean) continue;
    if (/\d/.test(clean)) out.add(clean);
    else if (clean.length > 3 && !STOP.has(clean)) out.add(clean);
  }
  return out;
}

/** Splits a body into its blocks (paragraphs, headings, list items, quotes) as plain text. */
export function blocksOf(bodyHtml: string): string[] {
  return htmlBlocks(bodyHtml).map((block) => block.replace(/\s+/g, " "));
}

export function traceBlocks(blocks: string[], sources: SourceText[]): TracedBlock[] {
  const indexed = sources.map((source) => ({ ...source, terms: terms(source.text) }));
  return blocks.map((text) => {
    const own = terms(text);
    const matches: { label: string; internalOnly: boolean; score: number }[] = [];
    for (const source of indexed) {
      let shared = 0;
      let numbers = 0;
      for (const term of own) {
        if (!source.terms.has(term)) continue;
        shared++;
        if (/\d/.test(term)) numbers++;
      }
      const score = own.size ? shared / own.size : 0;
      // A shared figure is strong evidence; otherwise a third of the meaningful words must come back.
      if (numbers > 0 || (shared >= 3 && score >= 0.34)) matches.push({ label: source.label, internalOnly: Boolean(source.internalOnly), score: score + numbers });
    }
    matches.sort((a, b) => b.score - a.score);
    return {
      text,
      sources: Array.from(new Set(matches.map((m) => m.label))).slice(0, 3),
      internalOnly: matches.some((m) => m.internalOnly),
    };
  });
}

/** Sentences of a body, for the sentence-by-sentence final check. */
export function sentencesOf(bodyHtml: string): string[] {
  return blocksOf(bodyHtml).flatMap((block) => block.split(/(?<=[.!?][”"’')]?)\s+/).filter((s) => s.trim().length > 0));
}
