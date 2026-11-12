import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import { ContentStatusBadge, MetaBadge, ToneBadge } from "@/components/shared/badges";
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { INTERVIEW_STATUS_META, SOCIAL_STATUS_META } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import { ENTITY_LABEL, ROUND_SELECT, entityTitles, type QueueItem } from "@/lib/redactie/queries";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Voor mij" };

type Group = { key: string; type: string; id: string; title: string; items: QueueItem[]; due: string | null; overdue: boolean; again: boolean };

function group(items: QueueItem[], titles: Record<string, string>): Group[] {
  const now = Date.now();
  const groups = new Map<string, Group>();
  for (const item of items) {
    const key = `${item.entity_type}:${item.entity_id}`;
    const existing = groups.get(key);
    const due = item.due_at;
    if (existing) {
      existing.items.push(item);
      if (due && (!existing.due || due < existing.due)) existing.due = due;
    } else {
      groups.set(key, {
        key,
        type: item.entity_type,
        id: item.entity_id,
        title: titles[item.entity_id] ?? "Onbekend stuk",
        items: [item],
        due,
        overdue: false,
        again: false,
      });
    }
  }
  for (const g of groups.values()) {
    g.overdue = Boolean(g.due && new Date(g.due).getTime() < now);
    g.again = g.items.some((item) => item.base_version !== null);
  }
  return [...groups.values()].sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
}

function asked(items: QueueItem[]): string {
  const quotes = items.filter((i) => i.kind === "quote").length;
  const passages = items.filter((i) => i.kind === "passage").length;
  const parts: string[] = [];
  if (quotes) parts.push(quotes === 1 ? "akkoord op je citaat" : `akkoord op ${quotes} citaten`);
  if (passages) parts.push(passages === 1 ? "akkoord op je passage" : `akkoord op ${passages} passages`);
  if (items.some((i) => i.kind === "piece")) parts.push("akkoord op het hele stuk");
  return parts.join(" en ");
}

