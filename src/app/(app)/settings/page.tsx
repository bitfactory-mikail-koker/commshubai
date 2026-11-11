import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CircleCheck, Lock, Mail, Mic, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { DemoBadge, ToneBadge } from "@/components/shared/badges";
import { Field, Notice, PageHeader, Panel } from "@/components/shared/layout";
import { aiStatus } from "@/lib/ai";
import { can, requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { roleLabel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { OrganizationForm } from "./_components/organization-form";
import { PasswordForm } from "./_components/password-form";
import { ProfileForm } from "./_components/profile-form";

export const metadata: Metadata = { title: "Instellingen" };

const RECURRING_JOBS = [
  {
    icon: Mail,
    title: "Vaste ritmes",
    text: "De teamronde, de MD-update, de twee nieuwsbrieven en het weekoverzicht lopen volgens de ritmes onder Groepen en ritmes. Verzenden gebeurt alleen na goedkeuring.",
  },
  {
    icon: Mic,
    title: "Herinneringen en termijnen",
    text: "Eén herinnering na twee werkdagen, daarna hoort de redactie het. Berichten buiten werktijd wachten tot de volgende werkdag.",
  },
  {
    icon: CalendarClock,
    title: "Geplande publicaties",
    text: "Goedgekeurde content waarvan het geplande moment is bereikt, wordt gepubliceerd. De database weigert dit zonder goedkeuring van de huidige versie.",
  },
  {
    icon: RefreshCw,
    title: "Synchronisatie en analyse",
    text: "Live verbonden bronnen (Slack, Jira) worden elk uur gesynchroniseerd; nieuwe bronberichten worden geanalyseerd op signalen.",
  },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const canManageOrg = can(session, "users.manage");
  const canSeeTasks = can(session, "agents.manage", "content.create", "content.edit", "content.review", "content.approve");
  const ai = aiStatus();
  const db = await createClient();

  const { count: queuedTasks } = canSeeTasks
    ? await db.from("agent_tasks").select("id", { count: "exact", head: true }).eq("status", "queued")
    : { count: null };

  const settings = session.organization.settings;
  const devScheduler = process.env.ENABLE_DEV_SCHEDULER === "true";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Instellingen"
        description="Je eigen profiel, de instellingen van de organisatie en hoe de AI en achtergrondtaken zijn geconfigureerd."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Mijn profiel" description="Zo zien collega's je in de hub en in het activiteitenlogboek.">
          <ProfileForm
            initial={{
              fullName: session.profile.full_name,
              jobTitle: session.profile.job_title ?? "",
              department: session.profile.department ?? "",
            }}
            email={session.profile.email}
            role={roleLabel(session.role.key)}
          />
        </Panel>

        <Panel title="Wachtwoord" description="Kies een wachtwoord van minimaal 10 tekens dat je nergens anders gebruikt.">
          <PasswordForm />
        </Panel>
      </div>

      <Panel
        title="Organisatie"
        description="Gelden voor iedereen in deze omgeving."
        actions={!canManageOrg ? <ToneBadge tone="slate">Alleen-lezen</ToneBadge> : undefined}
      >
        {!canManageOrg && (
          <Notice tone="info" icon={Lock} className="mb-5">
            Alleen gebruikers met het recht ‘Gebruikers beheren’ kunnen de organisatie-instellingen wijzigen.
          </Notice>
        )}
        <OrganizationForm
          key={session.organization.updated_at}
          initial={{
            name: session.organization.name,
            timezone: session.organization.timezone,
            requireFourEyes: Boolean(settings.require_four_eyes),
            retentionDays: settings.retention_days ?? 365,
          }}
          canManage={canManageOrg}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              AI-provider
              {ai.id === "demo" && <DemoBadge label="Demo-modus" />}
            </span>
          }
          description="Wordt ingesteld via omgevingsvariabelen op de server, niet in de interface."
        >
          <div className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Actieve provider">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Sparkles className="size-3.5" />
                  {ai.id === "claude" ? "Claude API" : "Regelgebaseerde demo-provider"}
                </span>
              </Field>
              <Field label="Model">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{ai.model}</code>
              </Field>
            </dl>
            {ai.id === "claude" ? (
              <Notice tone="success" icon={CircleCheck} title="De Claude API is geconfigureerd">
                Analyses, interviews en concepten worden gegenereerd door Claude. Feiten en quotes moeten uit bronnen en interviews
                komen; de merkcontrole toetst dat na elke generatie.
              </Notice>
            ) : (
              <Notice tone="demo" icon={Sparkles} title="Er is geen API-sleutel ingesteld">
                <p>
                  Signaaldetectie werkt nu op trefwoorden en concepten worden opgebouwd uit bronmateriaal en interviewantwoorden.
                  Alles wat zo ontstaat is als demo-uitvoer gemarkeerd.
                </p>
                <p className="mt-2">
                  Zet <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> (en optioneel{" "}
                  <code className="font-mono text-xs">ANTHROPIC_MODEL</code>) in <code className="font-mono text-xs">.env.local</code> en
                  herstart de server om Claude te gebruiken.
                </p>
              </Notice>
            )}
          </div>
        </Panel>

        <Panel title="Achtergrondtaken" description="Geplande en terugkerende taken van de agents.">
          <div className="space-y-4">
            <ul className="space-y-3.5">
              {RECURRING_JOBS.map((job) => (
                <li key={job.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <job.icon className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="text-[0.8125rem] leading-relaxed">
                    <span className="font-medium">{job.title}</span>
                    <span className="block text-muted-foreground">{job.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-[0.8125rem] leading-relaxed">
              <p className="font-medium">Zo worden taken gestart</p>
              <p className="text-muted-foreground">
                Laat een cron-dienst periodiek (bijvoorbeeld elke vijf minuten){" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">{env.appUrl}/api/jobs/tick</code> aanroepen met de
                header <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">Authorization: Bearer &lt;CRON_SECRET&gt;</code>.
              </p>
              <ul className="space-y-1 pt-1 text-xs">
                <li className="flex items-center gap-1.5">
                  {env.cronSecret ? (
                    <CircleCheck className="size-3.5 text-success" />
                  ) : (
                    <TriangleAlert className="size-3.5 text-warning" />
                  )}
                  {env.cronSecret ? "CRON_SECRET is ingesteld." : "CRON_SECRET ontbreekt: het endpoint kan niet worden aangeroepen."}
                </li>
                <li className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-3.5" />
                  Lokale planner (ENABLE_DEV_SCHEDULER): {devScheduler ? "aan" : "uit"}.
                </li>
              </ul>
            </div>

            {canSeeTasks && (
              <Link
                href="/agents?tab=taken"
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium underline-offset-4 hover:underline"
              >
                {queuedTasks ? `${queuedTasks} ${queuedTasks === 1 ? "taak" : "taken"} in de wachtrij bekijken` : "Taken bekijken of nu uitvoeren"}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
