import { SEARCH_KINDS, SearchKind } from "@/lib/search/kinds";

export type SearchHitView = {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  statusLabel: string | null;
  href: string | null;
  at: string;
};

export type SearchGroupView = {
  kind: SearchKind;
  label: string;
  total: number;
  hits: SearchHitView[];
};

export type SearchTabView = { kind: SearchKind; label: string; total: number };

export type SearchResponse = {
  query: string;
  kind: SearchKind | null;
  terms: string[];
  total: number;
  tabs: SearchTabView[];
  groups: SearchGroupView[];
};

type HitSource = {
  kind: SearchKind;
  id: string;
  parentId: string | null;
  title: string;
  snippet: string;
  status: string | null;
  at: string;
};

export function isSearchResponse(value: unknown): value is SearchResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.query === "string" &&
    typeof candidate.total === "number" &&
    Array.isArray(candidate.terms) &&
    Array.isArray(candidate.tabs) &&
    Array.isArray(candidate.groups)
  );
}

export function toHitView(hit: HitSource): SearchHitView {
  const definition = SEARCH_KINDS[hit.kind];
  const statusLabel = hit.status && definition.statusMeta ? (definition.statusMeta[hit.status]?.label ?? hit.status) : null;
  return {
    kind: hit.kind,
    id: hit.id,
    title: hit.title || definition.label,
    snippet: hit.snippet,
    statusLabel,
    href: definition.href({ id: hit.id, parentId: hit.parentId, status: hit.status }),
    at: hit.at,
  };
}
