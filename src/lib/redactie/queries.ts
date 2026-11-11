import "server-only";
import type { RoundItem } from "@/components/redactie/approval-round";
import type { SessionContext } from "@/lib/auth";
import type { UserClient } from "@/lib/supabase/server";
import type { ApprovalEntity } from "@/lib/types";

/** Reads for the approver's screens. Everything goes through the user's own session (RLS). */

export const ROUND_SELECT =
  "id, kind, step, step_label, decision, decision_note, eligible_profile_ids, decided_by, decided_at, due_at, quote_text, item_id, base_version, requested_at, version, entity_type, entity_id, requested_by_profile_id";

export type QueueItem = RoundItem & {
  item_id: string | null;
  base_version: number | null;
  version: number;
  entity_type: string;
  entity_id: string;
  requested_by_profile_id: string | null;
};

export async function profileNames(db: UserClient, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return {};
  const { data } = await db.from("profiles").select("id, full_name").in("id", unique);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]));
}

/** The approval records of one version, as far as the viewer may see them. */
export async function loadRound(db: UserClient, entityType: ApprovalEntity, entityId: string, version: number) {
  const { data, error } = await db
    .from("approvals")
    .select(ROUND_SELECT)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("version", version)
    .order("step", { ascending: true })
    .order("requested_at", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as QueueItem[];
  const names = await profileNames(db, items.flatMap((item) => [...item.eligible_profile_ids, item.decided_by]));
  return { items, names };
}

/** Which open requests this person may decide right now. */
export function decidableBy(items: QueueItem[], session: SessionContext): QueueItem[] {
  const now = Date.now();
  const canApprove = session.permissions.has("content.approve");
  return items.filter((item) => {
    if (item.decision !== "pending") return false;
    if (item.eligible_profile_ids.includes(session.userId)) return true;
    if (!canApprove) return false;
    // The editors' own step, consent they record for someone without an account,
    // or a piece whose deadline has passed. Never someone else's quote.
    if (item.eligible_profile_ids.length === 0) return true;
    return item.kind === "piece" && item.due_at !== null && new Date(item.due_at).getTime() <= now;
  });
}

export const ENTITY_LABEL: Record<string, string> = { article: "Stuk", newsletter: "Editie", social_post: "Social post" };

/** Titles of the items a list of approvals refers to. */
export async function entityTitles(db: UserClient, refs: { entity_type: string; entity_id: string }[]): Promise<Record<string, string>> {
  const ids = (type: string) => Array.from(new Set(refs.filter((r) => r.entity_type === type).map((r) => r.entity_id)));
  const titles: Record<string, string> = {};
  const [articles, newsletters, posts] = await Promise.all([
    ids("article").length ? db.from("articles").select("id, title").in("id", ids("article")) : Promise.resolve({ data: [] }),
    ids("newsletter").length ? db.from("newsletters").select("id, title").in("id", ids("newsletter")) : Promise.resolve({ data: [] }),
    ids("social_post").length
      ? db.from("social_posts").select("id, platform, variant, article:articles(title)").in("id", ids("social_post"))
      : Promise.resolve({ data: [] }),
  ]);
  for (const row of articles.data ?? []) titles[row.id] = row.title;
  for (const row of newsletters.data ?? []) titles[row.id] = row.title;
  for (const row of (posts.data ?? []) as { id: string; platform: string; variant: string | null; article: { title: string } | null }[]) {
    titles[row.id] = `${row.platform === "linkedin" ? "LinkedIn-post" : `Post voor ${row.platform}`}${row.variant ? ` (${row.variant.toLowerCase()})` : ""}${row.article ? ` bij “${row.article.title}”` : ""}`;
  }
  return titles;
}