function QueueList({ groups, emptyTitle, emptyText }: { groups: Group[]; emptyTitle: string; emptyText: string }) {
  if (groups.length === 0) return <EmptyState icon={CircleCheck} title={emptyTitle} description={emptyText} />;
  return (
    <ul className="divide-y">
      {groups.map((g) => (
        <li key={g.key}>
          <Link
            href={`/preview/${g.type}/${g.id}`}
            className="group grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{g.title}</p>
              <p className="text-[0.8125rem] text-muted-foreground">
                {ENTITY_LABEL[g.type]}: {asked(g.items)}
                {g.again && ". Aangepast sinds je het zag: je ziet alleen de wijzigingen"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {g.overdue ? <ToneBadge tone="red">Termijn verstreken</ToneBadge> : g.due && <span className="tabular-nums">Uiterlijk {formatDay(g.due)}</span>}
              <ChevronRight className="hidden size-4 text-muted-foreground/60 sm:block" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ForMePage() {
  const session = await requireSession();
  const db = await createClient();
  const canApprove = can(session, "content.approve");
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");
  const now = new Date().toISOString();

  const [mineRes, editorsRes, overdueRes, interviewsRes, postsRes, involvedRes, readyRes] = await Promise.all([
    db.from("approvals").select(ROUND_SELECT).eq("decision", "pending").contains("eligible_profile_ids", [session.userId]),
    canApprove
      ? db.from("approvals").select(ROUND_SELECT).eq("decision", "pending").filter("eligible_profile_ids", "eq", "{}")
      : Promise.resolve({ data: [] }),
    canApprove
      ? db
          .from("approvals")
          .select(ROUND_SELECT)
          .eq("decision", "pending")
          .eq("kind", "piece")
          .lte("due_at", now)
          .not("eligible_profile_ids", "cs", `{${session.userId}}`)
          .filter("eligible_profile_ids", "neq", "{}")
      : Promise.resolve({ data: [] }),
    db
      .from("interviews")
      .select("id, title, status, requested_at, scheduled_at")
      .eq("interviewee_profile_id", session.userId)
      .in("status", ["requested", "scheduled", "in_progress", "awaiting_confirmation"])
      .order("requested_at", { ascending: false }),
    db
      .from("social_posts")
      .select("id, platform, status, body, article:articles(title)")
      .eq("written_for_profile_id", session.userId)
      .in("status", ["in_review", "approved", "scheduled"])
      .order("created_at", { ascending: false }),
    db
      .from("approvals")
      .select("entity_id")
      .eq("entity_type", "article")
      .contains("eligible_profile_ids", [session.userId])
      .neq("decision", "pending")
      .order("requested_at", { ascending: false })
      .limit(60),
    editorial
      ? db.from("articles").select("id, title, status, updated_at").eq("status", "approved").order("updated_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  const mine = (mineRes.data ?? []) as QueueItem[];
  const editorQueue = [...((editorsRes.data ?? []) as QueueItem[]), ...((overdueRes.data ?? []) as QueueItem[])];
  const [titles, { data: interviewedFor }] = await Promise.all([
    entityTitles(db, [...mine, ...editorQueue]),
    db.from("interviews").select("article_id").eq("interviewee_profile_id", session.userId).not("article_id", "is", null),
  ]);
  const mineGroups = group(mine, titles);
  const editorGroups = group(editorQueue, titles).filter((g) => !mineGroups.some((m) => m.key === g.key));

  const interviews = interviewsRes.data ?? [];
  const posts = (postsRes.data ?? []) as { id: string; platform: string; status: string; body: string; article: { title: string } | null }[];

  // Pieces this person was involved in: decided on, or interviewed for.
  const involvedIds = Array.from(new Set((involvedRes.data ?? []).map((r) => r.entity_id)));
  for (const row of interviewedFor ?? []) if (row.article_id && !involvedIds.includes(row.article_id)) involvedIds.push(row.article_id);
  const openIds = new Set(mineGroups.filter((g) => g.type === "article").map((g) => g.id));
  const { data: involved } = involvedIds.length
    ? await db
        .from("articles")
        .select("id, title, status, updated_at")
        .in("id", involvedIds.filter((id) => !openIds.has(id)).slice(0, 30))
        .order("updated_at", { ascending: false })
    : { data: [] };
  const ready = readyRes.data ?? [];

  const INTERVIEW_ASK: Record<string, string> = {
    requested: "De redactie wil je een paar vragen stellen. Kies: nu, later, of ik ben niet de juiste persoon.",
    scheduled: "Ingepland. Je kunt de vragen ook nu al beantwoorden.",
    in_progress: "Je bent begonnen. Ga verder waar je was.",
    awaiting_confirmation: "Klopt de samenvatting van je antwoorden?",
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="Voor mij"
        description="Wat op jou wacht en de stukken waarbij je betrokken bent. Er gaat niets naar buiten zonder akkoord van de mensen die erin voorkomen."
        actions={
          <Link href="/for-me/data" className="text-sm font-medium underline underline-offset-4 hover:text-foreground">
            Wat is er over mij bewaard?
          </Link>
        }
      />

      <Panel title="Wacht op jouw akkoord" flush>
        <QueueList
          groups={mineGroups}
          emptyTitle="Niets dat op jouw akkoord wacht"
          emptyText="Zodra een stuk waarin jij voorkomt klaar is, vind je het hier."
        />
      </Panel>

      {canApprove && (
        <Panel
          title="Wacht op de redactie"
          description="Stappen die bij de redactie liggen, en verzoeken waarvan de termijn is verstreken. Een citaat kan alleen de geciteerde zelf goedkeuren."
          flush
        >
          <QueueList groups={editorGroups} emptyTitle="Niets dat op de redactie wacht" emptyText="Er liggen geen goedkeuringen bij de redactie." />
        </Panel>
      )}

      {interviews.length > 0 && (
        <Panel title="Interviews" flush>
          <ul className="divide-y">
            {interviews.map((interview) => (
              <li key={interview.id}>
                <Link
                  href={`/interviews/${interview.id}`}
                  className="grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{interview.title}</p>
                    <p className="text-[0.8125rem] text-muted-foreground">{INTERVIEW_ASK[interview.status]}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                    <ChevronRight className="hidden size-4 text-muted-foreground/60 sm:block" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {posts.length > 0 && (
        <Panel title="Posts op jouw naam" description="Geschreven in jouw naam. Jij keurt goed en jij plaatst ze zelf." flush>
          <ul className="divide-y">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/preview/social_post/${post.id}`}
                  className="grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {post.platform === "linkedin" ? "LinkedIn-post" : post.platform}
                      {post.article ? ` bij “${post.article.title}”` : ""}
                    </p>
                    <p className="line-clamp-1 text-[0.8125rem] text-muted-foreground">{post.body}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <MetaBadge meta={SOCIAL_STATUS_META} value={post.status} />
                    <ChevronRight className="hidden size-4 text-muted-foreground/60 sm:block" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {editorial && ready.length > 0 && (
        <Panel title="Klaar voor publicatie" description="Goedgekeurd. Kopieer of download de tekst, publiceer hem en vink hem af." flush>
          <ul className="divide-y">
            {ready.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/preview/article/${article.id}`}
                  className="grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <p className="truncate text-sm font-medium">{article.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">Goedgekeurd {formatDay(article.updated_at)}</span>
                    <ChevronRight className="hidden size-4 text-muted-foreground/60 sm:block" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Stukken waarbij je betrokken bent" flush>
        {(involved ?? []).length === 0 ? (
          <EmptyState
            title="Nog geen stukken"
            description="Stukken waarvoor je bent geïnterviewd of waarop je akkoord gaf, blijven hier terug te vinden."
          />
        ) : (
          <ul className="divide-y">
            {(involved ?? []).map((article) => (
              <li key={article.id}>
                <Link
                  href={`/preview/article/${article.id}`}
                  className="grid items-center gap-x-6 gap-y-1 px-4 py-2.5 outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <p className="truncate text-sm font-medium">{article.title}</p>
                  <div className="flex items-center gap-3">
                    <ContentStatusBadge status={article.status as ContentStatus} />
                    <ChevronRight className="hidden size-4 text-muted-foreground/60 sm:block" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
