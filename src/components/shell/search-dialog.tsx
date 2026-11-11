"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, History, Loader2, Search, X } from "lucide-react";
import { SEARCH_KIND_ICONS } from "@/components/shared/search-icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { parseSearchKind, SearchKind } from "@/lib/search/kinds";
import { HighlightedText, SearchResultSnippet } from "@/lib/search/snippet";
import type { SearchHitView, SearchResponse } from "@/lib/search/view";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 180;
const RECENT_KEY = "commshub.recent-searches";
const RECENT_MAX = 6;

type Status = "idle" | "loading" | "ready" | "error";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(values: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(values));
  } catch {
    return;
  }
}

export function SearchDialog({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listRef = useRef<HTMLUListElement>(null);

  const openDialog = useCallback(() => {
    setRecent(readRecent());
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      openDialog();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDialog]);

  const trimmed = query.trim();

  useEffect(() => {
    if (!open || trimmed.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (kind) params.set("soort", kind);
        const result = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        setResponse((await result.json()) as SearchResponse);
        setActive(0);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed, kind]);

  const visible = trimmed.length > 0 && status !== "idle" ? response : null;
  const fresh = visible !== null && visible.query === trimmed && visible.kind === kind;
  const hits = useMemo<SearchHitView[]>(() => (visible && fresh ? visible.groups.flatMap((group) => group.hits) : []), [visible, fresh]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setKind(null);
    setResponse(null);
    setStatus("idle");
    setActive(0);
  }, []);

  const remember = (value: string) => {
    const next = [value, ...readRecent().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_MAX);
    writeRecent(next);
  };

  const go = (href: string, remembered = trimmed) => {
    if (remembered) remember(remembered);
    close();
    onNavigate?.();
    router.push(href);
  };

  const fullResultsHref = `/search?${new URLSearchParams({ q: trimmed, ...(kind ? { soort: kind } : {}) }).toString()}`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && hits.length > 0) {
      event.preventDefault();
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === "ArrowUp" && hits.length > 0) {
      event.preventDefault();
      setActive((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter" && trimmed.length > 0) {
      event.preventDefault();
      const hit = hits[active];
      if (event.metaKey || event.ctrlKey || !hit?.href) go(fullResultsHref);
      else go(hit.href);
    }
  };

  const removeRecent = (value: string) => {
    const next = readRecent().filter((item) => item !== value);
    writeRecent(next);
    setRecent(next);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-left text-[0.8125rem] text-muted-foreground outline-none transition-colors duration-150 hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Zoeken openen"
        aria-keyshortcuts="Control+K Meta+K /"
      >
        <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="flex-1">Zoeken</span>
        <kbd className="rounded-xs border bg-secondary px-1 text-[0.625rem] leading-4">/</kbd>
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? openDialog() : close())}>
        <DialogContent showCloseButton={false} className="top-[12%] flex max-h-[78dvh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Zoeken</DialogTitle>
          <DialogDescription className="sr-only">
            Zoek in signalen, onderwerpen, stukken, interviews, edities, projecten, mensen, bronberichten en opmerkingen.
          </DialogDescription>

          <div className="flex items-center gap-2.5 border-b px-4">
            {status === "loading" ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            )}
            <input
              autoFocus
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-activedescendant={hits.length > 0 ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setKind(null);
                if (event.target.value.trim().length === 0) {
                  setStatus("idle");
                  setResponse(null);
                }
              }}
              onKeyDown={onKeyDown}
              placeholder="Zoek op woorden, namen of klanten"
              autoComplete="off"
              spellCheck={false}
              className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setKind(null);
                  setStatus("idle");
                  setResponse(null);
                }}
                className="rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="Zoekopdracht wissen"
              >
                <X className="size-4" />
              </button>
            )}
            <kbd className="hidden rounded-xs border bg-secondary px-1.5 text-[0.6875rem] leading-5 text-muted-foreground sm:block">esc</kbd>
          </div>

          {visible && visible.groups.length > 0 && (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2" role="tablist" aria-label="Soort resultaat">
              <KindChip label="Alles" count={kind ? undefined : visible.total} active={kind === null} onClick={() => setKind(null)} />
              {visible.groups.map((group) => (
                <KindChip
                  key={group.kind}
                  label={group.label}
                  count={group.total}
                  active={kind === group.kind}
                  onClick={() => setKind(parseSearchKind(group.kind))}
                />
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {trimmed.length === 0 ? (
              <RecentSearches recent={recent} onPick={setQuery} onRemove={removeRecent} />
            ) : status === "error" ? (
              <Message>Zoeken lukt nu niet. Probeer het zo opnieuw.</Message>
            ) : !visible ? (
              <Message>Zoeken…</Message>
            ) : visible.total === 0 ? (
              <Message>
                Niets gevonden voor “{trimmed}”. Probeer een korter woord. Je ziet alleen onderdelen waar je toegang toe hebt.
              </Message>
            ) : (
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label="Resultaten"
                aria-busy={!fresh}
                className={cn("py-1 transition-opacity duration-150", !fresh && "pointer-events-none opacity-50")}
              >
                {(() => {
                  let index = -1;
                  return visible.groups.map((group) => (
                    <li key={group.kind} role="presentation">
                      <p className="flex items-center justify-between px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                        <span>{group.label}</span>
                        {group.total > group.hits.length && (
                          <button
                            type="button"
                            onClick={() => setKind(parseSearchKind(group.kind))}
                            className="rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            Alle {group.total} tonen
                          </button>
                        )}
                      </p>
                      <ul role="presentation">
                        {group.hits.map((hit) => {
                          index += 1;
                          const position = index;
                          return (
                            <HitRow
                              key={`${hit.kind}-${hit.id}`}
                              id={`${listId}-${position}`}
                              position={position}
                              hit={hit}
                              terms={visible.terms}
                              active={fresh && position === active}
                              onHover={() => setActive(position)}
                              onOpen={() => (hit.href ? go(hit.href) : go(fullResultsHref))}
                            />
                          );
                        })}
                      </ul>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-subtle px-4 py-2 text-xs text-muted-foreground">
            <span className="hidden items-center gap-3 sm:flex">
              <span>↑↓ kiezen</span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="size-3" /> openen
              </span>
              <span>⌘↵ alle resultaten</span>
            </span>
            {trimmed.length > 0 ? (
              <button
                type="button"
                onClick={() => go(fullResultsHref)}
                className="ml-auto rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Alle resultaten bekijken
              </button>
            ) : (
              <span className="ml-auto">Begin met typen om te zoeken</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KindChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-secondary font-medium text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && <span className="text-xs tabular-nums">{count}</span>}
    </button>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">{children}</p>;
}

function RecentSearches({ recent, onPick, onRemove }: { recent: string[]; onPick: (value: string) => void; onRemove: (value: string) => void }) {
  if (recent.length === 0) {
    return <Message>Zoek in signalen, onderwerpen, stukken, interviews, edities, projecten, mensen, bronberichten en opmerkingen.</Message>;
  }
  return (
    <div className="py-1">
      <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">Recent gezocht</p>
      <ul>
        {recent.map((value) => (
          <li key={value} className="group flex items-center">
            <button
              type="button"
              onClick={() => onPick(value)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2.5 px-4 text-left text-[0.8125rem] outline-none hover:bg-secondary/60 focus-visible:bg-secondary"
            >
              <History className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="truncate">{value}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(value)}
              className="mr-3 rounded-sm p-1 text-muted-foreground opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`“${value}” verwijderen uit recente zoekopdrachten`}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HitRow({
  id,
  position,
  hit,
  terms,
  active,
  onHover,
  onOpen,
}: {
  id: string;
  position: number;
  hit: SearchHitView;
  terms: string[];
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const Icon = SEARCH_KIND_ICONS[hit.kind];
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      data-index={position}
      onMouseMove={onHover}
      onClick={onOpen}
      className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5", active && "bg-secondary")}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] leading-snug font-medium">
          <span className="min-w-0 truncate">
            <HighlightedText text={hit.title} terms={terms} />
          </span>
          {hit.statusLabel && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-secondary px-1.5 text-xs leading-none font-medium text-muted-foreground">
              {hit.statusLabel}
            </span>
          )}
        </p>
        <SearchResultSnippet snippet={hit.snippet} terms={terms} />
      </div>
      <span className="hidden shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums sm:block">{formatDate(hit.at)}</span>
    </li>
  );
}
