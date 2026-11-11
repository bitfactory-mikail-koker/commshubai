"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

/** Project and person filters for the board. They live in the URL, like the bureau tabs next to them. */
export function BoardFilters({
  projects,
  people,
  project,
  person,
}: {
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
  project: string | null;
  person: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const set = (key: string, value: string) => {
    const query = new URLSearchParams(searchParams.toString());
    if (value === ALL) query.delete(key);
    else query.set(key, value);
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={project ?? ALL} onValueChange={(value) => set("project", value)}>
        <SelectTrigger size="sm" className="max-w-56" aria-label="Filter op project">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle projecten</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={person ?? ALL} onValueChange={(value) => set("persoon", value)}>
        <SelectTrigger size="sm" className="max-w-56" aria-label="Filter op persoon">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle personen</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
