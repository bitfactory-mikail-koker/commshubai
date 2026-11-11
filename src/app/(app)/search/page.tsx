import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { SEARCH_KIND_ICONS } from "@/components/shared/search-icons";
import { MetaBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, PageHeader, Panel } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { parseSearchKind, SEARCH_KIND_ORDER, SEARCH_KINDS, SearchKind } from "@/lib/search/kinds";
import { HighlightedText, SearchResultSnippet } from "@/lib/search/snippet";
import { SEARCH_PAGE_SIZE, searchAll, type SearchGroup, type SearchHit } from "@/lib/search/search";

export const metadata: Metadata = { title: "Zoeken" };

type SearchParams = Promise<{ q?: string; soort?: string; pagina?: string }>;

function searchHref(query: string, kind: SearchKind | null, page = 1): string {
  const params = new URLSearchParams({ q: query });
  if (kind) params.set("soort", kind);
  if (page > 1) params.set("pagina", String(page));
  return `/search?${params.toString()}`;
}

function HitRow({ hit, terms }: { hit: SearchHit; terms: string[] }) {
  const definition = SEARCH_KINDS[hit.kind];
  const Icon = SEARCH_KIND_ICONS[hit.kind];
  const href = definition.href(hit);
  const body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] leading-snug font-medium">
          <span className="min-w-0 truncate">
            <HighlightedText text={hit.title || definition.label} terms={terms} />
          </span>
          {definition.statusMeta && hit.status && <MetaBadge meta={definition.statusMeta} value={hit.status} />}
        </p>
        <SearchResultSnippet snippet={hit.snippet} terms={terms} />
      </div>
      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block">{formatDate(hit.at)}</span>
    </div>
  );
  return href ? (
    <Link href={href} className="block outline-none transition-colors duration-150 hover:bg-secondary/60 focus-visible:bg-secondary">
      {body}
    </Link>
  ) : (
    body
  );
}

function GroupPanel({ group, query, terms, single }: { group: SearchGroup; query: string; terms: string[]; single: boolean }) {
  const definition = SEARCH_KINDS[group.kind];
  return (
    <Panel
      title={definition.plural}
      description={`${group.total} ${group.total === 1 ? "resultaat" : "resultaten"}`}
      flush
      actions={
        !single && group.total > group.hits.length ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={searchHref(query, group.kind)}>Alle {group.total} tonen</Link>
          </Button>
        ) : null
      }
    >
      <ul className="divide-y">
        {group.hits.map((hit) => (
          <li key={`${hit.kind}-${hit.id}`}>
            <HitRow hit={hit} terms={terms} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession();
  const { q, soort, pagina } = await searchParams;
  const query = (q ?? "").trim();
  const kind = parseSearchKind(soort);
  const page = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);
  const results = await searchAll(query, { kind, page });

  const tabs = results
    ? [
        { key: "all", label: "Alles", href: searchHref(query, null), count: results.total },
        ...SEARCH_KIND_ORDER.flatMap((groupKind) => {
          const group = results.groups.find((candidate) => candidate.kind === groupKind);
          return group
            ? [{ key: groupKind, label: SEARCH_KINDS[groupKind].plural, href: searchHref(query, groupKind), count: group.total }]
            : [];
        }),
      ]
    : [];

  const activeGroup = kind && results ? results.groups.find((group) => group.kind === kind) : null;
  const lastPage = activeGroup ? Math.ceil(activeGroup.total / SEARCH_PAGE_SIZE) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zoeken"
        description={
          results
            ? `${results.total} ${results.total === 1 ? "resultaat" : "resultaten"} voor "${query}". Je ziet alleen wat je mag zien.`
            : "Zoek in signalen, onderwerpen, stukken, interviews, edities, projecten, mensen, bronberichten en opmerkingen."
        }
      />

      <form action="/search" method="get" role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Zoek op woorden, namen of klanten"
          aria-label="Zoeken"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" className="h-9">
          <Search />
          Zoeken
        </Button>
      </form>

      {!results ? (
        <Panel flush>
          <EmptyState
            icon={Search}
            title={query ? "Geen zoekwoorden herkend" : "Wat zoek je?"}
            description={
              query
                ? "Gebruik letters of cijfers. Leestekens worden genegeerd."
                : "Typ een woord of een deel van een woord. Meerdere woorden moeten allemaal voorkomen."
            }
          />
        </Panel>
      ) : results.total === 0 ? (
        <Panel flush>
          <EmptyState
            icon={Search}
            title="Niets gevonden"
            description="Probeer een korter woord, of laat een woord weg. Je ziet alleen onderdelen waar je toegang toe hebt."
          />
        </Panel>
      ) : (
        <>
          <FilterTabs items={tabs} active={kind ?? "all"} />
          {kind && !activeGroup ? (
            <Panel flush>
              <EmptyState icon={Search} title="Geen resultaten in dit onderdeel" />
            </Panel>
          ) : (
            results.groups.map((group) => (
              <GroupPanel key={group.kind} group={group} query={query} terms={results.terms} single={kind !== null} />
            ))
          )}
          {kind && lastPage > 1 && (
            <nav className="flex items-center justify-between text-[0.8125rem]" aria-label="Paginering">
              <span className="text-muted-foreground">
                Pagina {page} van {lastPage}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={searchHref(query, kind, page - 1)}>Vorige</Link>
                  </Button>
                )}
                {page < lastPage && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={searchHref(query, kind, page + 1)}>Volgende</Link>
                  </Button>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
