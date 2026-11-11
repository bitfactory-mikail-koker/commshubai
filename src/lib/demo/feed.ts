import type { SourceKind } from "@/lib/types";

/**
 * Demo simulation feed: realistic messages that a connected system could
 * deliver. Used by "Demo-synchronisatie" on the integration pages and by the
 * guided demo scenario. Everything inserted from here is flagged is_demo.
 */
export type DemoMessage = {
  externalId: string;
  source: SourceKind;
  channel: string | null;
  authorName: string;
  title: string | null;
  body: string;
  metadata: Record<string, unknown>;
};

export const DEMO_FEED: DemoMessage[] = [
  {
    externalId: "demo-feed-slack-1",
    source: "slack",
    channel: "#team-development",
    authorName: "Ruben Visser",
    title: null,
    body: "Trots op het team: we hebben de ISO 27001-audit zonder afwijkingen gehaald! De auditor noemde ons incidentproces een voorbeeld voor andere bureaus. Dank aan iedereen die de afgelopen 6 maanden heeft meegeholpen met de documentatie.",
    metadata: { people: ["Ruben Visser"] },
  },
  {
    externalId: "demo-feed-slack-2",
    source: "slack",
    channel: "#algemeen",
    authorName: "Sanne de Vries",
    title: null,
    body: "Even een heads-up: donderdag is de koffiemachine op de tweede verdieping buiten gebruik vanwege onderhoud. Op de begane grond kun je gewoon terecht.",
    metadata: {},
  },
  {
    externalId: "demo-feed-slack-3",
    source: "slack",
    channel: "#project-noorderzon",
    authorName: "Tim Hoekstra",
    title: null,
    body: "De nieuwe ticketshop van Festival Noorderzon B.V. is opgeleverd en staat live. Tijdens de voorverkoop zijn er in het eerste uur 4.300 tickets verkocht zonder storing. De klant is erg tevreden over de samenwerking.",
    metadata: { customer: "Festival Noorderzon B.V.", project: "Ticketshop", people: ["Tim Hoekstra"] },
  },
  {
    externalId: "demo-feed-jira-1",
    source: "jira",
    channel: "KET",
    authorName: "Joost Meijer",
    title: "KET-88: Webshop De Koperen Ketel - fase 2 (afgerond)",
    body: "Epic afgerond in project Brouwerij De Koperen Ketel. Abonnementenmodule en koppeling met het voorraadsysteem zijn live gegaan. Alle 23 stories zijn afgerond binnen de geplande 4 sprints.",
    metadata: { customer: "Brouwerij De Koperen Ketel", project: "Webshop fase 2", people: ["Joost Meijer"] },
  },
  {
    externalId: "demo-feed-jira-2",
    source: "jira",
    channel: "INT",
    authorName: "Ruben Visser",
    title: "INT-41: Migratie buildstraat (afgerond)",
    body: "Task afgerond in project Intern. De buildstraat is gemigreerd; de gemiddelde buildtijd is gedaald van 14 naar 6 minuten.",
    metadata: { project: "Buildstraat", people: ["Ruben Visser"] },
  },
  {
    externalId: "demo-feed-teamleader-1",
    source: "teamleader",
    channel: "Deals",
    authorName: "Femke Mulder",
    title: "Deal gewonnen: Rijnmond Logistiek - onderhoudscontract",
    body: "Deal gewonnen: Rijnmond Logistiek verlengt de samenwerking met een onderhoudscontract van 3 jaar voor het planningsplatform. Contract is getekend op het hoofdkantoor in Rotterdam.",
    metadata: { customer: "Rijnmond Logistiek", project: "Planningsplatform", people: ["Femke Mulder"] },
  },
  {
    externalId: "demo-feed-teamleader-2",
    source: "teamleader",
    channel: "Deals",
    authorName: "Femke Mulder",
    title: "Nieuwe klant: Gemeente Waterhoven",
    body: "Aanbesteding gewonnen: Gemeente Waterhoven kiest ons voor de vernieuwing van het digitale loket. Start van het project staat gepland in januari. Communicatie pas na de formele gunning op 12 december.",
    metadata: { customer: "Gemeente Waterhoven", project: "Digitaal loket", people: ["Femke Mulder"] },
  },
  {
    externalId: "demo-feed-email-1",
    source: "email",
    channel: "nieuws@noordlicht.example",
    authorName: "Marieke van Dijk",
    title: "Nieuwe collega per 1 december",
    body: "Goed nieuws: per 1 december komt Yara El Amrani ons team versterken als UX-designer. Yara werkte hiervoor zes jaar bij een zorgverzekeraar en heeft veel ervaring met toegankelijkheid. Haar eerste werkdag is op maandag; ze start in het designteam.",
    metadata: { people: ["Yara El Amrani", "Marieke van Dijk"] },
  },
  {
    externalId: "demo-feed-email-2",
    source: "email",
    channel: "nieuws@noordlicht.example",
    authorName: "Marieke van Dijk",
    title: "Vertrouwelijk: voorgenomen overname",
    body: "Vertrouwelijk, nog niet delen: de directie voert verkennende gesprekken over de overname van een klein designbureau in Zwolle. Zodra er meer duidelijk is, informeren we het MT.",
    metadata: { people: ["Marieke van Dijk"] },
  },
];

