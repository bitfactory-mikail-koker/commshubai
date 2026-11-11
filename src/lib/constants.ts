import type {
  AgentKind,
  ApprovalDecision,
  AuditCategory,
  Classification,
  Confidentiality,
  ContentStatus,
  ContentType,
  ExternalPermission,
  IntegrationProvider,
  IntegrationStatus,
  InterviewKind,
  InterviewStatus,
  NewsletterStatus,
  SignalAudience,
  SignalCategory,
  SignalStatus,
  SocialStatus,
  SourceKind,
  TaskStatus,
  BotMessageKind,
  BotMessageStatus,
  ChannelBureau,
  ChannelConfidentiality,
  EmojiAction,
  ExternalNaming,
  FollowMode,
  OpportunityStatus,
  RhythmKey,
  RuleStep,
} from "@/lib/types";

/** Visual tone used by badges. Kept as a small closed set for consistency. */
export type Tone = "neutral" | "blue" | "amber" | "green" | "red" | "violet" | "teal" | "slate";

export const CONTENT_STATUSES: ContentStatus[] = [
  "new_signal",
  "research",
  "interview_requested",
  "interview_completed",
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "archived",
];

export const CONTENT_STATUS_META: Record<ContentStatus, { label: string; tone: Tone }> = {
  new_signal: { label: "Nieuw signaal", tone: "neutral" },
  research: { label: "Onderzoek", tone: "neutral" },
  interview_requested: { label: "Interview aangevraagd", tone: "neutral" },
  interview_completed: { label: "Interview afgerond", tone: "neutral" },
  draft: { label: "Concept", tone: "neutral" },
  in_review: { label: "In review", tone: "amber" },
  changes_requested: { label: "Wijzigingen gevraagd", tone: "red" },
  approved: { label: "Goedgekeurd", tone: "green" },
  scheduled: { label: "Ingepland", tone: "blue" },
  published: { label: "Gepubliceerd", tone: "green" },
  archived: { label: "Gearchiveerd", tone: "neutral" },
};

export const CONTENT_TYPES: ContentType[] = [
  "news_article",
  "website_article",
  "customer_case",
  "interview",
  "internal_update",
  "employee_introduction",
  "social_post",
  "newsletter",
  "management_update",
];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  news_article: "Nieuwsbericht",
  website_article: "Website-artikel",
  customer_case: "Klantcase",
  interview: "Interview",
  internal_update: "Interne update",
  employee_introduction: "Voorstelronde collega",
  social_post: "Social post",
  newsletter: "Nieuwsbrief",
  management_update: "Directie-update",
};

export const CLASSIFICATION_META: Record<Classification, { label: string; tone: Tone }> = {
  external: { label: "Extern", tone: "neutral" },
  internal: { label: "Intern", tone: "neutral" },
};

export const AGENT_META: Record<AgentKind, { label: string; short: string; tone: Tone }> = {
  external: { label: "Externe Communicatie-agent", short: "Externe agent", tone: "neutral" },
  internal: { label: "Interne Communicatie-agent", short: "Interne agent", tone: "neutral" },
};

export const SIGNAL_CATEGORY_META: Record<SignalCategory, { label: string; tone: Tone }> = {
  customer_case: { label: "Klantcase", tone: "neutral" },
  team_achievement: { label: "Teamprestatie", tone: "neutral" },
  new_employee: { label: "Nieuwe collega", tone: "neutral" },
  management_update: { label: "Directie-update", tone: "neutral" },
  project_milestone: { label: "Projectmijlpaal", tone: "neutral" },
  organizational_update: { label: "Organisatienieuws", tone: "neutral" },
  commercial_update: { label: "Commercieel nieuws", tone: "neutral" },
  other: { label: "Overig", tone: "neutral" },
};

export const SIGNAL_STATUS_META: Record<SignalStatus, { label: string; tone: Tone }> = {
  new: { label: "Nieuw", tone: "blue" },
  needs_info: { label: "Meer info nodig", tone: "amber" },
  in_progress: { label: "In behandeling", tone: "blue" },
  converted: { label: "Omgezet naar content", tone: "green" },
  dismissed: { label: "Afgewezen", tone: "slate" },
  duplicate: { label: "Duplicaat", tone: "slate" },
};

