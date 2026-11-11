import type { AgentKind } from "@/lib/types";

/**
 * Tool registry. An agent may only use tools listed in its `allowed_tools`
 * column; the runtime checks this on every call (AgentRuntime.use).
 *
 * Human-gated actions are deliberately NOT tools an agent can be granted:
 * they only exist as user actions behind a permission + approval record.
 */
export type ToolKey =
  | "read_sources"
  | "detect_signals"
  | "enrich_context"
  | "evaluate_story"
  | "create_opportunity"
  | "check_external_permission"
  | "generate_interview_questions"
  | "conduct_interview"
  | "summarize_interview"
  | "generate_content"
  | "validate_brand"
  | "request_approval"
  | "update_calendar"
  | "draft_social_post"
  | "prepare_external_newsletter"
  | "request_internal_info"
  | "draft_slack_announcement"
  | "draft_email"
  | "prepare_internal_newsletter"
  | "schedule_leadership_interviews"
  | "refer_to_external_agent"
  | "answer_info_request";

export type ToolDefinition = {
  key: ToolKey;
  label: string;
  description: string;
  module:
    | "Informatie ophalen"
    | "Signaaldetectie"
    | "Contextverrijking"
    | "Verhaalbeoordeling"
    | "Interviews"
    | "Contentgeneratie"
    | "Merkvalidatie"
    | "Goedkeuring"
    | "Samenwerking"
    | "Planning";
  availableTo: AgentKind[];
};

export const TOOLS: ToolDefinition[] = [
  { key: "read_sources", label: "Bronnen lezen", description: "Geautoriseerde bronberichten van toegestane systemen lezen.", module: "Informatie ophalen", availableTo: ["external", "internal"] },
  { key: "detect_signals", label: "Signalen detecteren", description: "Nieuwswaardige ontwikkelingen herkennen in bronberichten.", module: "Signaaldetectie", availableTo: ["external", "internal"] },
  { key: "enrich_context", label: "Context verrijken", description: "Gerelateerde berichten en signalen uit andere bronnen koppelen.", module: "Contextverrijking", availableTo: ["external", "internal"] },
  { key: "evaluate_story", label: "Verhaal beoordelen", description: "Een signaal beoordelen als mogelijk verhaal en een invalshoek voorstellen.", module: "Verhaalbeoordeling", availableTo: ["external", "internal"] },
  { key: "create_opportunity", label: "Contentkans aanmaken", description: "Een contentkans vastleggen met betrokkenen en voorgesteld format.", module: "Verhaalbeoordeling", availableTo: ["external", "internal"] },
  { key: "check_external_permission", label: "Externe toestemming controleren", description: "Nagaan of externe publicatie is toegestaan en dit vastleggen.", module: "Goedkeuring", availableTo: ["external"] },
  { key: "generate_interview_questions", label: "Interviewvragen opstellen", description: "Vragen voorbereiden op basis van het doel van het interview.", module: "Interviews", availableTo: ["external", "internal"] },
  { key: "conduct_interview", label: "Interview afnemen", description: "Een schriftelijk interview voeren via de website of een privébericht in Slack.", module: "Interviews", availableTo: ["external", "internal"] },
  { key: "summarize_interview", label: "Interview samenvatten", description: "Een gestructureerde samenvatting met kernpunten en quotes maken.", module: "Interviews", availableTo: ["external", "internal"] },
  { key: "generate_content", label: "Concept schrijven", description: "Een concepttekst schrijven op basis van bronnen en interviews.", module: "Contentgeneratie", availableTo: ["external", "internal"] },
  { key: "validate_brand", label: "Merkcontrole uitvoeren", description: "Tekst toetsen aan merkrichtlijnen en herleidbaarheid van feiten.", module: "Merkvalidatie", availableTo: ["external", "internal"] },
  { key: "request_approval", label: "Goedkeuring aanvragen", description: "Een concept ter goedkeuring voorleggen aan de redactie.", module: "Goedkeuring", availableTo: ["external", "internal"] },
  { key: "update_calendar", label: "Kalender bijwerken", description: "Interviews en geplande content op de contentkalender zetten.", module: "Planning", availableTo: ["external", "internal"] },
  { key: "draft_social_post", label: "Social post opstellen", description: "LinkedIn- en social-concepten maken bij een artikel.", module: "Contentgeneratie", availableTo: ["external"] },
  { key: "prepare_external_newsletter", label: "Externe nieuwsbrief voorbereiden", description: "De maandelijkse externe nieuwsbrief samenstellen als concept.", module: "Contentgeneratie", availableTo: ["external"] },
  { key: "request_internal_info", label: "Interne informatie opvragen", description: "Aanvullende informatie vragen aan de interne agent.", module: "Samenwerking", availableTo: ["external"] },
  { key: "draft_slack_announcement", label: "Slack-aankondiging opstellen", description: "Een Slack-bericht voorbereiden als concept.", module: "Contentgeneratie", availableTo: ["internal"] },
  { key: "draft_email", label: "E-mail opstellen", description: "Een e-mailconcept voorbereiden voor menselijke goedkeuring.", module: "Contentgeneratie", availableTo: ["internal"] },
  { key: "prepare_internal_newsletter", label: "Interne nieuwsbrief voorbereiden", description: "De maandelijkse interne nieuwsbrief samenstellen als concept.", module: "Contentgeneratie", availableTo: ["internal"] },
  { key: "schedule_leadership_interviews", label: "Directie-interviews plannen", description: "Twee keer per maand een interview met de directie aanvragen.", module: "Interviews", availableTo: ["internal"] },
  { key: "refer_to_external_agent", label: "Doorverwijzen naar externe agent", description: "Een intern verhaal dat extern interessant is aandragen.", module: "Samenwerking", availableTo: ["internal"] },
  { key: "answer_info_request", label: "Informatieverzoek beantwoorden", description: "Vragen van de externe agent beantwoorden met interne bronnen.", module: "Samenwerking", availableTo: ["internal"] },
];

