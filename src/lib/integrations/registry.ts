import type { IntegrationProvider } from "@/lib/types";

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
  required?: boolean;
};

export type IntegrationDefinition = {
  provider: IntegrationProvider;
  label: string;
  tagline: string;
  role: "source" | "publication";
  roleLabel: string;
  description: string;
  /** How this MVP can talk to the service. */
  connector: "implemented" | "oauth_required";
  connectorNote: string;
  authLabel: string;
  /** Non-secret settings, stored in integrations.config. */
  configFields: IntegrationField[];
  /** Secrets, stored encrypted in integration_credentials. */
  secretFields: IntegrationField[];
  /** Permissions the connection asks for, shown to the admin. */
  scopes: { scope: string; reason: string }[];
  /** Privacy & policy guarantees the connector implements. */
  safeguards: string[];
  /** Whether a demo simulation feed exists for this provider. */
  hasDemoFeed: boolean;
  docsUrl: string;
};

export const INTEGRATIONS: Record<IntegrationProvider, IntegrationDefinition> = {
  slack: {
    provider: "slack",
    label: "Slack",
    tagline: "Berichten uit toegestane kanalen",
    role: "source",
    roleLabel: "Informatiebron",
    description:
      "Leest berichten uit de openbare kanalen die je hieronder opgeeft en waarvoor de bot is uitgenodigd. Daaruit detecteert de Intelligence Engine signalen.",
    connector: "implemented",
    connectorNote:
      "Connector gebouwd op de officiële Slack Web API (auth.test, conversations.info, conversations.history). In deze omgeving nog niet getest tegen een echte workspace.",
    authLabel: "Bot-token van een Slack-app",
    configFields: [
      {
        key: "channels",
        label: "Kanaal-ID's",
        type: "text",
        placeholder: "C0123ABCD, C0456EFGH",
        help: "Kommagescheiden. Alleen deze kanalen worden gelezen.",
        required: true,
      },
    ],
    secretFields: [
      { key: "bot_token", label: "Bot User OAuth Token", type: "password", placeholder: "xoxb-…", required: true },
    ],
    scopes: [
      { scope: "channels:history", reason: "Berichten lezen in openbare kanalen waar de bot lid van is" },
      { scope: "channels:read", reason: "Kanaalnaam en type (openbaar/privé) controleren" },
      { scope: "users:read", reason: "Naam van de afzender tonen als bron" },
    ],
    safeguards: [
      "Privékanalen en directe berichten worden nooit gelezen, ook niet als de bot er toegang toe heeft.",
      "Alleen kanalen op de toegestane lijst worden gesynchroniseerd.",
      "Berichten van bots en systeemmeldingen worden overgeslagen.",
    ],
    hasDemoFeed: true,
    docsUrl: "https://api.slack.com/apps",
  },
  jira: {
    provider: "jira",
    label: "Jira",
    tagline: "Afgeronde epics en mijlpalen",
    role: "source",
    roleLabel: "Informatiebron",
    description:
      "Leest recent afgeronde issues uit de projecten die je opgeeft, zodat projectmijlpalen als signaal kunnen worden herkend.",
    connector: "implemented",
    connectorNote:
      "Connector gebouwd op de officiële Jira Cloud REST API v3 (myself, search/jql). In deze omgeving nog niet getest tegen een echte Jira-site.",
    authLabel: "E-mailadres + API-token",
    configFields: [
      { key: "base_url", label: "Jira-URL", type: "url", placeholder: "https://jouwbedrijf.atlassian.net", required: true },
      { key: "email", label: "E-mailadres van het account", type: "text", placeholder: "integraties@jouwbedrijf.nl", required: true },
      { key: "project_keys", label: "Projectsleutels", type: "text", placeholder: "WEB, APP", help: "Kommagescheiden. Alleen deze projecten worden gelezen.", required: true },
    ],
    secretFields: [{ key: "api_token", label: "API-token", type: "password", placeholder: "Atlassian API-token", required: true }],
    scopes: [
      { scope: "read:jira-work", reason: "Issues, status en samenvatting lezen in de opgegeven projecten" },
      { scope: "read:jira-user", reason: "Naam van de uitvoerder tonen als bron" },
    ],
    safeguards: [
      "Alleen projecten op de toegestane lijst worden gelezen.",
      "Alleen afgeronde epics, stories en taken van de laatste 14 dagen worden opgehaald.",
      "Er wordt niets in Jira gewijzigd; de koppeling is alleen-lezen.",
    ],
    hasDemoFeed: true,
    docsUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
  },
  teamleader: {
    provider: "teamleader",
    label: "Teamleader Orbit",
    tagline: "Gewonnen deals en klantontwikkelingen",
    role: "source",
    roleLabel: "Informatiebron",
    description:
      "Bedoeld om gewonnen deals, verlengingen en nieuwe klanten te signaleren voor commercieel nieuws en klantcases.",
    connector: "oauth_required",
    connectorNote:
      "Teamleader werkt uitsluitend met OAuth 2.0 via een geregistreerde Marketplace-integratie. Die autorisatiestroom is in deze MVP nog niet gebouwd; je kunt de gegevens alvast vastleggen en de demo-simulatie gebruiken.",
    authLabel: "OAuth 2.0 (client-ID en client-secret)",
    configFields: [{ key: "client_id", label: "Client-ID", type: "text", placeholder: "Client-ID van de integratie" }],
    secretFields: [{ key: "client_secret", label: "Client-secret", type: "password", placeholder: "Client-secret" }],
    scopes: [
      { scope: "deals", reason: "Gewonnen deals en fases lezen" },
      { scope: "companies", reason: "Klantnaam bij een deal tonen" },
    ],
    safeguards: [
      "Financiële bedragen worden niet overgenomen in signalen.",
      "De koppeling wordt alleen-lezen opgezet.",
    ],
    hasDemoFeed: true,
    docsUrl: "https://developer.focus.teamleader.eu/",
  },
  email: {
    provider: "email",
    label: "E-mail (Gmail / Outlook)",
    tagline: "Gedeelde mailbox voor nieuws en tips",
    role: "source",
    roleLabel: "Informatiebron en concepten",
    description:
      "Bedoeld om berichten uit één gedeelde mailbox (bijvoorbeeld nieuws@…) te lezen en e-mailconcepten klaar te zetten. Persoonlijke mailboxen worden niet gekoppeld.",
    connector: "oauth_required",
    connectorNote:
      "Gmail en Microsoft 365 vereisen OAuth 2.0 met een door Google of Microsoft goedgekeurde app. Die autorisatiestroom is in deze MVP nog niet gebouwd; je kunt de gegevens alvast vastleggen en de demo-simulatie gebruiken.",
    authLabel: "OAuth 2.0 (Google Workspace of Microsoft 365)",
    configFields: [
      { key: "mail_provider", label: "Provider", type: "text", placeholder: "gmail of outlook" },
      { key: "mailbox", label: "Gedeelde mailbox", type: "text", placeholder: "nieuws@jouwbedrijf.nl" },
    ],
    secretFields: [{ key: "client_secret", label: "Client-secret", type: "password", placeholder: "Client-secret van de OAuth-app" }],
    scopes: [
      { scope: "gmail.readonly / Mail.Read", reason: "Berichten in de gedeelde mailbox lezen" },
      { scope: "gmail.compose / Mail.ReadWrite", reason: "Concepten klaarzetten (verzenden doet altijd een mens)" },
    ],
    safeguards: [
      "Alleen de opgegeven gedeelde mailbox wordt gelezen, nooit persoonlijke mailboxen.",
      "De agent zet concepten klaar en verstuurt zelf nooit e-mail.",
    ],
    hasDemoFeed: true,
    docsUrl: "https://developers.google.com/gmail/api",
  },
  cms: {
    provider: "cms",
    label: "Website CMS",
    tagline: "Goedgekeurde artikelen doorzetten naar de website",
    role: "publication",
    roleLabel: "Publicatiekanaal",
    description:
      "Stuurt goedgekeurde, externe artikelen als ondertekende webhook naar je CMS of een tussenlaag (bijvoorbeeld een serverless functie die een concept aanmaakt in WordPress of Storyblok).",
    connector: "implemented",
    connectorNote:
      "Generieke webhook-connector (HTTPS POST met HMAC-SHA256-handtekening). Werkt met elk CMS dat een webhook kan ontvangen. Zonder verbinding wordt publicatie gesimuleerd en als zodanig gemarkeerd.",
    authLabel: "Webhook-URL + ondertekeningsgeheim",
    configFields: [
      { key: "webhook_url", label: "Webhook-URL", type: "url", placeholder: "https://www.jouwbedrijf.nl/api/commshub", required: true },
    ],
    secretFields: [
      { key: "signing_secret", label: "Ondertekeningsgeheim", type: "password", placeholder: "Minimaal 16 tekens", required: true },
    ],
    scopes: [{ scope: "POST naar de webhook", reason: "Titel, tekst en metadata van goedgekeurde artikelen versturen" }],
    safeguards: [
      "Er wordt alleen iets verstuurd nadat een mens het artikel heeft goedgekeurd én op publiceren heeft geklikt of het heeft ingepland.",
      "Elke aanvraag is ondertekend (X-CommsHub-Signature), zodat het CMS de herkomst kan controleren.",
      "Interne content wordt nooit naar het CMS gestuurd.",
    ],
    hasDemoFeed: false,
    docsUrl: "",
  },
  linkedin: {
    provider: "linkedin",
    label: "LinkedIn",
    tagline: "Social posts op de bedrijfspagina",
    role: "publication",
    roleLabel: "Publicatiekanaal",
    description:
      "Bedoeld om goedgekeurde social posts op de bedrijfspagina te plaatsen. Tot de koppeling er is, kopieer je de goedgekeurde tekst en plaats je die handmatig.",
    connector: "oauth_required",
    connectorNote:
      "Plaatsen namens een bedrijfspagina vereist OAuth 2.0 en toegang tot de Community Management API, die LinkedIn per app moet goedkeuren. Dit is in deze MVP nog niet gebouwd; publicatie van social posts wordt gesimuleerd en als zodanig gemarkeerd.",
    authLabel: "OAuth 2.0 (LinkedIn-app met Community Management API)",
    configFields: [{ key: "organization_urn", label: "Bedrijfspagina (URN)", type: "text", placeholder: "urn:li:organization:123456" }],
    secretFields: [{ key: "client_secret", label: "Client-secret", type: "password", placeholder: "Client-secret van de LinkedIn-app" }],
    scopes: [{ scope: "w_organization_social", reason: "Posts plaatsen namens de bedrijfspagina" }],
    safeguards: ["Er wordt niets geplaatst zonder goedkeuring en een expliciete actie van een mens."],
    hasDemoFeed: false,
    docsUrl: "https://learn.microsoft.com/linkedin/marketing/",
  },
};

export function integrationDefinition(provider: string): IntegrationDefinition | null {
  return (INTEGRATIONS as Record<string, IntegrationDefinition>)[provider] ?? null;
}