export const AUDIENCE_LABELS: Record<SignalAudience, string> = {
  external: "Extern",
  internal: "Intern",
  both: "Intern en extern",
};

export const CONFIDENTIALITY_META: Record<Confidentiality, { label: string; tone: Tone }> = {
  public_ok: { label: "Openbaar toegestaan", tone: "green" },
  internal_only: { label: "Alleen intern", tone: "amber" },
  needs_permission: { label: "Toestemming nodig", tone: "amber" },
  confidential: { label: "Vertrouwelijk", tone: "red" },
};

export const EXTERNAL_PERMISSION_META: Record<ExternalPermission, { label: string; tone: Tone }> = {
  not_required: { label: "Niet vereist", tone: "slate" },
  unknown: { label: "Nog niet geverifieerd", tone: "amber" },
  requested: { label: "Toestemming aangevraagd", tone: "amber" },
  granted: { label: "Toestemming verleend", tone: "green" },
  denied: { label: "Toestemming geweigerd", tone: "red" },
};

export const SOURCE_META: Record<SourceKind, { label: string }> = {
  slack: { label: "Slack" },
  jira: { label: "Jira" },
  teamleader: { label: "Teamleader Orbit" },
  email: { label: "E-mail" },
  manual: { label: "Handmatig aangeleverd" },
};

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = ["slack", "jira", "teamleader", "email", "cms", "linkedin"];

export const INTEGRATION_STATUS_META: Record<IntegrationStatus, { label: string; tone: Tone }> = {
  not_connected: { label: "Niet verbonden", tone: "slate" },
  demo: { label: "Demo-simulatie", tone: "neutral" },
  connected: { label: "Verbonden", tone: "green" },
  error: { label: "Fout", tone: "red" },
};

export const INTERVIEW_STATUS_META: Record<InterviewStatus, { label: string; tone: Tone }> = {
  draft: { label: "Concept", tone: "neutral" },
  requested: { label: "Aangevraagd", tone: "amber" },
  scheduled: { label: "Ingepland", tone: "teal" },
  in_progress: { label: "Bezig", tone: "blue" },
  awaiting_confirmation: { label: "Wacht op “klopt dit?”", tone: "amber" },
  completed: { label: "Afgerond", tone: "green" },
  cancelled: { label: "Geannuleerd", tone: "slate" },
};

export const INTERVIEW_KIND_LABELS: Record<InterviewKind, string> = {
  customer_case: "Klantcase",
  employee_intro: "Voorstelronde collega",
  management: "Directie-interview",
  expert: "Expertinterview",
  team: "Teamverhaal",
  other: "Overig",
};

export const NEWSLETTER_STATUS_META: Record<NewsletterStatus, { label: string; tone: Tone }> = {
  draft: { label: "Concept", tone: "neutral" },
  in_review: { label: "In review", tone: "amber" },
  changes_requested: { label: "Wijzigingen gevraagd", tone: "red" },
  approved: { label: "Goedgekeurd", tone: "green" },
  scheduled: { label: "Ingepland", tone: "teal" },
  sent: { label: "Verzonden", tone: "green" },
  archived: { label: "Gearchiveerd", tone: "slate" },
};

export const SOCIAL_STATUS_META: Record<SocialStatus, { label: string; tone: Tone }> = {
  draft: { label: "Concept", tone: "neutral" },
  in_review: { label: "In review", tone: "amber" },
  changes_requested: { label: "Wijzigingen gevraagd", tone: "red" },
  approved: { label: "Goedgekeurd", tone: "green" },
  scheduled: { label: "Ingepland", tone: "teal" },
  published: { label: "Gepubliceerd", tone: "green" },
  archived: { label: "Gearchiveerd", tone: "slate" },
};

export const APPROVAL_DECISION_META: Record<ApprovalDecision, { label: string; tone: Tone }> = {
  pending: { label: "Wacht op besluit", tone: "amber" },
  approved: { label: "Goedgekeurd", tone: "green" },
  rejected: { label: "Afgewezen", tone: "red" },
  changes_requested: { label: "Wijzigingen gevraagd", tone: "red" },
  withdrawn: { label: "Ingetrokken", tone: "slate" },
};

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  queued: { label: "In wachtrij", tone: "slate" },
  running: { label: "Bezig", tone: "blue" },
  waiting_approval: { label: "Wacht op goedkeuring", tone: "amber" },
  waiting_input: { label: "Wacht op input", tone: "amber" },
  completed: { label: "Afgerond", tone: "green" },
  failed: { label: "Mislukt", tone: "red" },
  cancelled: { label: "Geannuleerd", tone: "slate" },
};

