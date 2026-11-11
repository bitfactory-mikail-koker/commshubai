import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SEARCH_KIND_ORDER, SearchKind } from "./kinds";
import { parseSearchQuery } from "./query";

export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_PREVIEW_SIZE = 5;

const rowSchema = z.object({
  kind: z.enum(SearchKind),
  id: z.string(),
  parent_id: z.string().nullable(),
  title: z.string(),
  snippet: z.string(),
  status: z.string().nullable(),
  at: z.string(),
});

const responseSchema = z.object({
  counts: z.record(z.string(), z.number()),
  rows: z.array(rowSchema),
});

export type SearchHit = {
  kind: SearchKind;
  id: string;
  parentId: string | null;
  title: string;
  snippet: string;
  status: string | null;
  at: string;
};

export type SearchGroup = {
  kind: SearchKind;
  total: number;
  hits: SearchHit[];
};

export type SearchResults = {
  terms: string[];
  total: number;
  groups: SearchGroup[];
};

export class SearchError extends Error {
  constructor(detail: string) {
    super(`Zoeken is mislukt: ${detail}`);
    this.name = "SearchError";
  }
}

export async function searchAll(
  rawQuery: string | null | undefined,
  options: { kind?: SearchKind | null; page?: number } = {},
): Promise<SearchResults | null> {
  const parsed = parseSearchQuery(rawQuery);
  if (!parsed) return null;

  const kind = options.kind ?? null;
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const limit = kind ? SEARCH_PAGE_SIZE : SEARCH_PREVIEW_SIZE;
  const offset = kind ? (page - 1) * SEARCH_PAGE_SIZE : 0;

  const db = await createClient();
  const { data, error } = await db.rpc("search_all", {
    p_tsquery: parsed.tsquery,
    p_like: parsed.like,
    p_kind: kind ?? undefined,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new SearchError(error.message);

  const response = responseSchema.parse(data);
  const groups = SEARCH_KIND_ORDER.flatMap((groupKind): SearchGroup[] => {
    const total = response.counts[groupKind] ?? 0;
    if (total === 0) return [];
    const hits = response.rows
      .filter((row) => row.kind === groupKind)
      .map((row) => ({
        kind: row.kind,
        id: row.id,
        parentId: row.parent_id,
        title: row.title,
        snippet: row.snippet,
        status: row.status,
        at: row.at,
      }));
    return [{ kind: groupKind, total, hits }];
  });

  return {
    terms: parsed.terms,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    groups,
  };
}
