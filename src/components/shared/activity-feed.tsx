import Link from "next/link";
import { Cpu, ShieldAlert } from "lucide-react";
import { AgentAvatar } from "@/components/shared/badges";
import { EmptyState, UserAvatar } from "@/components/shared/layout";
import { AUDIT_CATEGORY_META } from "@/lib/constants";
import { formatDay } from "@/lib/format";
import type { AgentKind, AuditCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  actor_type: string;
  category: string;
  summary: string;
  entity_type: string | null;
  entity_id: string | null;
  requires_approval: boolean;
  created_at: string;
  metadata: unknown;
  profile: { full_name: string; avatar_color: string } | null;
  agent: { kind: AgentKind; name: string } | null;
};

/** Columns to select from audit_logs for <ActivityFeed>. */
export const ACTIVITY_SELECT =
  "id, actor_type, category, summary, entity_type, entity_id, requires_approval, created_at, metadata, profile:profiles!audit_logs_actor_profile_id_fkey(full_name, avatar_color), agent:agents!audit_logs_actor_agent_id_fkey(kind, name)";

export function entityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "signal":
      return `/inbox/${id}`;
    case "article":
      return `/editorial/${id}`;
    case "interview":
      return `/interviews/${id}`;
    case "newsletter":
      return `/newsletters/${id}`;
    case "integration":
      return "/integrations";
    case "opportunity":
      return "/inbox";
    case "project":
      return "/projects";
    case "channel":
      return "/channels";
    case "outreach_group":
      return "/groups";
    case "social_post":
      return `/preview/social_post/${id}`;
    case "profile":
      return "/team";
    default:
      return null;
  }
}

export function ActivityFeed({
  items,
  emptyText = "Nog geen activiteit.",
  showCategory = true,
  className,
}: {
  items: ActivityItem[];
  emptyText?: string;
  showCategory?: boolean;
  className?: string;
}) {
  if (items.length === 0) return <EmptyState title={emptyText} className="py-8" />;
  return (
    <ol className={cn("divide-y", className)}>
      {items.map((item) => {
        const href = entityHref(item.entity_type, item.entity_id);
        const category = AUDIT_CATEGORY_META[item.category as AuditCategory];
        const isDemo = Boolean((item.metadata as { demo?: boolean } | null)?.demo);
        const actor = item.agent?.name ?? item.profile?.full_name ?? "Intelligence Engine";
        return (
          <li key={item.id} className="flex gap-3 px-4 py-2.5">
            {item.agent ? (
              <AgentAvatar kind={item.agent.kind} size="sm" className="mt-0.5" />
            ) : item.profile ? (
              <UserAvatar name={item.profile.full_name} size="sm" className="mt-0.5" />
            ) : (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
                <Cpu className="size-3.5" strokeWidth={1.75} />
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[0.8125rem] leading-snug text-pretty">
                {href ? (
                  <Link href={href} className="underline-offset-2 hover:underline">
                    {item.summary}
                  </Link>
                ) : (
                  item.summary
                )}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{actor}</span>
                <time dateTime={item.created_at} className="tabular-nums">
                  {formatDay(item.created_at)}
                </time>
                {showCategory && category && <span>{category.label}</span>}
                {item.requires_approval && (
                  <span className="inline-flex items-center gap-1 font-medium text-warning">
                    <ShieldAlert className="size-3" />
                    Vereist menselijke goedkeuring
                  </span>
                )}
                {isDemo && <span title="Gesimuleerde demogegevens">Demo</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
