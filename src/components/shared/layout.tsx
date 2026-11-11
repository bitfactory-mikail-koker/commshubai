import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { initials } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";

/**
 * Page title block. A text label above the title is not rendered (the title
 * carries the page); status badges passed as `eyebrow` sit under the title.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const meta = typeof eyebrow === "string" ? null : eyebrow;
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.019em]">{title}</h1>
        {meta && <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">{meta}</div>}
        {description && <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>}
    </header>
  );
}

/**
 * A titled section. The title sits above its content; the content is one
 * ruled container. This is the app's default grouping.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Removes body padding (for tables and lists that span the full width). */
  flush?: boolean;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || actions) && (
        <div className="mb-2.5 flex min-h-7 items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] leading-6 font-semibold tracking-[-0.006em]">{title}</h2>}
            {description && <p className="text-[0.8125rem] leading-snug text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn("overflow-hidden rounded-lg border bg-card", !flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-10 text-center", className)}>
      {Icon && <Icon className="size-5 text-muted-foreground/70" strokeWidth={1.5} />}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mx-auto max-w-sm text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A figure with its label. Ruled on top, no box: figures read as a row, not as cards. */
export function StatCard({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  /** Accepted for call-site compatibility; not rendered. */
  icon?: LucideIcon;
  accent?: boolean;
}) {
  const body = (
    <div className="flex h-full flex-col gap-1 border-t pt-3">
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-xl leading-7 font-semibold tracking-[-0.014em] tabular-nums">{value}</span>
        {accent && (
          <span className="inline-flex h-5 items-center rounded-xs bg-warning-soft px-1.5 text-xs leading-none font-medium text-warning">
            Jouw besluit
          </span>
        )}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block h-full rounded-sm outline-none transition-colors duration-150 hover:[&>div]:border-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function UserAvatar({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  /** Accepted for call-site compatibility; avatars share one neutral treatment. */
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "size-6 text-[0.625rem]", md: "size-7 text-[0.6875rem]", lg: "size-9 text-xs" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-foreground/75 ring-1 ring-border ring-inset",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Relevance score 0-100: the figure, with a hairline meter for scanning a column. */
export function RelevanceScore({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} title={`Relevantiescore ${score} van 100`}>
      <span className="w-6 text-right text-[0.8125rem] font-medium tabular-nums">{score}</span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-border" aria-hidden>
        <span
          className={cn("block h-full rounded-full", score >= 75 ? "bg-foreground/75" : score >= 50 ? "bg-foreground/45" : "bg-foreground/25")}
          style={{ width: `${score}%` }}
        />
      </span>
    </div>
  );
}

/** Label/value pair for detail sidebars. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Renders stored editorial HTML (sanitized) with article typography. */
export function HtmlContent({ html, compact, className }: { html: string | null | undefined; compact?: boolean; className?: string }) {
  const safe = sanitizeHtml(html).replace(/\[AANVULLEN[^\]]*\]/g, (m) => `<mark class="placeholder-mark">${m}</mark>`);
  return (
    <div
      className={cn("prose-editorial", compact && "prose-compact", className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

/** Link-based filters driven by a search param. */
export function FilterTabs({
  items,
  active,
  className,
}: {
  items: { key: string; label: string; href: string; count?: number }[];
  active: string;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-wrap gap-1", className)} aria-label="Filters">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive
                ? "bg-secondary font-medium text-foreground ring-1 ring-border ring-inset"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Inline notice. Tone colours the icon and the fill; text stays in the foreground colour. */
export function Notice({
  tone = "info",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "demo" | "success" | "danger";
  icon?: LucideIcon;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: { box: "border-info/20 bg-info-soft/45", icon: "text-info" },
    warning: { box: "border-warning/25 bg-warning-soft/55", icon: "text-warning" },
    demo: { box: "border-dashed border-input bg-subtle", icon: "text-muted-foreground" },
    success: { box: "border-success/20 bg-success-soft/50", icon: "text-success" },
    danger: { box: "border-danger/20 bg-danger-soft/60", icon: "text-danger" },
  }[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-lg border px-3.5 py-3 text-[0.8125rem] leading-relaxed", tones.box, className)} role="note">
      {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", tones.icon)} strokeWidth={1.75} />}
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && (
          <div className={cn("[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2", tone === "demo" ? "text-muted-foreground" : "text-foreground/80")}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
