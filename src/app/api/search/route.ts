import { getSession } from "@/lib/auth";
import { parseSearchKind, SEARCH_KINDS } from "@/lib/search/kinds";
import { SearchError, searchAll } from "@/lib/search/search";
import { toHitView, type SearchResponse } from "@/lib/search/view";

export const dynamic = "force-dynamic";

const EMPTY: SearchResponse = { query: "", kind: null, terms: [], total: 0, tabs: [], groups: [] };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const kind = parseSearchKind(params.get("soort"));

  try {
    const results = await searchAll(query, { kind });
    if (!results) return Response.json({ ...EMPTY, query, kind } satisfies SearchResponse);
    const body: SearchResponse = {
      query,
      kind,
      terms: results.terms,
      total: results.total,
      tabs: results.tabs.map((tab) => ({ kind: tab.kind, label: SEARCH_KINDS[tab.kind].plural, total: tab.total })),
      groups: results.groups.map((group) => ({
        kind: group.kind,
        label: SEARCH_KINDS[group.kind].plural,
        total: group.total,
        hits: group.hits.map(toHitView),
      })),
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SearchError) {
      console.error("[search]", error.message);
      return Response.json({ error: "Zoeken lukt nu niet." }, { status: 500 });
    }
    throw error;
  }
}
