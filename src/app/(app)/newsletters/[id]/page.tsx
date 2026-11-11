import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { AgentAvatar, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { EmptyState, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { can, requireSession } from "@/lib/auth";
import { AGENT_META, APPROVAL_DECISION_META, NEWSLETTER_STATUS_META } from "@/lib/constants";
import { formatDateTime, formatDay, formatMonth } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { NewsletterStatus } from "@/lib/types";
import { AddItemDialog } from "./_components/add-item-dialog";
import { ContentForm } from "./_components/content-form";
import type { BuilderItem, EligibleArticle } from "./_components/items";
import { ItemsPanel } from "./_components/items-panel";
import { NewsletterPreview } from "./_components/preview";
import { ApprovalRound } from "@/components/redactie/approval-round";
import { ReadyPanel } from "@/components/redactie/ready-panel";
import { INTERVIEW_STATUS_META } from "@/lib/constants";
import { stripHtml } from "@/lib/html-text";
import { sanitizeHtml } from "@/lib/sanitize";
import { loadRound } from "@/lib/redactie/queries";
import { ComposeMdUpdateButton } from "../_components/md-update-actions";
import { WorkflowPanel } from "./_components/workflow-panel";

export const metadata: Metadata = { title: "Nieuwsbrief" };

export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();

  const { data: newsletter } = await db.from("newsletters").select("*").eq("id", id).maybeSingle();
  if (!newsletter) notFound();

  const status = newsletter.status as NewsletterStatus;
  const kind = newsletter.kind;
  const permissions = {
    canEdit: can(session, "content.edit"),
    canReview: can(session, "content.review"),
    canApprove: can(session, "content.approve"),
    canPublish: can(session, "content.publish"),
  };
  const unlocked = ["draft", "changes_requested"].includes(status);
  const editable = unlocked && permissions.canEdit;

  const [{ data: itemRows }, { data: articleRows }, { data: approvals }] = await Promise.all([
    db
      .from("newsletter_items")
      .select("id, section, included, position, custom_title, custom_summary, created_at, article:articles(id, title, excerpt, status, content_type)")
      .eq("newsletter_id", id)
      .order("position")
      .order("created_at"),
    editable
      ? db
          .from("articles")
          .select("id, title, excerpt, status, content_type, channel")
          .eq("classification", kind)
          .neq("status", "archived")
          .order("updated_at", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] }),
    db
      .from("approvals")
      .select(
        "id, version, decision, decision_note, requested_at, decided_at, requester:profiles!approvals_requested_by_profile_id_fkey(full_name), decider:profiles!approvals_decided_by_fkey(full_name)",
      )
      .eq("entity_type", "newsletter")
      .eq("entity_id", id)
      .order("requested_at", { ascending: false }),
  ]);

  const items: BuilderItem[] = (itemRows ?? []).map((row, index) => ({
    id: row.id,
    section: row.section,
    included: row.included,
    // Normalised so that equal stored positions still give a stable order.
    position: index,
    customTitle: row.custom_title,
    customSummary: row.custom_summary,
    article: row.article
      ? {
          id: row.article.id,
          title: row.article.title,
          excerpt: row.article.excerpt,
          status: row.article.status,
          contentType: row.article.content_type,
        }
      : null,
    title: row.custom_title ?? row.article?.title ?? "",
    summary: row.custom_summary ?? row.article?.excerpt ?? "",
  }));

  const linkedIds = new Set(items.map((item) => item.article?.id).filter(Boolean));
  const eligible: EligibleArticle[] = (articleRows ?? [])
    .filter(
      (a) =>
        !linkedIds.has(a.id) &&
        a.content_type !== "newsletter" &&
        a.content_type !== "social_post" &&
        a.channel !== "slack" &&
        a.channel !== "email",
    )
    .map((a) => ({ id: a.id, title: a.title, excerpt: a.excerpt, status: a.status, contentType: a.content_type }));

  const includedCount = items.filter((item) => item.included).length;
  const isMdUpdate = newsletter.edition_type === "md_update";
  const round = await loadRound(db, "newsletter", id, newsletter.current_version);
  const { data: mdInterviews } = isMdUpdate
    ? await db
        .from("interviews")
        .select("id, interviewee_name, status")
        .contains("metadata", { edition_id: id })
        .order("interviewee_name")
    : { data: [] };
  const exportText = [
    newsletter.subject ?? newsletter.title,
    stripHtml(newsletter.intro_html),
    ...items.filter((item) => item.included).map((item) => `${item.section}: ${item.title}\n${item.summary}`),
    stripHtml(newsletter.outro_html),
  ]
    .filter(Boolean)
    .join("\n\n");
  const monthLabel = formatMonth(`${newsletter.period_month}T12:00:00`);
  const addButton = editable ? <AddItemDialog newsletterId={id} kind={kind} articles={eligible} /> : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link
          href="/newsletters"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Edities
        </Link>
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-2">
              {isMdUpdate ? "MD-update" : `${kind === "external" ? "Externe nieuwsbrief" : "Interne nieuwsbrief"} · ${monthLabel}`}
              <MetaBadge meta={NEWSLETTER_STATUS_META} value={status} dot />
              {newsletter.is_demo && <DemoBadge />}
            </span>
          }
          title={newsletter.title}
          description={
            <span className="inline-flex items-center gap-2">
              <AgentAvatar kind={kind} size="sm" />
              Voorbereid door de {AGENT_META[kind].label} · versie {newsletter.current_version}
            </span>
          }
        />
      </div>

      <div className="space-y-3">
        {!unlocked && status !== "archived" && (
          <Notice tone="info" icon={Lock} title="Deze nieuwsbrief is vergrendeld">
            {status === "sent"
              ? "De nieuwsbrief is verzonden en kan niet meer worden gewijzigd."
              : "De inhoud is alleen-lezen zolang de nieuwsbrief ter review ligt of is goedgekeurd. Heropen hem als concept om te bewerken; daarna is een nieuwe goedkeuring nodig."}
          </Notice>
        )}
        {unlocked && !permissions.canEdit && (
          <Notice tone="info" icon={Lock} title="Alleen-lezen">
            Je hebt geen recht om content te bewerken. Je kunt de nieuwsbrief wel bekijken.
          </Notice>
        )}
        {newsletter.generation_provider === "demo" && (
          <Notice tone="demo" icon={Sparkles} title="Inleiding en afsluiting komen uit de demo-modus">
            Er is geen Claude API-sleutel ingesteld. De onderwerpregel, inleiding en afsluiting zijn opgebouwd met vaste sjablonen op
            basis van de geselecteerde items.
          </Notice>
        )}
        {status === "sent" && newsletter.send_mode === "simulated" && (
          <Notice tone="demo" icon={ShieldCheck} title="Gesimuleerd verzonden">
            Op {formatDateTime(newsletter.sent_at)} gemarkeerd als verzonden. Er is geen e-mailintegratie verbonden, dus er is geen
            e-mail verstuurd.
          </Notice>
        )}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {/* Left: content */}
        <div className="space-y-6">
          <Panel title="Inhoud" description="Titel, onderwerpregel, inleiding en afsluiting.">
            <ContentForm
              key={`${newsletter.current_version}-${newsletter.updated_at}`}
              newsletterId={id}
              title={newsletter.title}
              subject={newsletter.subject ?? ""}
              introHtml={sanitizeHtml(newsletter.intro_html)}
              outroHtml={sanitizeHtml(newsletter.outro_html)}
              editable={editable}
            />
          </Panel>

          <Panel
            title="Items"
            description={`${includedCount} van ${items.length} opgenomen. Zet een item uit om het over te slaan zonder het te verwijderen.`}
            actions={items.length > 0 ? addButton : undefined}
            flush
          >
            <ItemsPanel newsletterId={id} items={items} editable={editable} addButton={addButton} />
          </Panel>
        </div>

        {/* Right: workflow and preview */}
        <div className="space-y-6">
          {isMdUpdate && (
            <Panel
              title="Interviews met de MD's"
              description="De editie wordt samengesteld uit de interviews die zijn afgerond. Een MD die niet antwoordt komt er niet in."
              actions={editable && can(session, "content.create", "content.edit") ? <ComposeMdUpdateButton id={id} hasPassages={items.some((i) => !i.article)} /> : undefined}
              flush
            >
              {(mdInterviews ?? []).length === 0 ? (
                <EmptyState title="Geen interviews" description="Er is niemand uitgenodigd. Wijs de rol MD toe bij Mensen en rollen." className="py-6" />
              ) : (
                <ul className="divide-y">
                  {(mdInterviews ?? []).map((interview) => (
                    <li key={interview.id}>
                      <Link
                        href={`/interviews/${interview.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm outline-none transition-colors duration-150 hover:bg-subtle focus-visible:bg-secondary"
                      >
                        <span className="truncate font-medium">{interview.interviewee_name}</span>
                        <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {["approved", "scheduled"].includes(status) && (
            <Panel title="Klaar voor publicatie" description="Kopieer de tekst of download hem als schone HTML voor je nieuwsbrieftool.">
              <ReadyPanel type="newsletter" id={id} text={exportText} canMarkPublished={false} />
            </Panel>
          )}

          {status === "in_review" && round.items.some((item) => item.decision !== "withdrawn") && (
            <Panel
              title="Goedkeuringsronde"
              description={`Versie ${newsletter.current_version}. Wie akkoord geeft wordt vastgelegd.`}
              actions={
                <Link href={`/preview/newsletter/${id}`} className="text-[0.8125rem] font-medium underline underline-offset-4">
                  Voorvertoning
                </Link>
              }
            >
              <ApprovalRound items={round.items} names={round.names} />
            </Panel>
          )}

          <Panel
            title="Workflow"
            description={
              status === "scheduled" && newsletter.send_at
                ? `Verzending gepland: ${formatDay(newsletter.send_at)}`
                : "Verzenden kan alleen na menselijke goedkeuring van de huidige versie."
            }
            actions={<MetaBadge meta={NEWSLETTER_STATUS_META} value={status} dot />}
          >
            <div className="space-y-5">
              <WorkflowPanel
                id={id}
                status={status}
                sendAt={newsletter.send_at}
                includedCount={includedCount}
                permissions={permissions}
              />

              <div className="space-y-2.5 border-t pt-4">
                <h3 className="text-xs font-semibold text-muted-foreground ">Goedkeuringshistorie</h3>
                {(approvals ?? []).length === 0 ? (
                  <EmptyState title="Nog niet ingediend" description="Zodra de nieuwsbrief ter goedkeuring is ingediend, staat het verloop hier." className="py-5" />
                ) : (
                  <ol className="space-y-3">
                    {(approvals ?? []).map((approval) => (
                      <li key={approval.id} className="space-y-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <MetaBadge meta={APPROVAL_DECISION_META} value={approval.decision} />
                          <span className="text-xs text-muted-foreground">Versie {approval.version}</span>
                        </div>
                        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                          Ingediend door {approval.requester?.full_name ?? "een agent"} op {formatDateTime(approval.requested_at)}
                          {approval.decided_at && approval.decider
                            ? ` · besluit door ${approval.decider.full_name} op ${formatDateTime(approval.decided_at)}`
                            : ""}
                        </p>
                        {approval.decision_note && (
                          <p className="rounded-md bg-muted px-3 py-2 text-[0.8125rem] leading-relaxed">{approval.decision_note}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title="Voorbeeld"
            description="Zo ziet de opgeslagen nieuwsbrief eruit in een e-mailprogramma."
            flush
            bodyClassName="overflow-hidden rounded-b-xl"
          >
            <NewsletterPreview
              kind={kind}
              organizationName={session.organization.name}
              monthLabel={monthLabel}
              subject={newsletter.subject ?? ""}
              introHtml={sanitizeHtml(newsletter.intro_html)}
              outroHtml={sanitizeHtml(newsletter.outro_html)}
              items={items}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