export const TOOL_MAP: Record<ToolKey, ToolDefinition> = Object.fromEntries(TOOLS.map((t) => [t.key, t])) as Record<
  ToolKey,
  ToolDefinition
>;

/** Actions no agent can ever perform on its own. Shown as locked in the UI. */
export const HUMAN_GATED_ACTIONS: { key: string; label: string; description: string; appliesTo: AgentKind[] }[] = [
  { key: "approve_content", label: "Content goedkeuren", description: "Alleen een mens met het recht ‘Content goedkeuren’ kan een besluit nemen.", appliesTo: ["external", "internal"] },
  { key: "publish_external", label: "Extern publiceren", description: "Publicatie vereist goedkeuring én bevestigde toestemming voor externe publicatie.", appliesTo: ["external"] },
  { key: "post_to_linkedin", label: "Plaatsen op LinkedIn", description: "Social posts worden alleen door een mens geplaatst of ingepland.", appliesTo: ["external"] },
  { key: "send_newsletter", label: "Nieuwsbrief verzenden", description: "Nieuwsbrieven worden nooit automatisch verzonden.", appliesTo: ["external", "internal"] },
  { key: "send_email", label: "E-mail verzenden", description: "E-mails blijven concept tot een mens ze goedkeurt en verstuurt.", appliesTo: ["internal"] },
  { key: "post_to_slack", label: "Plaatsen in Slack", description: "Slack-aankondigingen blijven concept tot een mens ze plaatst.", appliesTo: ["internal"] },
];

export const SOURCE_OPTIONS: { key: string; label: string }[] = [
  { key: "slack", label: "Slack (toegestane kanalen)" },
  { key: "jira", label: "Jira" },
  { key: "teamleader", label: "Teamleader Orbit" },
  { key: "email", label: "E-mail (gedeelde mailbox)" },
  { key: "manual", label: "Handmatig aangeleverd" },
];