export const RUN_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  running: { label: "Bezig", tone: "blue" },
  completed: { label: "Afgerond", tone: "green" },
  failed: { label: "Mislukt", tone: "red" },
  waiting_approval: { label: "Wacht op goedkeuring", tone: "amber" },
};

export const AUDIT_CATEGORY_META: Record<AuditCategory, { label: string; tone: Tone }> = {
  discovered: { label: "Ontdekt", tone: "neutral" },
  used: { label: "Gebruikt", tone: "neutral" },
  generated: { label: "Gegenereerd", tone: "neutral" },
  requested: { label: "Aangevraagd", tone: "neutral" },
  performed: { label: "Uitgevoerd", tone: "neutral" },
  approval: { label: "Goedkeuring", tone: "green" },
  handoff: { label: "Overdracht", tone: "neutral" },
  system: { label: "Systeem", tone: "neutral" },
};

export const CHANNEL_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "external_newsletter", label: "Externe nieuwsbrief" },
  { value: "internal_newsletter", label: "Interne nieuwsbrief" },
  { value: "slack", label: "Slack" },
  { value: "email", label: "E-mail" },
  { value: "intranet", label: "Intranet" },
] as const;

export function channelLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return CHANNEL_OPTIONS.find((c) => c.value === value)?.label ?? value;
}

export const CALENDAR_TYPE_META: Record<string, { label: string; tone: Tone }> = {
  article: { label: "Artikel", tone: "neutral" },
  interview: { label: "Interview", tone: "neutral" },
  newsletter: { label: "Nieuwsbrief", tone: "neutral" },
  social_post: { label: "Social post", tone: "neutral" },
  deadline: { label: "Deadline", tone: "neutral" },
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  process_messages: "Bronberichten analyseren",
  evaluate_signal: "Signaal beoordelen",
  request_interview: "Interview aanvragen",
  generate_draft: "Concept schrijven",
  generate_social_posts: "Social posts opstellen",
  prepare_newsletter: "Nieuwsbrief voorbereiden",
  leadership_interview: "Directie-interview plannen",
  sync_integration: "Integratie synchroniseren",
  run_rhythm: "Vast ritme uitvoeren",
  outreach_round: "Inputronde versturen",
  publish_scheduled: "Geplande publicaties verwerken",
  answer_info_request: "Informatieverzoek beantwoorden",
};

// --- Redactie ------------------------------------------------------------------
export const OPPORTUNITY_STATUS_META: Record<OpportunityStatus, { label: string; tone: Tone }> = {
  proposed: { label: "Wacht op de redactie", tone: "amber" },
  accepted: { label: "Opgepakt", tone: "blue" },
  in_progress: { label: "In behandeling", tone: "blue" },
  converted: { label: "Omgezet", tone: "green" },
  declined: { label: "Afgewezen", tone: "slate" },
  snoozed: { label: "Later", tone: "slate" },
};

export const ORIGIN_LABELS: Record<string, string> = {
  emoji: "Aangewezen met emoji",
  listen: "Door de bot opgemerkt",
  tip: "Tip van een collega",
  mail: "Via de mailbox",
  manual: "Opdracht van de redactie",
  rhythm: "Vast ritme",
  interview: "Uit een interview",
  referral: "Doorverwezen door het interne bureau",
};

export const FOLLOW_MODE_OPTIONS: { value: FollowMode; label: string; help: string }[] = [
  { value: "emoji_only", label: "Alleen emoji's", help: "De bot reageert alleen op berichten die een collega aanwijst met een emoji." },
  { value: "listen", label: "Meelezen", help: "De bot leest mee en legt zelf voorstellen voor aan de redactie." },
  { value: "active", label: "Actief ophalen", help: "De bot leest mee en vraagt in het kanaal door als iets nieuwswaardig lijkt." },
];

