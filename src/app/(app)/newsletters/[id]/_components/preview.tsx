import { HtmlContent } from "@/components/shared/layout";
import { sanitizeHtml } from "@/lib/sanitize";
import type { AgentKind } from "@/lib/types";
import { groupBySection, type BuilderItem } from "./items";

/**
 * E-mail preview of the saved newsletter. Rendered on the server from the
 * stored state, so it always shows what would be sent.
 */
export function NewsletterPreview({
  kind,
  organizationName,
  monthLabel,
  subject,
  introHtml,
  outroHtml,
  items,
}: {
  kind: AgentKind;
  organizationName: string;
  monthLabel: string;
  subject: string;
  introHtml: string;
  outroHtml: string;
  items: BuilderItem[];
}) {
  const groups = groupBySection(items.filter((item) => item.included));
  const audience = kind === "external" ? "Klanten en relaties" : "Alle medewerkers";

  return (
    <div className="bg-muted/50 p-4 sm:p-6">
      {/* Mail client meta */}
      <dl className="mx-auto mb-3 grid max-w-[600px] grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Van</dt>
        <dd className="truncate">{organizationName}</dd>
        <dt className="text-muted-foreground">Aan</dt>
        <dd className="truncate">{audience}</dd>
        <dt className="text-muted-foreground">Onderwerp</dt>
        <dd className="font-medium">{subject || "(geen onderwerpregel)"}</dd>
      </dl>

      <article className="paper mx-auto max-w-[600px] overflow-hidden rounded-lg border shadow-sm">
        <header className="border-b bg-foreground px-7 py-6 text-background">
          <p className="text-[0.68rem] font-semibold opacity-70">
            {kind === "external" ? "Nieuwsbrief" : "Interne nieuwsbrief"} · {monthLabel}
          </p>
          <p className="mt-1.5 text-2xl leading-tight font-semibold tracking-tight">{organizationName}</p>
        </header>

        <div className="space-y-7 px-7 py-7">
          {introHtml ? (
            <HtmlContent html={sanitizeHtml(introHtml)} compact />
          ) : (
            <p className="text-sm text-muted-foreground italic">Nog geen inleiding.</p>
          )}

          {groups.length === 0 ? (
            <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Er zijn nog geen items geselecteerd voor deze nieuwsbrief.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.section} className="space-y-4">
                <h3 className="border-b pb-1.5 text-[0.7rem] font-semibold text-muted-foreground ">
                  {group.section}
                </h3>
                {group.items.map((item) => (
                  <div key={item.id} className="space-y-1.5">
                    <h4 className="text-[1.12rem] leading-snug font-semibold tracking-tight">{item.title || "Zonder titel"}</h4>
                    {item.summary && <p className="text-[0.9rem] leading-relaxed text-foreground/80">{item.summary}</p>}
                    {item.article && (
                      <p className="text-[0.8125rem] font-medium underline decoration-foreground/30 underline-offset-4">Lees verder →</p>
                    )}
                  </div>
                ))}
              </section>
            ))
          )}

          {outroHtml && (
            <div className="border-t pt-6">
              <HtmlContent html={sanitizeHtml(outroHtml)} compact />
            </div>
          )}
        </div>

        <footer className="border-t bg-muted/40 px-7 py-4 text-[0.72rem] leading-relaxed text-muted-foreground">
          {kind === "external"
            ? `Je ontvangt deze e-mail omdat je relatie bent van ${organizationName}. Uitschrijven kan via de link onderaan elke nieuwsbrief.`
            : `Deze nieuwsbrief is bedoeld voor medewerkers van ${organizationName} en niet voor externe verspreiding.`}
        </footer>
      </article>
    </div>
  );
}