/** The message that kicks off the guided demo scenario. */
export const SCENARIO_MESSAGE: DemoMessage = {
  externalId: "demo-scenario-veldhuis",
  source: "slack",
  channel: "#project-veldhuis",
  authorName: "Tim Hoekstra",
  title: null,
  body: "Mooi nieuws: het cliëntenportaal ‘Mijn Veldhuis’ van Veldhuis Zorggroep is vanochtend live gegaan! In de eerste week van de pilot logden 1.240 cliënten in en het aantal telefoontjes naar de planning daalde met 18%. Anouk Peters, manager zorgvernieuwing bij Veldhuis, is erg enthousiast en staat open voor een gezamenlijk verhaal. Top gedaan team!",
  metadata: { customer: "Veldhuis Zorggroep", project: "Cliëntenportaal Mijn Veldhuis", people: ["Tim Hoekstra"] },
};

/** Scripted answers for the scenario interview, in question order. */
export const SCENARIO_ANSWERS: string[] = [
  "Veldhuis Zorggroep kreeg steeds meer telefoontjes van cliënten en mantelzorgers over afspraken en zorgplannen. De planners kwamen daardoor nauwelijks aan hun eigenlijke werk toe. Ze zochten één plek waar cliënten zelf hun afspraken en zorgplan kunnen inzien.",
  "We zijn begonnen met een pilot op twee locaties en hebben het portaal samen met cliënten en wijkverpleegkundigen getest. Elke twee weken leverden we een werkende versie op. Toegankelijkheid stond voorop: het portaal voldoet aan WCAG 2.2 AA.",
  "De samenwerking was heel open. Het team van Veldhuis zat elke sprint bij de demo en gaf direct terugkoppeling. Doordat de wijkverpleegkundigen vanaf dag één meedachten, sluit het portaal echt aan op de praktijk.",
  "In de eerste week van de pilot logden 1.240 cliënten in. Het aantal telefoontjes naar de planning daalde in die week met 18%. Voor harde conclusies over de lange termijn is het nog te vroeg.",
  "Ik ben er het meest trots op dat een mevrouw van 84 tijdens de test zonder hulp haar afspraak kon verzetten. Daar doen we het voor.",
  "In het eerste kwartaal van volgend jaar sluiten de overige locaties aan. Daarna voegen we berichtenverkeer met het zorgteam toe.",
  "Ja, Anouk Peters heeft per mail akkoord gegeven voor publicatie, op voorwaarde dat zij de tekst vooraf mag lezen. Zij is het aanspreekpunt bij Veldhuis.",
];