export const BUREAU_LABELS: Record<ChannelBureau, string> = { internal: "Intern", external: "Extern", both: "Intern en extern" };

export const CHANNEL_CONFIDENTIALITY_LABELS: Record<ChannelConfidentiality, string> = {
  internal_only: "Alleen intern",
  external_after_approval: "Extern mag na akkoord",
};

export const EMOJI_ACTION_OPTIONS: { value: EmojiAction; label: string; help: string }[] = [
  { value: "external_news", label: "Extern nieuws", help: "Voorstel voor een extern artikel." },
  { value: "customer_case", label: "Klantcase", help: "Voorstel voor een klantcase, gekoppeld aan het project." },
  { value: "internal_newsletter", label: "Interne nieuwsbrief", help: "Voorstel voor een stuk in de interne nieuwsbrief." },
  { value: "social_post", label: "Social post", help: "Social post zonder interview; loopt via de redactie." },
  { value: "interview", label: "Interview waard", help: "Voorstel om de schrijver van het bericht te interviewen." },
  { value: "exclude", label: "Niet gebruiken", help: "Het bericht wordt nooit gebruikt en wordt uit de opslag verwijderd." },
];

export const EXTERNAL_NAMING_META: Record<ExternalNaming, { label: string; tone: Tone }> = {
  unknown: { label: "Nog niet bekend", tone: "amber" },
  allowed: { label: "Mag bij naam", tone: "green" },
  anonymous: { label: "Alleen anoniem", tone: "amber" },
  not_allowed: { label: "Alleen intern", tone: "red" },
};

export const RHYTHM_LABELS: Record<RhythmKey, string> = {
  team_round: "Maandelijkse teamronde",
  md_update: "MD-update",
  internal_newsletter: "Interne nieuwsbrief",
  external_newsletter: "Externe nieuwsbrief",
  weekly_overview: "Weekoverzicht voor de redactie",
};

export const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Wekelijks" },
  { value: "biweekly", label: "Tweewekelijks" },
  { value: "monthly", label: "Maandelijks" },
  { value: "rhythm_only", label: "Alleen via een vast ritme" },
] as const;

export const WEEKDAY_LABELS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"] as const;

export const BOT_MESSAGE_KIND_LABELS: Record<BotMessageKind, string> = {
  channel_intro: "Uitleg in kanaal",
  thread_reply: "Reactie in thread",
  interview_invite: "Uitnodiging interview",
  interview_message: "Interviewvraag",
  reminder: "Herinnering",
  approval_request: "Goedkeuringsverzoek",
  weekly_overview: "Weekoverzicht",
  input_request: "Vraag om input",
  mail_reply: "Antwoord per e-mail",
  notice: "Melding",
};

export const BOT_MESSAGE_STATUS_META: Record<BotMessageStatus, { label: string; tone: Tone }> = {
  shadow: { label: "Schaduwmodus", tone: "slate" },
  simulated: { label: "Gesimuleerd", tone: "neutral" },
  sent: { label: "Verzonden", tone: "green" },
  blocked: { label: "Tegengehouden", tone: "amber" },
  failed: { label: "Mislukt", tone: "red" },
  scheduled: { label: "Wacht op werktijd", tone: "blue" },
};

/** Content types an approval rule can be set for, in the order of the proposal. */
export const APPROVAL_RULE_KEYS: { key: string; label: string }[] = [
  { key: "interview", label: "Interview" },
  { key: "customer_case", label: "Klantcase" },
  { key: "news_article", label: "Extern artikel (nieuws)" },
  { key: "website_article", label: "Extern artikel (website)" },
  { key: "social_post", label: "Social post" },
  { key: "internal_update", label: "Stukje voor Slack of intranet" },
  { key: "employee_introduction", label: "Voorstelstuk collega" },
  { key: "management_update", label: "Bericht van de directie" },
  { key: "newsletter_internal", label: "Interne nieuwsbrief" },
  { key: "newsletter_external", label: "Externe nieuwsbrief" },
  { key: "md_update", label: "MD-update" },
];

export const RULE_WHO_LABELS: Record<RuleStep["who"], string> = {
  interviewees: "De geïnterviewden",
  project_roles: "Rollen in het project",
  functional_roles: "Iedereen met een rol",
  persons: "Aangewezen personen",
  editors: "De redactie",
};
