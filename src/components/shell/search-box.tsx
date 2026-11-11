"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function SearchBox({ onNavigate, shortcut = false }: { onNavigate?: () => void; shortcut?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcut]);

  return (
    <form action="/search" method="get" role="search" onSubmit={onNavigate} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
      <input
        ref={inputRef}
        type="search"
        name="q"
        placeholder="Zoeken"
        aria-label="Zoeken"
        autoComplete="off"
        className="h-8 w-full rounded-md border border-input bg-background pr-9 pl-8 text-[0.8125rem] outline-none transition-colors duration-150 placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {shortcut && (
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-xs border bg-secondary px-1 text-[0.625rem] leading-4 text-muted-foreground">
          /
        </kbd>
      )}
    </form>
  );
}
