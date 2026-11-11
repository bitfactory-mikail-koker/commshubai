"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PickablePerson = { id: string; name: string; jobTitle: string | null };

/** Checkbox list of colleagues with a search field and an optional maximum. */
export function PeoplePicker({
  id,
  people,
  value,
  onChange,
  max,
  className,
}: {
  id: string;
  people: PickablePerson[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? people.filter((p) => `${p.name} ${p.jobTitle ?? ""}`.toLowerCase().includes(q)) : people;
    // Chosen people stay on top so the selection is visible without searching.
    return [...matches].sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)));
  }, [people, query, value]);
  const full = max !== undefined && value.length >= max;

  const toggle = (personId: string, checked: boolean) => {
    if (checked) {
      if (!full && !value.includes(personId)) onChange([...value, personId]);
    } else onChange(value.filter((v) => v !== personId));
  };

  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      {people.length > 8 && (
        <div className="relative border-b">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een collega"
            aria-label="Zoek een collega"
            className="h-8 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
      )}
      <ul className="max-h-48 divide-y overflow-y-auto">
        {visible.length === 0 && <li className="px-3 py-2.5 text-[0.8125rem] text-muted-foreground">Niemand gevonden.</li>}
        {visible.map((person) => {
          const checked = value.includes(person.id);
          const disabled = !checked && full;
          const inputId = `${id}-${person.id}`;
          return (
            <li key={person.id}>
              <label
                htmlFor={inputId}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5 text-[0.8125rem] transition-colors duration-150",
                  disabled ? "cursor-not-allowed opacity-50" : "hover:bg-subtle",
                )}
              >
                <Checkbox id={inputId} checked={checked} disabled={disabled} onCheckedChange={(next) => toggle(person.id, next === true)} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{person.name}</span>
                  {person.jobTitle && <span className="text-muted-foreground">, {person.jobTitle}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
