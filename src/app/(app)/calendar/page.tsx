import type { Metadata } from "next";
import Link from "next/link";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarDays, Check, ChevronLeft, ChevronRight, FileText, Flag, LayoutGrid, List, Mail, Mic, RotateCcw, Share2, Trash2, type LucideIcon } from "lucide-react";
import { deleteCalendarEntry, setCalendarEntryDone } from "@/actions/settings";
import { ActionButton } from "@/components/shared/actions";
import { ClassificationBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, FilterTabs, PageHeader, Panel } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { CALENDAR_TYPE_META } from "@/lib/constants";
import { toZoned } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddDeadlineDialog } from "./_components/add-deadline-dialog";

type CalendarRow = Omit<CalendarEntry, "created_by" | "created_at" | "updated_at" | "organization_id">;

export const metadata: Metadata = { title: "Contentkalender" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

const ENTRY_TYPES = ["article", "interview", "newsletter", "social_post", "deadline"] as const;
const TYPE_FILTER_LABELS: Record<(typeof ENTRY_TYPES)[number], string> = {
  article: "Artikelen",
  interview: "Interviews",
  newsletter: "Nieuwsbrieven",
  social_post: "Social posts",
  deadline: "Deadlines",
};
const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const MAX_CHIPS = 3;

/* Entry types are told apart by icon, not colour: colour is reserved for state. */
const TYPE_ICONS: Record<string, LucideIcon> = {
  article: FileText,
  interview: Mic,
  newsletter: Mail,
  social_post: Share2,
  deadline: Flag,
};

type Entry = CalendarRow & { dayKey: string; time: string; href: string | null };

function entryHref(entry: CalendarRow): string | null {
  if (!entry.entity_id) return null;
  switch (entry.entity_type) {
    case "article":
      return `/editorial/${entry.entity_id}`;
    case "interview":
      return `/interviews/${entry.entity_id}`;
    case "newsletter":
      return `/newsletters/${entry.entity_id}`;
    case "social_post":
      return "/external";
    default:
      return null;
  }
}

const dayKey = (date: Date) => format(date, "yyyy-MM-dd");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const db = await createClient();

  // All calendar math uses wall-clock dates in the app timezone (see lib/format).
  const today = toZoned(new Date());
  const monthParam = first(sp.maand).match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const monthStart = monthParam ? new Date(Number(monthParam[1]), Number(monthParam[2]) - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const view = first(sp.view) === "list" ? "list" : "month";
  const type = (ENTRY_TYPES as readonly string[]).includes(first(sp.type)) ? first(sp.type) : "";
  const classification = ["external", "internal"].includes(first(sp.classificatie)) ? first(sp.classificatie) : "";

  // Query a slightly wider UTC window and assign entries to days in the app timezone.
  const from = new Date(Date.UTC(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() - 1));
  const to = new Date(Date.UTC(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate() + 2));
  const { data, error } = await db
    .from("content_calendar")
    .select("classification, entity_id, entity_type, entry_type, id, notes, starts_at, status, title")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);

  const all: Entry[] = (data ?? []).map((entry) => {
    const zoned = toZoned(new Date(entry.starts_at));
    return { ...entry, dayKey: dayKey(zoned), time: format(zoned, "HH:mm"), href: entryHref(entry) };
  });
  const entries = all.filter(
    (e) => (!type || e.entry_type === type) && (!classification || e.classification === classification) && e.status !== "cancelled",
  );
  const byDay = new Map<string, Entry[]>();
  for (const entry of entries) byDay.set(entry.dayKey, [...(byDay.get(entry.dayKey) ?? []), entry]);

  const monthKey = format(monthStart, "yyyy-MM");
  const inMonth = (e: Entry) => e.dayKey.startsWith(monthKey);
  const monthEntries = entries.filter(inMonth);
  const monthAll = all.filter((e) => inMonth(e) && e.status !== "cancelled");
  const monthDays = days.filter((d) => dayKey(d).startsWith(monthKey) && byDay.has(dayKey(d)));
  const todayKey = dayKey(today);
  const canManage = can(session, "content.create", "content.publish");

  const current: Record<string, string> = {};
  if (monthParam) current.maand = monthKey;
  if (view === "list") current.view = "list";
  if (type) current.type = type;
  if (classification) current.classificatie = classification;
  const href = (changes: Record<string, string | null>, hash = "") => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    return `${qs ? `/calendar?${qs}` : "/calendar"}${hash}`;
  };
  const isCurrentMonth = monthKey === format(today, "yyyy-MM");

  const list = (
    <Panel flush>
      {monthDays.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={type || classification ? "Geen kalenderitems voor deze filters" : "Nog niets gepland deze maand"}
          description="Ingeplande artikelen, interviews, nieuwsbrieven en social posts verschijnen hier automatisch. Deadlines voeg je zelf toe."
          action={canManage ? <AddDeadlineDialog /> : undefined}
        />
      ) : (
        <ol className="divide-y">
          {monthDays.map((day) => {
            const key = dayKey(day);
            return (
              <li key={key} id={`dag-${key}`} className="grid scroll-mt-20 gap-3 px-5 py-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                <div className="flex items-baseline gap-2 sm:block">
                  <p className={cn("text-2xl leading-none font-semibold tabular-nums tracking-tight", key === todayKey && "text-primary")}>
                    {format(day, "d")}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize sm:mt-1">
                    {format(day, "EEEE", { locale: nl })}
                    {key === todayKey && ", vandaag"}
                  </p>
                </div>
                <ul className="divide-y">
                  {(byDay.get(key) ?? []).map((entry) => {
                    const done = entry.status === "done";
                    const manual = !entry.entity_id;
                    return (
                      <li key={entry.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground tabular-nums">{entry.time}</span>
                            <MetaBadge meta={CALENDAR_TYPE_META} value={entry.entry_type} />
                            {entry.classification && <ClassificationBadge classification={entry.classification} />}
                            {done && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                                <Check className="size-3" />
                                Afgerond
                              </span>
                            )}
                          </div>
                          {entry.href ? (
                            <Link
                              href={entry.href}
                              className={cn(
                                "block rounded-sm text-sm font-medium outline-none hover:underline hover:underline-offset-2 focus-visible:ring-3 focus-visible:ring-ring/50",
                                done && "text-muted-foreground",
                              )}
                            >
                              {entry.title}
                            </Link>
                          ) : (
                            <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{entry.title}</p>
                          )}
                          {entry.notes && <p className="text-xs leading-relaxed text-muted-foreground">{entry.notes}</p>}
                        </div>
                        {manual && canManage && (
                          <div className="flex shrink-0 items-center gap-1">
                            <ActionButton
                              variant="outline"
                              size="sm"
                              action={setCalendarEntryDone.bind(null, { id: entry.id, done: !done })}
                            >
                              {done ? <RotateCcw /> : <Check />}
                              {done ? "Heropenen" : "Afvinken"}
                            </ActionButton>
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Deadline “${entry.title}” verwijderen`}
                              action={deleteCalendarEntry.bind(null, { id: entry.id })}
                              confirm={{
                                title: "Deadline verwijderen?",
                                description: `“${entry.title}” wordt van de kalender verwijderd.`,
                                confirmLabel: "Verwijderen",
                                destructive: true,
                              }}
                            >
                              <Trash2 />
                            </ActionButton>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );

  return (
    <div className="space-y-7">
      <PageHeader
        title="Contentkalender"
        description="Geplande publicaties, interviews, nieuwsbrieven, social posts en deadlines in één overzicht. Tijden in Nederlandse tijd."
        actions={canManage ? <AddDeadlineDialog /> : undefined}
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border bg-card">
              <Link
                href={href({ maand: format(addMonths(monthStart, -1), "yyyy-MM") })}
                aria-label="Vorige maand"
                className="flex size-8 items-center justify-center rounded-l-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <h2 className="min-w-36 px-2 text-center text-lg font-semibold capitalize" aria-live="polite">
                {format(monthStart, "MMMM yyyy", { locale: nl })}
              </h2>
              <Link
                href={href({ maand: format(addMonths(monthStart, 1), "yyyy-MM") })}
                aria-label="Volgende maand"
                className="flex size-8 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
            {!isCurrentMonth && (
              <Link
                href={href({ maand: null })}
                className="inline-flex h-8 items-center rounded-md border bg-card px-3 text-[0.8125rem] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Vandaag
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-card p-0.5" role="group" aria-label="Soort communicatie">
              {[
                { key: "", label: "Alle" },
                { key: "external", label: "Extern" },
                { key: "internal", label: "Intern" },
              ].map((option) => (
                <Link
                  key={option.key || "all"}
                  href={href({ classificatie: option.key || null })}
                  scroll={false}
                  aria-current={classification === option.key ? "page" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    classification === option.key ? "bg-secondary text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <div className="hidden rounded-lg border bg-card p-0.5 md:inline-flex" role="group" aria-label="Weergave">
              {[
                { key: "month", label: "Maand", icon: LayoutGrid },
                { key: "list", label: "Lijst", icon: List },
              ].map((option) => (
                <Link
                  key={option.key}
                  href={href({ view: option.key === "list" ? "list" : null })}
                  scroll={false}
                  aria-current={view === option.key ? "page" : undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    view === option.key ? "bg-secondary text-foreground ring-1 ring-border ring-inset" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <option.icon className="size-3.5" strokeWidth={1.75} />
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <FilterTabs
          active={type || "all"}
          items={[
            { key: "all", label: "Alles", href: href({ type: null }), count: monthAll.length },
            ...ENTRY_TYPES.map((t) => ({
              key: t,
              label: TYPE_FILTER_LABELS[t],
              href: href({ type: t }),
              count: monthAll.filter((e) => e.entry_type === t).length,
            })),
          ]}
        />
      </div>

      {view === "month" ? (
        <>
          {/* Month grid (medium screens and up) */}
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAYS.map((name) => (
                <div key={name} className="px-3 py-2 text-xs font-semibold text-muted-foreground ">
                  {name}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const key = dayKey(day);
                const dayEntries = byDay.get(key) ?? [];
                const outside = !key.startsWith(monthKey);
                const isToday = key === todayKey;
                const overflow = dayEntries.length - MAX_CHIPS;
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-30 space-y-1.5 border-b p-2",
                      index % 7 !== 6 && "border-r",
                      index >= days.length - 7 && "border-b-0",
                      outside && "bg-muted/30",
                    )}
                  >
                    <p className="flex justify-end">
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                          isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
                        )}
                        aria-label={`${format(day, "EEEE d MMMM", { locale: nl })}${isToday ? " (vandaag)" : ""}`}
                      >
                        {format(day, "d")}
                      </span>
                    </p>
                    <ul className="space-y-1">
                      {dayEntries.slice(0, MAX_CHIPS).map((entry) => {
                        const meta = CALENDAR_TYPE_META[entry.entry_type];
                        const TypeIcon = TYPE_ICONS[entry.entry_type] ?? CalendarDays;
                        const chip = cn(
                          "flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-[0.72rem] leading-tight font-medium ring-1 ring-border ring-inset",
                          entry.status === "done" ? "bg-secondary text-muted-foreground" : "bg-card text-foreground",
                        );
                        const label = (
                          <>
                            <TypeIcon className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                            <span className="shrink-0 text-muted-foreground tabular-nums">{entry.time}</span>
                            {/* The icon already says what kind of entry this is. */}
                            <span className={cn("truncate", entry.status === "done" && "line-through")}>
                              {entry.title.replace(/^(Interview|Deadline|LinkedIn):\s*/, "")}
                            </span>
                          </>
                        );
                        return (
                          <li key={entry.id}>
                            <Link
                              href={entry.href ?? href({ view: "list", maand: key.slice(0, 7) }, `#dag-${key}`)}
                              title={`${meta?.label ?? entry.entry_type}: ${entry.title} (${entry.time})`}
                              className={cn(chip, "outline-none transition-colors duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring")}
                            >
                              {label}
                            </Link>
                          </li>
                        );
                      })}
                      {overflow > 0 && (
                        <li>
                          <Link
                            href={href({ view: "list", maand: key.slice(0, 7) }, `#dag-${key}`)}
                            className="block rounded-sm px-1.5 text-[0.72rem] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            +{overflow} meer
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Small screens fall back to the list */}
          <div className="md:hidden">{list}</div>
        </>
      ) : (
        list
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>
          {monthEntries.length} item(s) in {format(monthStart, "MMMM", { locale: nl })}
        </span>
        {ENTRY_TYPES.map((t) => {
          const TypeIcon = TYPE_ICONS[t] ?? CalendarDays;
          return (
            <span key={t} className="inline-flex items-center gap-1.5">
              <TypeIcon className="size-3" strokeWidth={1.75} aria-hidden />
              {CALENDAR_TYPE_META[t].label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
