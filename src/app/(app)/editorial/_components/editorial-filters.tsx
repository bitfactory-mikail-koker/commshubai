"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTENT_STATUS_META, CONTENT_STATUSES, CONTENT_TYPE_LABELS, CONTENT_TYPES } from "@/lib/constants";

const ALL = "all";

/**
 * Type / status selects and title search. The current filter values come from
 * the server (search params); changing one navigates to the new URL.
 */
export function EditorialFilters({
  params,
  type,
  status,
  query,
  showArchivedStatus,
}: {
  /** Current search params (without the ones managed here). */
  params: Record<string, string>;
  type: string;
  status: string;
  query: string;
  showArchivedStatus: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The page re-keys this component when the filters in the URL change, so
  // the input always starts from the current query.
  const [text, setText] = useState(query);

  const navigate = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    if (type) next.set("type", type);
    if (status) next.set("status", status);
    if (query) next.set("q", query);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `/editorial?${qs}` : "/editorial", { scroll: false }));
  };

  const hasFilters = Boolean(type || status || query);
  const statuses = CONTENT_STATUSES.filter((s) => showArchivedStatus || s !== "archived");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <form
        className="relative sm:w-64"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ q: text.trim() || null });
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Zoek op titel…"
          aria-label="Zoek op titel"
          className="pl-8"
        />
      </form>

      <Select value={type || ALL} onValueChange={(v) => navigate({ type: v === ALL ? null : v })}>
        <SelectTrigger className="sm:w-48" aria-label="Filter op contenttype">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle contenttypes</SelectItem>
          {CONTENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {CONTENT_TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status || ALL} onValueChange={(v) => navigate({ status: v === ALL ? null : v })}>
        <SelectTrigger className="sm:w-48" aria-label="Filter op status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle statussen</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s} value={s}>
              {CONTENT_STATUS_META[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setText("");
            navigate({ type: null, status: null, q: null });
          }}
        >
          <X />
          Filters wissen
        </Button>
      )}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Laden" />}
    </div>
  );
}
