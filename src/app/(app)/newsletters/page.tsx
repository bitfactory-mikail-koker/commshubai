import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Mail, ShieldCheck } from "lucide-react";
import { AgentAvatar, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { NEWSLETTER_STATUS_META } from "@/lib/constants";
import { formatDateTime, formatDay, formatMonth } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AgentKind } from "@/lib/types";
import { StartMdUpdateButton } from "./_components/md-update-actions";
import { PrepareNewsletterForm } from "./_components/prepare-form";
import { NEWSLETTER_LIST_COLUMNS } from "@/lib/columns";

export const metadata: Metadata = { title: "Edities" };

const WORKFLOWS: Record<AgentKind, { title: string; audience: string; includes: string[] }> = {
  external: {
    title: "Externe nieuwsbrief",
    audience: "Maandelijks voor klanten en relaties, voorbereid door de externe agent.",
    includes: ["Gepubliceerde artikelen", "Klantcases", "Commerciële updates", "Ontwikkelingen binnen de organisatie"],
  },
  internal: {
    title: "Interne nieuwsbrief",
    audience: "Maandelijks voor alle collega's, voorbereid door de interne agent.",
    includes: ["Teamprestaties", "Nieuwe collega's", "Interviews", "Organisatienieuws", "Updates van de directie"],
  },
};

export default async function NewslettersPage() {
  const session = await requireSession();
  const db = await createClient();
  const canCreate = can(session, "content.create");
  const editorial = can(session, "content.create", "content.edit", "content.review", "content.approve");

  const [{ data: newsletters, error }, { data: items }] = await Promise.all([
    db.from("newsletters").select(NEWSLETTER_LIST_COLUMNS).order("period_month", { ascending: false }),
    db.from("newsletter_items").select("newsletter_id, included"),
  ]);
  if (error) throw new Error(error.message);

  const mdUpdates = (newsletters ?? []).filter((n) => n.edition_type === "md_update");
  const itemCount = new Map<string, number>();
  for (const item of items ?? []) {
    if (item.included) itemCount.set(item.newsletter_id, (itemCount.get(item.newsletter_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Edities"
        description="Bundels van stukken: de interne nieuwsbrief, de externe nieuwsbrief en de MD-update. De bot stelt een concept samen; jij selecteert, bewerkt en keurt goed."
      />

      <Notice tone="warning" icon={ShieldCheck} title="Er wordt nooit iets automatisch verzonden">
        Een nieuwsbrief kan pas worden ingepland of verzonden na een expliciete menselijke goedkeuring van de huidige versie. Er is geen
        e-mailintegratie verbonden: verzenden wordt gesimuleerd en als zodanig vastgelegd.
      </Notice>

      {!editorial && (
        <Notice tone="info" icon={Mail}>
          Je ziet hier de verzonden interne nieuwsbrieven. Concepten en de externe nieuwsbrief zijn alleen zichtbaar voor de redactie.
        </Notice>
      )}

      {(editorial || mdUpdates.length > 0) && (
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-[0.9375rem] font-semibold">MD-update</h2>
              <p className="max-w-[68ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                Twee keer per maand vertellen de MD&apos;s in een kort interview wat er speelt. De update is geordend per thema, met wie
                wat zei. Elke MD keurt de passages goed die op de eigen antwoorden zijn gebaseerd; wie niet reageert blijft buiten de
                editie.
              </p>
            </div>
            {canCreate && <StartMdUpdateButton />}
          </div>
          {mdUpdates.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nog geen MD-update"
              description="Start een MD-update, of laat het vaste ritme dat doen (Groepen en ritmes)."
            />
          ) : (
            <ul className="divide-y">
              {mdUpdates.map((edition) => {
                const count = itemCount.get(edition.id) ?? 0;
                return (
                  <li key={edition.id}>
                    <Link
                      href={editorial ? `/newsletters/${edition.id}` : `/preview/newsletter/${edition.id}`}
                      className="flex items-center gap-4 px-5 py-3 transition-colors outline-none hover:bg-subtle focus-visible:bg-secondary"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{edition.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {count} {count === 1 ? "passage" : "passages"} · bijgewerkt {formatDay(edition.updated_at)}
                        </p>
                      </div>
                      {edition.is_demo && <DemoBadge />}
                      <MetaBadge meta={NEWSLETTER_STATUS_META} value={edition.status} />
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {(["external", "internal"] as const).map((kind) => {
          const workflow = WORKFLOWS[kind];
          const editions = (newsletters ?? []).filter((n) => n.kind === kind && n.edition_type === "newsletter");
          return (
            <section key={kind} className="overflow-hidden rounded-lg border bg-card">
              <div className="space-y-4 border-b px-5 py-5">
                <div className="flex items-start gap-3">
                  <AgentAvatar kind={kind} size="lg" />
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-xl leading-tight font-semibold tracking-tight">{workflow.title}</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{workflow.audience}</p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-1.5" aria-label="Wat er in deze nieuwsbrief komt">
                  {workflow.includes.map((label) => (
                    <li key={label} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {label}
                    </li>
                  ))}
                </ul>
                {canCreate && <PrepareNewsletterForm kind={kind} />}
              </div>

              {editions.length === 0 ? (
                <EmptyState
                  icon={Mail}
                  title="Nog geen edities"
                  description={
                    canCreate
                      ? "Laat de agent een concept voorbereiden met de goedgekeurde content van de gekozen maand."
                      : "Zodra er een nieuwsbrief is, verschijnt die hier."
                  }
                />
              ) : (
                <ul className="divide-y">
                  {editions.map((newsletter) => {
                    const count = itemCount.get(newsletter.id) ?? 0;
                    const dateLine =
                      newsletter.status === "sent"
                        ? `${newsletter.send_mode === "simulated" ? "Gesimuleerd verzonden" : "Verzonden"} op ${formatDateTime(newsletter.sent_at)}`
                        : newsletter.status === "scheduled" && newsletter.send_at
                          ? `Verzending gepland: ${formatDay(newsletter.send_at)}`
                          : `Laatst bijgewerkt ${formatDay(newsletter.updated_at)}`;
                    return (
                      <li key={newsletter.id}>
                        <Link
                          href={`/newsletters/${newsletter.id}`}
                          className="flex items-center gap-4 px-5 py-4 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground ">
                                {formatMonth(newsletter.period_month)}
                              </span>
                              {newsletter.is_demo && <DemoBadge />}
                            </div>
                            <p className="truncate text-sm font-medium">{newsletter.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {count} {count === 1 ? "item" : "items"} · {dateLine}
                            </p>
                          </div>
                          <MetaBadge meta={NEWSLETTER_STATUS_META} value={newsletter.status} dot />
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
