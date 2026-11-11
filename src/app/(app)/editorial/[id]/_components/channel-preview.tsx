import { Globe, Hash, Mail, ThumbsUp } from "lucide-react";
import { HtmlContent } from "@/components/shared/layout";
import type { SafeHtml } from "@/lib/safe-html";
import { channelLabel, CONTENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ContentType } from "@/lib/types";

type PreviewProps = {
  channel: string | null;
  contentType: ContentType;
  title: string;
  subtitle: string;
  html: SafeHtml;
  text: string;
  organizationName: string;
  authorName: string;
  date: string | null;
};

function EmptyBody() {
  return <p className="text-sm text-muted-foreground italic">Er is nog geen tekst om te tonen.</p>;
}

/** Preview of how the item reads in its channel. Not a pixel-perfect copy of the channel. */
export function ChannelPreview(props: PreviewProps) {
  const { channel, title, subtitle, html, text, organizationName, authorName, date, contentType } = props;
  const empty = text.length === 0;
  const dateLabel = formatDate(date ?? new Date());

  if (channel === "linkedin") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border bg-card">
        <div className="flex items-center gap-3 px-4 pt-4">
          <span className="flex size-11 items-center justify-center rounded-md bg-foreground text-lg font-semibold text-background">
            {organizationName.slice(0, 1)}
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{organizationName}</p>
            <p className="text-xs text-muted-foreground">Bedrijfspagina · {dateLabel}</p>
          </div>
        </div>
        <div className="space-y-2 px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
          <p className="font-medium">{title}</p>
          {text ? <p>{text}</p> : <EmptyBody />}
        </div>
        <div className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <ThumbsUp className="size-3.5" strokeWidth={1.5} />
          Voorbeeld van een LinkedIn-bericht
        </div>
      </div>
    );
  }

  if (channel === "slack") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border bg-card">
        <div className="flex items-center gap-1.5 border-b px-4 py-2.5 text-sm font-semibold">
          <Hash className="size-4 text-muted-foreground" strokeWidth={1.75} />
          algemeen
        </div>
        <div className="flex gap-3 px-4 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground">
            {authorName.slice(0, 1)}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm">
              <span className="font-semibold">{authorName}</span>{" "}
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </p>
            {empty ? <EmptyBody /> : <HtmlContent html={html} compact className="font-sans text-[0.9rem] [&_h2]:text-base" />}
          </div>
        </div>
      </div>
    );
  }

  if (channel === "email" || channel === "internal_newsletter" || channel === "external_newsletter") {
    return (
      <div className="mx-auto max-w-2xl overflow-hidden rounded-lg border bg-card">
        <dl className="space-y-1 border-b bg-muted/40 px-5 py-3.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Van</dt>
            <dd className="font-medium">{organizationName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Onderwerp</dt>
            <dd className="font-medium">{title}</dd>
          </div>
        </dl>
        <div className="space-y-4 px-6 py-6 sm:px-8">
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {empty ? <EmptyBody /> : <HtmlContent html={html} compact />}
        </div>
        <div className="flex items-center gap-1.5 border-t px-5 py-2.5 text-xs text-muted-foreground">
          <Mail className="size-3.5" strokeWidth={1.5} />
          Voorbeeld van een {channel === "email" ? "e-mail" : "nieuwsbriefitem"}
        </div>
      </div>
    );
  }

  // Website / intranet article
  return (
    <article className="mx-auto max-w-2xl rounded-lg border bg-card px-6 py-8 sm:px-10 sm:py-10">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground ">
        <Globe className="size-3.5" strokeWidth={1.5} />
        {channelLabel(channel)} · {CONTENT_TYPE_LABELS[contentType]}
      </p>
      <h1 className="mt-4 text-[2rem] leading-[1.15] font-semibold tracking-tight text-balance">{title}</h1>
      {subtitle && <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{subtitle}</p>}
      <p className="mt-4 border-b pb-5 text-xs text-muted-foreground">
        {organizationName} · {dateLabel}
      </p>
      <div className="mt-6">{empty ? <EmptyBody /> : <HtmlContent html={html} />}</div>
    </article>
  );
}
