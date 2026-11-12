export const MAX_QUERY_LENGTH = 120;
export const MAX_TERMS = 8;
export const MIN_TERM_LENGTH = 2;

export type ParsedQuery = {
  terms: string[];
  tsquery: string;
  like: string;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function parseSearchQuery(raw: string | null | undefined): ParsedQuery | null {
  const trimmed = (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const terms = trimmed
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= MIN_TERM_LENGTH)
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return {
    terms,
    tsquery: terms.map((term) => `${term}:*`).join(" & "),
    like: `%${escapeLike(trimmed)}%`,
  };
}
