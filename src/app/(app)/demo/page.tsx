import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, FlaskConical, Info, PartyPopper, RotateCcw, TriangleAlert } from "lucide-react";
import { demoGenerateDraft, demoRequestInterview, resetDemoScenario, startDemoScenario } from "@/actions/demo";
import { ActionButton } from "@/components/shared/actions";
import { ContentStatusBadge, DemoBadge, MetaBadge } from "@/components/shared/badges";
import { Notice, PageHeader, Panel, RelevanceScore, UserAvatar } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { can, requirePagePermission } from "@/lib/auth";
import { EXTERNAL_PERMISSION_META, INTERVIEW_STATUS_META, SIGNAL_STATUS_META } from "@/lib/constants";
import { SCENARIO_MESSAGE } from "@/lib/demo/feed";
import { getScenarioState } from "@/lib/demo/scenario";
import { env } from "@/lib/env";
import { formatDateTime, formatDay } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { Step, type StepState } from "./_components/step";

export const metadata: Metadata = { title: "Demoscenario" };

function StepLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>
        {children}
        <ArrowRight />
      </Link>
    </Button>
  );
}

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[0.8125rem] leading-relaxed">
      <CircleCheck className={done ? "mt-0.5 size-4 shrink-0 text-success" : "mt-0.5 size-4 shrink-0 text-muted-foreground/40"} />
      <span className={done ? "text-foreground" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

export default async function DemoPage() {
  const session = await requirePagePermission("content.create");

  if (!env.demoMode) {
    return (
      <div className="space-y-8">
        <PageHeader title="Demoscenario" />
        <Notice tone="info" icon={Info} title="De demo-modus staat uit">
          Zet <code className="font-mono text-xs">NEXT_PUBLIC_DEMO_MODE=true</code> in de omgeving en herstart de server om het
          begeleide demoscenario te gebruiken.
        </Notice>
      </div>
    );
  }

  const db = await createClient();
  const state = await getScenarioState(db, session.organization.id);
  const { message, signal, opportunity, article, interview, currentStep } = state;
  const canReset = can(session, "agents.manage", "users.manage");
  const stepState = (index: number): StepState => (index < currentStep ? "done" : index === currentStep ? "current" : "upcoming");

  const submitted = Boolean(article && ["in_review", "approved", "scheduled", "published"].includes(article.status));
  const approved = Boolean(article && ["approved", "scheduled", "published"].includes(article.status));
  const permissionGranted = article?.externalPermission === "granted";
  const finished = currentStep >= 8;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Van Slack-bericht tot geplande publicatie"
        description="Doorloop in acht stappen hoe één bericht een goedgekeurde klantcase wordt. Elke stap is een echte actie in de hub; deze pagina laat zien wat er daadwerkelijk is gebeurd."
        actions={
          <>
            <span className="text-xs text-muted-foreground tabular-nums">
              {finished ? "Alle 8 stappen afgerond" : `Stap ${currentStep + 1} van 8`}
            </span>
            {message && canReset && (
              <ActionButton
                action={resetDemoScenario}
                variant="outline"
                confirm={{
                  title: "Demoscenario resetten?",
                  description:
                    "Alle records die dit scenario heeft aangemaakt (bericht, signaal, kans, interview, contentitem en planning) worden verwijderd. Andere gegevens blijven ongemoeid.",
                  confirmLabel: "Resetten",
                  destructive: true,
                }}
              >
                <RotateCcw />
                Scenario resetten
              </ActionButton>
            )}
          </>
        }
      />

      <Notice tone="demo" icon={FlaskConical} title="Dit scenario gebruikt gesimuleerde gegevens">
        Het Slack-bericht komt niet uit een gekoppelde workspace en de klant ‘Veldhuis Zorggroep’ is fictief. Alles wat hieruit
        ontstaat is in de hub gemarkeerd als demo.{" "}
        {!canReset && message && "Resetten kan alleen met het recht ‘Agents beheren’ of ‘Gebruikers beheren’."}
      </Notice>

      {finished && (
        <Notice tone="success" icon={PartyPopper} title="Het scenario is rond">
          Van signaal tot geplande publicatie, met een menselijke goedkeuring en bevestigde toestemming ertussen. Bekijk het
          volledige spoor in het activiteitenlogboek onder AI-agents.
        </Notice>
      )}

      <Panel flush bodyClassName="px-5 py-6 sm:px-7">
        <ol>
          <Step index={1} state={stepState(0)} title="Slack-bericht komt binnen" actor="Bron: Slack">
            <p>Een projectleider deelt goed nieuws in een projectkanaal. De Intelligence Engine leest alleen toegestane kanalen.</p>
            <figure className="rounded-lg border bg-background p-4">
              <div className="flex items-start gap-3">
                <UserAvatar name={SCENARIO_MESSAGE.authorName} color="blue" />
                <div className="min-w-0 space-y-1">
                  <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="text-sm font-semibold text-foreground">{SCENARIO_MESSAGE.authorName}</span>
                    <span>{SCENARIO_MESSAGE.channel}</span>
                    {message && <time dateTime={message.occurredAt}>{formatDay(message.occurredAt)}</time>}
                    <DemoBadge />
                  </figcaption>
                  <blockquote className="text-[0.9rem] leading-relaxed text-foreground">{message?.body ?? SCENARIO_MESSAGE.body}</blockquote>
                </div>
              </div>
            </figure>
            {!message && (
              <ActionButton action={startDemoScenario} pendingLabel="Bericht verwerken…">
                <FlaskConical />
                Simuleer Slack-bericht
              </ActionButton>
            )}
          </Step>

          <Step index={2} state={stepState(1)} title="Signaal gedetecteerd en context verrijkt" actor="Intelligence Engine">
            {signal ? (
              <>
                <p>
                  Het bericht is herkend als nieuwswaardig en gekoppeld aan gerelateerde informatie uit andere bronnen (zelfde klant
                  of project).
                </p>
                <dl className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-3">
                    <dt className="text-xs font-medium text-muted-foreground">Signaal</dt>
                    <dd className="text-sm font-medium">{signal.title}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Relevantie</dt>
                    <dd>
                      <RelevanceScore score={signal.relevance} />
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Gerelateerde bronnen</dt>
                    <dd className="text-sm font-medium tabular-nums">{signal.relatedSources}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                    <dd>
                      <MetaBadge meta={SIGNAL_STATUS_META} value={signal.status} dot />
                    </dd>
                  </div>
                </dl>
                <StepLink href={`/inbox/${signal.id}`}>Signaal bekijken in de inbox</StepLink>
              </>
            ) : message ? (
              <Notice tone="warning" icon={TriangleAlert} title="Er is geen signaal gedetecteerd">
                Het bericht is verwerkt, maar niet als nieuwswaardig herkend. Reset het scenario en probeer het opnieuw.
              </Notice>
            ) : (
              <p>De engine beoordeelt de nieuwswaarde, kent een relevantiescore toe en zoekt verwante berichten in Jira en Teamleader.</p>
            )}
          </Step>

          <Step index={3} state={stepState(2)} title="Contentkans voorgesteld" actor="Externe agent" agent="external">
            {opportunity ? (
              <>
                <p>De externe agent heeft het signaal beoordeeld en stelt een format, invalshoek en betrokkenen voor.</p>
                <dl className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Kans</dt>
                    <dd className="text-sm font-medium">{opportunity.title}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs font-medium text-muted-foreground">Toestemming externe publicatie</dt>
                    <dd>
                      <MetaBadge meta={EXTERNAL_PERMISSION_META} value={opportunity.externalPermission} dot />
                    </dd>
                  </div>
                </dl>
                <p className="text-xs">
                  De klant ‘staat open voor een gezamenlijk verhaal’, maar dat is geen expliciete toestemming. De agent legt dat vast
                  als nog te verifiëren.
                </p>
              </>
            ) : signal ? (
              <Notice tone="warning" icon={TriangleAlert} title="Er is nog geen externe contentkans">
                De externe agent heeft dit signaal niet beoordeeld - bijvoorbeeld omdat de agent is gepauzeerd. Activeer de agent
                onder AI-agents en laat het signaal beoordelen vanuit de{" "}
                <Link href={`/inbox/${signal.id}`} className="font-medium underline underline-offset-4">
                  inbox
                </Link>
                .
              </Notice>
            ) : (
              <p>De agent die het best bij het signaal past beoordeelt het als mogelijk verhaal en controleert of externe publicatie is toegestaan.</p>
            )}
          </Step>

          <Step index={4} state={stepState(3)} title="Interview aangevraagd" actor="Externe agent" agent="external">
            {interview ? (
              <>
                <p>
                  De kans is opgepakt als contentitem en er is een interview aangevraagd bij{" "}
                  <strong className="font-medium text-foreground">{interview.interviewee}</strong>, met voorbereide vragen.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <MetaBadge meta={INTERVIEW_STATUS_META} value={interview.status} dot />
                  <StepLink href={`/interviews/${interview.id}`}>Interview openen</StepLink>
                </div>
              </>
            ) : (
              <>
                <p>
                  De agent start een contentitem (status ‘Onderzoek’), bereidt interviewvragen voor en vraagt de projectleider om een
                  interview. Er wordt niets verstuurd buiten de hub.
                </p>
                {opportunity && (
                  <ActionButton action={demoRequestInterview} pendingLabel="Interview aanvragen…">
                    Kans oppakken en interview aanvragen
                  </ActionButton>
                )}
              </>
            )}
          </Step>

          <Step index={5} state={stepState(4)} title="Interview afgenomen" actor="Externe agent en geïnterviewde" agent="external">
            {interview?.status === "completed" ? (
              <>
                <p>Het interview is afgerond en samengevat in kernpunten, quotes en vervolgacties.</p>
                <StepLink href={`/interviews/${interview.id}`}>Samenvatting bekijken</StepLink>
              </>
            ) : interview ? (
              <>
                <p>
                  Voer het gesprek bij Interviews. Je kunt zelf antwoorden typen, of per vraag ‘Demo-antwoord invullen’
                  gebruiken; het interview bevat voorbereide demo-antwoorden.
                </p>
                <StepLink href={`/interviews/${interview.id}`}>Naar het interview</StepLink>
              </>
            ) : (
              <p>De agent stelt de vragen één voor één in een gesprek, vraagt door waar een antwoord vaag blijft en vat het geheel samen.</p>
            )}
          </Step>

          <Step index={6} state={stepState(5)} title="Concept geschreven" actor="Externe agent" agent="external">
            {article && article.version >= 1 ? (
              <>
                <p>
                  Er staat een concept (versie {article.version}) klaar, opgebouwd uit de bronnen en het interview. De merkcontrole
                  heeft cijfers en quotes getoetst aan het bronmateriaal.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <ContentStatusBadge status={article.status} />
                  <StepLink href={`/editorial/${article.id}`}>Concept openen in de redactie</StepLink>
                </div>
              </>
            ) : (
              <>
                <p>
                  De agent schrijft een eerste concept volgens de merkrichtlijnen. Wat niet in het materiaal staat, wordt een open
                  plek in plaats van een verzonnen feit.
                </p>
                {article && interview?.status === "completed" && (
                  <ActionButton action={demoGenerateDraft} pendingLabel="Concept schrijven…">
                    Laat de externe agent het concept schrijven
                  </ActionButton>
                )}
              </>
            )}
          </Step>

          <Step index={7} state={stepState(6)} title="Review en menselijke goedkeuring" actor="Redactie">
            <p>
              Vanaf hier beslist een mens. Open het concept in de redactie en doorloop deze drie handelingen; de database dwingt ze
              af.
            </p>
            <ul className="space-y-1.5 rounded-lg border bg-background p-4">
              <Check done={submitted}>Indienen ter review: de goedkeuringsregel voor klantcases bepaalt wie er akkoord moet geven.</Check>
              <Check done={approved}>
                Eerst keurt de geïnterviewde de eigen citaten goed (log in als Tim Hoekstra en open Voor mij), daarna de DM of
                Strateeg van het project of de redactie.
              </Check>
              <Check done={permissionGranted}>
                Toestemming voor externe publicatie bevestigen - zonder ‘Toestemming verleend’ blokkeert de database het inplannen.
              </Check>
            </ul>
            {article && (
              <div className="flex flex-wrap items-center gap-3">
                <ContentStatusBadge status={article.status} />
                <MetaBadge meta={EXTERNAL_PERMISSION_META} value={article.externalPermission} dot />
                {article.version >= 1 && <StepLink href={`/editorial/${article.id}`}>Naar de redactie</StepLink>}
              </div>
            )}
          </Step>

          <Step index={8} state={stepState(7)} title="Publicatie ingepland" actor="Redactie" last>
            {article && ["scheduled", "published"].includes(article.status) ? (
              <>
                <p>
                  {article.status === "published"
                    ? "De klantcase is gepubliceerd."
                    : `De klantcase staat ingepland voor ${formatDateTime(article.publishAt)}.`}{" "}
                  Zonder verbonden CMS wordt de publicatie gesimuleerd en zo vastgelegd.
                </p>
                <StepLink href="/calendar">Bekijken op de contentkalender</StepLink>
              </>
            ) : (
              <>
                <p>
                  Plan de goedgekeurde klantcase in vanuit de redactie. Hij verschijnt op de contentkalender en wordt op het
                  geplande moment gepubliceerd.
                </p>
                {approved && article && <StepLink href={`/editorial/${article.id}`}>Inplannen in de redactie</StepLink>}
              </>
            )}
          </Step>
        </ol>
      </Panel>
    </div>
  );
}
