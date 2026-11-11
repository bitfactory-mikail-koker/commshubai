import type { ContentStatus, ContentType } from "@/lib/types";

/** One newsletter item as the builder and the preview use it. */
export type BuilderItem = {
  id: string;
  section: string;
  included: boolean;
  position: number;
  customTitle: string | null;
  customSummary: string | null;
  article: { id: string; title: string; excerpt: string | null; status: ContentStatus; contentType: ContentType } | null;
  /** Resolved values: the custom text, falling back to the linked article. */
  title: string;
  summary: string;
};

export type EligibleArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  status: ContentStatus;
  contentType: ContentType;
};

export type SectionGroup = { section: string; items: BuilderItem[] };

/** Groups items by section; sections keep the order of their first item. */
export function groupBySection(items: BuilderItem[]): SectionGroup[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const groups: SectionGroup[] = [];
  for (const item of sorted) {
    const group = groups.find((g) => g.section === item.section);
    if (group) group.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}
