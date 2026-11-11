import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Cpu, History, ShieldAlert, ShieldCheck } from "lucide-react";
import { ACTIVITY_SELECT, entityHref, type ActivityItem } from "@/components/shared/activity-feed";
import { AgentAvatar } from "@/components/shared/badges";
import { EmptyState, FilterTabs, PageHeader, Panel, UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requirePagePermission } from "@/lib/auth";
import { AUDIT_CATEGORY_META } from "@/lib/constants";
import { formatDate, formatTime, zonedInputToIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AuditCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Logboek" };

const PAGE_SIZE = 50;
const CATEGORIES = Object.keys(AUDIT_CATEGORY_META) as AuditCategory[];
const ACTORS = [
  { key: "user", label: "Mens" },
  { key: "agent", label: "Bot" },
  { key: "system", label: "Systeem" },
] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Records the shared activity feed has no page for, but the redactie does. */
function hrefFor(type: string | null, id: string | null): string | null {
  const known = entityHref(type, id);
  if (known) return known;
  switch (type) {
    case "opportunity":
      return "/topics";
    case "project":
      return "/projects";
    case "channel":
      return "/channels";
    case "profile":
      return "/team";
    default:
      return null;
  }
}

type LogItem = ActivityItem & { action: string };

/** Actions in which a person took a decision that the system records (as opposed to asking for one). */
const DECISION = /\.(approved|rejected|changes_requested|refused|released|final_check|external_naming|confirmed)$/;

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default async function LogbookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission(
    "content.create",
    "content.edit",
    "content.review",
    "content.approve",
    "users.manage",
    "agents.manage",
    "integrations.manage",
  );
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "");

  const category = CATEGORIES.includes(one("categorie") as AuditCategory) ? (one("categorie") as AuditCategory) : one("categorie") === "goedkeuring-nodig" ? "needs" : "all";
  const actor = ACTORS.some((a) => a.key === one("wie")) ? one("wie") : "all";
  const q = one("q").slice(0, 120);
  const from = DATE.test(one("van")) ? one("van") : "";
  const to = DATE.test(one("tot")) ? one("tot") : "";
  const page = Math.max(1, Number.parseInt(one("pagina") || "1", 10) || 1);
  const filtered = category !== "all" || actor !== "all" || q || from || to;

  const db = await createClient();
  let query = db
    .from("audit_logs")
    .select(`${ACTIVITY_SELECT}, action`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (category === "needs") query = query.eq("requires_approval", true);
  else if (category !== "all") query = query.eq("category", category);
  if (actor !== "all") query = query.eq("actor_type", actor);
  // % and _ are wildcards in a pattern; a search for them is a search for the character.
  if (q) query = query.ilike("summary", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (from) query = query.gte("created_at", zonedInputToIso(`${from}T00:00`));
  if (to) query = query.lt("created_at", zonedInputToIso(`${nextDay(to)}T00:00`));

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data ?? []) as unknown as LogItem[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Record<string, string | null>) => {
    const next: Record<string, string | null> = {
      categorie: category === "all" ? null : category === "needs" ? "goedkeuring-nodig" : category,
      wie: actor === "all" ? null : actor,
      q: q || null,
      van: from || null,
      tot: to || null,
      ...patch,
    };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) query.set(key, value);
    const qs = query.toString();
    return qs ? `/logbook?${qs}` : "/logbook";
  };

  // Group the rows by day so the time column only has to carry the time.
  const days: { day: string; rows: LogItem[] }[] = [];
  for (const item of items) {
    const day = formatDate(item.created_at, "EEEE d MMMM yyyy");
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(item);
    else days.push({ day, rows: [item] });
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Logboek"
        description="Alles wat mensen, de bot en het systeem hebben gedaan, met wie het deed en wanneer. Het logboek kan niet worden aangepast."
      />

      <div className="space-y-3">
        <FilterTabs
          active={category}
          items={[
            { key: "all", label: "Alles", href: href({ categorie: null, pagina: null }) },
            ...CATEGORIES.map((key) => ({ key, label: AUDIT_CATEGORY_META[key].label, href: href({ categorie: key, pagina: null }) })),
            { key: "needs", label: "Vroeg om een besluit", href: href({ categorie: "goedkeuring-nodig", pagina: null }) },
          ]}
        />

        <form method="get" action="/logbook" className="flex flex-wrap items-end gap-2">
          {category !== "all" && <input type="hidden" name="categorie" value={category === "needs" ? "goedkeuring-nodig" : category} />}
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Wie</span>
            <Select name="wie" defaultValue={actor}>
              <SelectTrigger className="w-32" aria-label="Wie">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Iedereen</SelectItem>
                {ACTORS.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="min-w-48 flex-1 space-y-1 sm:max-w-xs">
            <span className="block text-xs font-medium text-muted-foreground">Zoeken in de omschrijving</span>
            <Input name="q" type="search" defaultValue={q} placeholder="Bijvoorbeeld een titel of een naam" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Van</span>
            <Input name="van" type="date" defaultValue={from} className="w-38" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Tot en met</span>
            <Input name="tot" type="date" defaultValue={to} className="w-38" />
          </label>
          <Button type="submit" variant="outline">
            Filteren
          </Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/logbook">Wissen</Link>
            </Button>
          )}
        </form>
      </div>

      <Panel flush>
        {items.length === 0 ? (
          <EmptyState
            icon={History}
            title={filtered ? "Niets gevonden met deze filters" : "Het logboek is nog leeg"}
            description={
              filtered
                ? "Maak de periode ruimer of haal een filter weg."
                : "Zodra iemand iets doet of de bot aan het werk gaat, staat het hier."
            }
            action={
              filtered ? (
                <Link href="/logbook" className="text-sm font-medium underline underline-offset-4">
                  Alle regels tonen
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div>
            {days.map((group) => (
              <section key={group.day}>
                <h2 className="border-b bg-subtle px-4 py-1.5 text-xs font-medium text-muted-foreground first-letter:uppercase">{group.day}</h2>
                <ol className="divide-y border-b last:border-b-0">
                  {group.rows.map((item) => {
                    const link = hrefFor(item.entity_type, item.entity_id);
                    const categoryMeta = AUDIT_CATEGORY_META[item.category as AuditCategory];
                    const who = item.agent?.name ?? item.profile?.full_name ?? "Systeem";
                    const recorded = item.actor_type === "user" && DECISION.test(item.action);
                    const isDemo = Boolean((item.metadata as { demo?: boolean } | null)?.demo);
                    return (
                      <li key={item.id} className="grid gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[3.25rem_12.5rem_minmax(0,1fr)] lg:grid-cols-[3.25rem_12.5rem_minmax(0,1fr)_7.5rem]">
                        <time dateTime={item.created_at} className="hidden pt-0.5 text-xs text-muted-foreground tabular-nums sm:block">
                          {formatTime(item.created_at)}
                        </time>
                        <div className="flex min-w-0 items-center gap-2 self-start text-[0.8125rem]">
                          {item.agent ? (
                            <AgentAvatar kind={item.agent.kind} size="sm" />
                          ) : item.profile ? (
                            <UserAvatar name={item.profile.full_name} size="sm" />
                          ) : (
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
                              <Cpu className="size-3.5" strokeWidth={1.75} />
                            </span>
                          )}
                          <span className="truncate font-medium">{who}</span>
                          <time dateTime={item.created_at} className="ml-auto text-xs text-muted-foreground tabular-nums sm:hidden">
                            {formatTime(item.created_at)}
                          </time>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-[0.8125rem] leading-snug text-pretty">
                            {link ? (
                              <Link href={link} className="underline-offset-2 hover:underline">
                                {item.summary}
                              </Link>
                            ) : (
                              item.summary
                            )}
                          </p>
                          {(item.requires_approval || recorded || isDemo) && (
                            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              {item.requires_approval && (
                                <span className="inline-flex items-center gap-1 font-medium text-warning">
                                  <ShieldAlert className="size-3" />
                                  Vroeg om een besluit van een mens
                                </span>
                              )}
                              {recorded && (
                                <span className="inline-flex items-center gap-1 font-medium text-success">
                                  <ShieldCheck className="size-3" />
                                  Besluit van een mens vastgelegd
                                </span>
                              )}
                              {isDemo && (
                                <span className="text-muted-foreground" title="Gesimuleerde demogegevens">
                                  Demo
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <span className="hidden pt-0.5 text-right text-xs text-muted-foreground lg:block">{categoryMeta?.label ?? item.category}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Panel>

      {total > 0 && (
        <nav className="flex items-center justify-between text-[0.8125rem] text-muted-foreground" aria-label="Pagina's">
          <span className="tabular-nums">
            {(page - 1) * PAGE_SIZE + 1} tot {Math.min(page * PAGE_SIZE, total)} van {total} regels
          </span>
          <span className="flex items-center gap-1">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={href({ pagina: page > 2 ? String(page - 1) : null })}>
                  <ChevronLeft />
                  Vorige
                </Link>
              </Button>
            )}
            {page < pages && (
              <Button asChild variant="outline" size="sm">
                <Link href={href({ pagina: String(page + 1) })}>
                  Volgende
                  <ChevronRight />
                </Link>
              </Button>
            )}
          </span>
        </nav>
      )}
    </div>
  );
}
