"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, History, Loader2, Search, X } from "lucide-react";
import { SEARCH_KIND_ICONS } from "@/components/shared/search-icons";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { parseSearchKind, SearchKind } from "@/lib/search/kinds";
import { HighlightedText, SearchResultSnippet } from "@/lib/search/snippet";
import { isSearchResponse, type SearchHitView, type SearchResponse } from "@/lib/search/view";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 180;
const RECENT_KEY = "commshub.recent-searches";
const RECENT_MAX = 6;
const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring";

type Status = "idle" | "loading" | "ready" | "error";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function anotherLayerIsOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null;
}

function readRecent(storageKey: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((value): value is string => typeof value === "string"))].slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(storageKey: string, values: string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    return;
  }
}

const subscribeNever = () => () => undefined;

function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

export function SearchTrigger({ onOpen, variant = "field" }: { onOpen: () => void; variant?: "field" | "icon" }) {
  const apple = useIsApplePlatform();
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label="Zoeken openen"
        className={cn("flex size-9 items-center justify-center rounded-md text-foreground outline-none hover:bg-secondary/70", FOCUS_RING)}
      >
        <Search className="size-4" strokeWidth={1.75} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md border border-foreground/40 bg-background px-2.5 text-left text-[0.8125rem] text-muted-foreground outline-none transition-colors duration-150 hover:bg-secondary/60",
        FOCUS_RING,
      )}
      aria-label="Zoeken openen"
      aria-keyshortcuts="Control+K Meta+K"
    >
      <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="flex-1">Zoeken</span>
      <kbd className="rounded-xs border bg-secondary px-1 text-xs leading-4">{apple ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

export function SearchDialog({
  open,
  onOpenChange,
  userId,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const listId = useId();
  const storageKey = `${RECENT_KEY}:${userId}`;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SearchKind | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const keyboardMoved = useRef(false);
  const navigated = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k" || isEditable(event.target)) return;
      if (anotherLayerIsOpen()) return;
      event.preventDefault();
      navigated.current = false;
      onOpenChange(true);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest("[data-search-dialog]")) lastFocused.current = event.target;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focusin", onFocusIn);
    };
  }, [onOpenChange]);

  const trimmed = query.trim();

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (kind) params.set("soort", kind);
        const result = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        const body: unknown = await result.json();
        if (!isSearchResponse(body)) throw new Error("Onverwacht antwoord van de zoekopdracht");
        setResponse(body);
        setActive(0);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[search] request failed", error);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed, kind]);

  const visible = trimmed.length >= 2 && status !== "idle" ? response : null;
  const fresh = visible !== null && visible.query === trimmed && visible.kind === kind;
  const hits = useMemo<SearchHitView[]>(() => (visible && fresh ? visible.groups.flatMap((group) => group.hits) : []), [visible, fresh]);

  useEffect(() => {
    if (!keyboardMoved.current) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const reset = useCallback(() => {
    setQuery("");
    setKind(null);
    setResponse(null);
    setStatus("idle");
    setActive(0);
  }, []);

  const close = useCallback(() => {
    onOpenChange(false);
    reset();
  }, [onOpenChange, reset]);

  const remember = (value: string) => {
    writeRecent(storageKey, [value, ...readRecent(storageKey).filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, RECENT_MAX));
  };

  const go = (href: string, remembered = trimmed) => {
    if (remembered) remember(remembered);
    navigated.current = true;
    close();
    onNavigate?.();
    router.push(href);
  };

  const fullResultsHref = `/search?${new URLSearchParams({ q: trimmed, ...(kind ? { soort: kind } : {}) }).toString()}`;

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && hits.length > 0) {
      event.preventDefault();
      keyboardMoved.current = true;
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === "ArrowUp" && hits.length > 0) {
      event.preventDefault();
      keyboardMoved.current = true;
      setActive((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter" && trimmed.length > 0) {
      event.preventDefault();
      const hit = hits[active];
      if (event.metaKey || event.ctrlKey || !hit?.href) go(fullResultsHref);
      else go(hit.href);
    }
  };

  const clearQuery = () => {
    reset();
    inputRef.current?.focus();
  };

  const pickRecent = (value: string) => {
    setQuery(value);
    inputRef.current?.focus();
  };

  const chooseKind = (next: SearchKind | null) => {
    setKind(next);
    inputRef.current?.focus();
  };

  const announcement =
    trimmed.length === 0
      ? ""
      : trimmed.length < 2
        ? "Typ minstens twee tekens om te zoeken."
        : status === "error"
        ? "Zoeken lukt nu niet. Probeer het zo opnieuw."
        : !fresh
          ? "Zoeken…"
          : visible && visible.total === 0
            ? `Niets gevonden voor ${trimmed}`
            : `${visible?.total ?? 0} ${visible?.total === 1 ? "resultaat" : "resultaten"}`;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <DialogContent
          showCloseButton={false}
          data-search-dialog=""
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!navigated.current && lastFocused.current?.isConnected) lastFocused.current.focus();
          }}
          className="top-[12%] flex max-h-[78dvh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">Zoeken</DialogTitle>
          <DialogDescription className="sr-only">
            Zoek in signalen, onderwerpen, stukken, interviews, edities, projecten, mensen, bronberichten en opmerkingen.
          </DialogDescription>
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
          </div>

          <div className="flex items-center gap-2.5 border-b px-4 focus-within:shadow-[inset_0_-2px_0_0_var(--ring)]">
            {status === "loading" ? (
              <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
            ) : (
              <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            )}
            <input
              ref={inputRef}
              autoFocus
              role="combobox"
              aria-label="Zoeken"
              aria-expanded={hits.length > 0}
              aria-controls={hits.length > 0 ? listId : undefined}
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
                onClick={clearQuery}
                className={cn("flex size-8 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground", FOCUS_RING)}
                aria-label="Zoekopdracht wissen"
              >
                <X className="size-4" />
              </button>
            )}
            <DialogClose
              className={cn("flex size-8 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground sm:hidden", FOCUS_RING)}
              aria-label="Sluiten"
            >
              <span aria-hidden className="text-xs font-medium">
                Sluiten
              </span>
            </DialogClose>
            <kbd className="hidden rounded-xs border bg-secondary px-1.5 text-xs leading-5 text-muted-foreground sm:block">esc</kbd>
          </div>

          {visible && visible.tabs.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-1 border-b px-3 py-2" role="group" aria-label="Soort resultaat">
              <KindChip label="Alles" count={visible.total} active={kind === null} onClick={() => chooseKind(null)} />
              {visible.tabs.map((tab) => (
                <KindChip key={tab.kind} label={tab.label} count={tab.total} active={kind === tab.kind} onClick={() => chooseKind(parseSearchKind(tab.kind))} />
              ))}
            </div>
          )}

          <div className="min-h-48 min-h-0 flex-1 overflow-y-auto">
            {trimmed.length === 0 ? (
              <RecentSearches storageKey={storageKey} onPick={pickRecent} onRemoved={() => inputRef.current?.focus()} />
            ) : trimmed.length < 2 ? (
              <Message>Typ minstens twee tekens om te zoeken.</Message>
            ) : status === "error" ? (
              <Message>Zoeken lukt nu niet. Probeer het zo opnieuw.</Message>
            ) : !visible ? (
              <Message>Zoeken…</Message>
            ) : visible.total === 0 ? (
              <Message>Niets gevonden voor “{trimmed}”. Probeer een korter woord. Je ziet alleen onderdelen waar je toegang toe hebt.</Message>
            ) : (
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={`Resultaten, ${visible.total}`}
                aria-busy={!fresh}
                aria-hidden={!fresh}
                className={cn("py-1 transition-opacity duration-150", !fresh && "pointer-events-none opacity-50")}
              >
                {(() => {
                  let index = -1;
                  return visible.groups.map((group) => (
                    <li key={group.kind} role="group" aria-labelledby={`${listId}-group-${group.kind}`}>
                      <p id={`${listId}-group-${group.kind}`} className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                        {group.label}
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
                              kindLabel={group.label}
                              terms={visible.terms}
                              active={fresh && position === active}
                              onHover={() => {
                                keyboardMoved.current = false;
                                setActive(position);
                              }}
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
            <span aria-hidden className="hidden items-center gap-3 sm:flex">
              <span>↑↓ kiezen</span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="size-3" /> openen
              </span>
              <span>Ctrl of ⌘ + ↵ alle resultaten</span>
            </span>
            {trimmed.length > 0 ? (
              <button
                type="button"
                onClick={() => go(fullResultsHref)}
                className={cn("ml-auto rounded-sm font-medium text-foreground outline-none hover:underline", FOCUS_RING)}
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

function KindChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label}, ${count} ${count === 1 ? "resultaat" : "resultaten"}`}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] outline-none transition-colors duration-150",
        FOCUS_RING,
        active ? "bg-secondary font-medium text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
      )}
    >
      {label}
      <span aria-hidden className="text-xs tabular-nums">
        {count}
      </span>
    </button>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">{children}</p>;
}

function RecentSearches({ storageKey, onPick, onRemoved }: { storageKey: string; onPick: (value: string) => void; onRemoved: () => void }) {
  const [recent, setRecent] = useState(() => readRecent(storageKey));
  if (recent.length === 0) {
    return <Message>Zoek in signalen, onderwerpen, stukken, interviews, edities, projecten, mensen, bronberichten en opmerkingen.</Message>;
  }
  const remove = (value: string) => {
    const next = recent.filter((item) => item !== value);
    writeRecent(storageKey, next);
    setRecent(next);
    onRemoved();
  };
  return (
    <div className="py-1">
      <p className="px-4 pt-3 pb-1 text-xs font-medium text-muted-foreground">Recent gezocht</p>
      <ul>
        {recent.map((value) => (
          <li key={value} className="group flex items-center">
            <button
              type="button"
              onClick={() => onPick(value)}
              className={cn("flex h-9 min-w-0 flex-1 items-center gap-2.5 px-4 text-left text-[0.8125rem] outline-none hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:ring-inset", FOCUS_RING)}
            >
              <History aria-hidden className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="truncate">{value}</span>
            </button>
            <button
              type="button"
              onClick={() => remove(value)}
              className={cn(
                "mr-2 flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100",
                FOCUS_RING,
              )}
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
  kindLabel,
  terms,
  active,
  onHover,
  onOpen,
}: {
  id: string;
  position: number;
  hit: SearchHitView;
  kindLabel: string;
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
      aria-label={[hit.title, hit.statusLabel, kindLabel].filter(Boolean).join(", ")}
      data-index={position}
      onMouseMove={onHover}
      onClick={onOpen}
      className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5", active && "bg-secondary shadow-[inset_3px_0_0_0_var(--primary)]")}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
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
