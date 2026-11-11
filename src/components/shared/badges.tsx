import { Megaphone, Users } from "lucide-react";
import {
  AGENT_META,
  CLASSIFICATION_META,
  CONTENT_STATUS_META,
  CONTENT_TYPE_LABELS,
  type Tone,
} from "@/lib/constants";
import type { AgentKind, Classification, ContentStatus, ContentType } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Colour is reserved for state. The eight tone names used across the app
 * resolve to five visual treatments: neutral, info, success, warning, danger.
 */
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  slate: "bg-secondary text-muted-foreground",
  blue: "bg-info-soft text-info",
  teal: "bg-info-soft text-info",
  violet: "bg-info-soft text-info",
  amber: "bg-warning-soft text-warning",
  green: "bg-success-soft text-success",
  red: "bg-danger-soft text-danger",
};

export function ToneBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  /** Kept for call-site compatibility; badges no longer render a dot. */
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-xs px-1.5 text-xs leading-none font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Generic badge for any `{ label, tone }` meta map from lib/constants. */
export function MetaBadge({
  meta,
  value,
  className,
}: {
  meta: Record<string, { label: string; tone: Tone }>;
  value: string | null | undefined;
  dot?: boolean;
  className?: string;
}) {
  const entry = value ? meta[value] : undefined;
  return (
    <ToneBadge tone={entry?.tone ?? "neutral"} className={className}>
      {entry?.label ?? value ?? "Onbekend"}
    </ToneBadge>
  );
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const meta = CONTENT_STATUS_META[status];
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

/** Classification is a property, not a state: outlined and uncoloured. */
export function ClassificationBadge({ classification }: { classification: Classification }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-xs border px-1.5 text-xs leading-none font-medium whitespace-nowrap text-muted-foreground">
      {CLASSIFICATION_META[classification].label}
    </span>
  );
}

export function ContentTypeLabel({ type }: { type: ContentType }) {
  return <span className="text-xs font-medium text-muted-foreground">{CONTENT_TYPE_LABELS[type]}</span>;
}

/** Marks records and output that come from the demo simulation. */
export function DemoBadge({ label = "Demo", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-xs border border-dashed border-input px-1.5 text-[0.6875rem] leading-none font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
      title="Gesimuleerde demogegevens, niet afkomstig uit een gekoppeld systeem"
    >
      {label}
    </span>
  );
}

export function AgentAvatar({ kind, size = "md", className }: { kind: AgentKind; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = kind === "external" ? Megaphone : Users;
  const sizes = { sm: "size-6 [&_svg]:size-3.5", md: "size-8 [&_svg]:size-4", lg: "size-9 [&_svg]:size-[1.125rem]" };
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md border bg-card text-foreground/80", sizes[size], className)}
      aria-hidden
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}

export function AgentBadge({ kind, className }: { kind: AgentKind; className?: string }) {
  const Icon = kind === "external" ? Megaphone : Users;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <Icon className="size-3.5" strokeWidth={1.75} />
      {AGENT_META[kind].short}
    </span>
  );
}
