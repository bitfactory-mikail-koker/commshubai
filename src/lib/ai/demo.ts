import type {
  AIProvider,
  ContentRequest,
  GeneratedContent,
  InterviewBrief,
  InterviewTurn,
  MdUpdateDraft,
  NewsletterFraming,
  Revision,
  TipTriage,
  SignalAnalysis,
  SourceMaterial,
  StoryEvaluation,
} from "@/lib/ai/types";
import type {
  Confidentiality,
  ContentType,
  InterviewQuestion,
  InterviewSummary,
  SignalAudience,
  SignalCategory,
} from "@/lib/types";

/**
 * Demo provider: deterministic, rule-based stand-in for the Claude API so the
 * product can be demonstrated without credentials.
 *
 * It never generates facts: analysis is keyword-based, and drafts are
 * assembled only from the supplied source material and interview answers.
 * Anything missing becomes an explicit "[AANVULLEN: …]" placeholder.
 * The UI labels everything produced here as demo output.
 */

// --- text helpers -----------------------------------------------------------
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý„"'(\d])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Shortens text at a word boundary. */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, "")}…`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const capitalize = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const hasNumber = (t: string) => /\d/.test(t);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function sourceLabel(s: SourceMaterial): string {
  const system = { slack: "Slack", jira: "Jira", teamleader: "Teamleader", email: "E-mail", manual: "Handmatig" }[s.source];
  return s.channel ? `${system} ${s.channel}` : system;
}

// --- signal detection -------------------------------------------------------
const CATEGORY_RULES: { category: SignalCategory; base: number; patterns: RegExp[] }[] = [
  {
    category: "new_employee",
    base: 62,
    patterns: [
      /nieuwe collega/i,
      /eerste werkdag/i,
      /komt (?:ons|het) team versterken/i,
      /welkom (?:aan|bij|in)/i,
      /start(?:en|te|)? (?:per|op|vandaag|maandag|volgende week|als)/i,
      /in dienst/i,
    ],
  },
  {
    category: "customer_case",
    base: 60,
    patterns: [
      /live ?gegaan|livegang|go-?live/i,
      /opgeleverd|oplevering/i,
      /(?:tevreden|blij|enthousiast|compliment)/i,
      /\bcase\b/i,
      /resulta(?:at|ten)/i,
      /\d+ ?(?:%|procent)/i,
    ],
  },
  {
    category: "commercial_update",
    base: 58,
    patterns: [
      /deal gewonnen|opdracht binnen|nieuwe klant|aanbesteding gewonnen/i,
      /contract (?:is )?(?:getekend|verlengd)/i,
      /offerte (?:is )?(?:geaccepteerd|akkoord)/i,
      /verlengt? de samenwerking/i,
    ],
  },
  {
    category: "management_update",
    base: 55,
    patterns: [/directie/i, /\bMT\b|managementteam/i, /strategie|koers|jaarplan/i, /kwartaalcijfers|kwartaalupdate/i, /overname|reorganisatie/i],
  },
  {
    category: "team_achievement",
    base: 55,
    patterns: [/gehaald|behaald/i, /gewonnen|award|prijs/i, /certificering|gecertificeerd/i, /record|mijlpaal/i, /trots|knap werk|top gedaan/i],
  },
  {
    category: "project_milestone",
    base: 48,
    patterns: [/sprint/i, /release/i, /\bepic\b/i, /\bmvp\b/i, /afgerond|done/i],
  },
  {
    category: "organizational_update",
    base: 45,
    patterns: [/kantoor|verhuiz/i, /werkwijze|beleid/i, /thuiswerk/i, /teamdag|bedrijfsuitje|jubileum/i, /vacature/i],
  },
];

const ORG_NAME_PATTERN =
  /((?:[A-Z][\w&'’.-]+\s){0,3}(?:Zorggroep|Groep|Logistiek|Holding|B\.?V\.?)|Stichting(?:\s[A-Z][\w-]+){1,3}|Gemeente\s[A-Z][\w-]+|Brouwerij(?:\s(?:[Dd]e|[Hh]et))?(?:\s[A-Z][\w-]+){1,2})/;

function metaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function analyze(
  message: SourceMaterial,
  knownPeople: string[],
): SignalAnalysis {
  const text = `${message.title ?? ""} ${message.body}`.trim();
  const matches = CATEGORY_RULES.map((rule) => ({
    rule,
    hits: rule.patterns.filter((p) => p.test(text)).length,
  }))
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits * 10 + b.rule.base - (a.hits * 10 + a.rule.base));

  const customer = metaString(message.metadata, "customer") ?? text.match(ORG_NAME_PATTERN)?.[1]?.trim() ?? null;
  const project = metaString(message.metadata, "project");
  const metaPeople = Array.isArray(message.metadata?.people)
    ? (message.metadata.people as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  const people = Array.from(
    new Set([
      ...metaPeople,
      ...knownPeople.filter((name) => text.includes(name) || new RegExp(`\\b${firstName(name)}\\b`).test(text)),
    ]),
  );

  const best = matches[0];
  if (!best) {
    return {
      newsworthy: false,
      title: truncate(message.title ?? sentences(text)[0] ?? "Bericht", 80),
      summary: truncate(text, 240),
      category: "other",
      audience: "internal",
      suggestedAgent: "internal",
      relevanceScore: 12,
      scoreRationale: "Geen aanwijzingen voor een nieuwswaardige ontwikkeling gevonden (demo-analyse op trefwoorden).",
      missingInformation: [],
      suggestedAction: "Geen actie nodig.",
      entities: { customer, project, people },
      confidentiality: "internal_only",
    };
  }

  let category = best.rule.category;
  // A milestone or achievement for a named customer is a potential customer case.
  if ((category === "project_milestone" || category === "team_achievement") && customer && /live|opgeleverd|tevreden|resulta/i.test(text)) {
    category = "customer_case";
  }

  let score = best.rule.base + Math.min(18, (best.hits - 1) * 6);
  const reasons: string[] = [`${best.hits} kenmerk(en) van "${category}" herkend`];
  if (customer) {
    score += 8;
    reasons.push("klantnaam genoemd");
  }
  if (hasNumber(message.body)) {
    score += 6;
    reasons.push("concrete cijfers of data aanwezig");
  }
  if (message.body.length > 220) {
    score += 4;
    reasons.push("bericht bevat voldoende context");
  }
  if (message.body.length < 70) {
    score -= 20;
    reasons.push("bericht is erg kort");
  }
  if (message.source === "teamleader" || message.source === "jira") score += 3;
  score = clamp(score);

  const sensitive = /vertrouwelijk|niet delen|embargo|intern houden|salaris|ontslag|ziekmelding/i.test(text);
  const publicOk = /mag gedeeld|persbericht|openbaar|akkoord met publicatie|toestemming gegeven/i.test(text);
  const confidentiality: Confidentiality = sensitive
    ? "confidential"
    : publicOk
      ? "public_ok"
      : customer || category === "new_employee"
        ? "needs_permission"
        : "internal_only";

  const audience: SignalAudience =
    category === "customer_case"
      ? "external"
      : category === "commercial_update"
        ? "both"
        : category === "new_employee"
          ? "both"
          : (category === "team_achievement" || category === "project_milestone") && customer
            ? "both"
            : "internal";
  const suggestedAgent = category === "customer_case" || category === "commercial_update" ? "external" : "internal";

  const missing: string[] = [];
  if (customer && !publicOk) missing.push("Toestemming van de klant voor externe publicatie");
  if (["customer_case", "team_achievement", "project_milestone"].includes(category) && !/\d+ ?(?:%|procent|uur|dagen|weken|gebruikers|klanten)/i.test(text)) {
    missing.push("Concrete resultaten of cijfers");
  }
  if (!/[„“"][^„“"]{15,}[”"]/.test(message.body)) missing.push("Quote van een betrokkene");
  if (people.length === 0) missing.push("Contactpersoon of betrokken collega");
  if (category === "new_employee") missing.push("Korte persoonlijke introductie en foto");

  const first = sentences(message.body)[0] ?? message.body;
  const title =
    message.title?.trim() ||
    (category === "customer_case" && customer
      ? `${customer}: ${truncate(project ?? first, 60)}`
      : truncate(first, 80));

  const suggestedAction: Record<SignalCategory, string> = {
    customer_case: "Laat de externe agent de klantcase beoordelen en een interview aanvragen bij de projectleider.",
    commercial_update: "Controleer of het nieuws gedeeld mag worden en bereid een nieuwsbericht voor.",
    new_employee: "Plan een voorstelronde-interview met de nieuwe collega.",
    management_update: "Verwerk dit in de eerstvolgende directie-update.",
    team_achievement: "Maak een interne update en beoordeel of het verhaal ook extern interessant is.",
    project_milestone: "Volg het project; verzamel resultaten voor een interne update.",
    organizational_update: "Neem dit mee in de interne nieuwsbrief.",
    other: "Geen actie nodig.",
  };

  return {
    newsworthy: score >= 35,
    title,
    summary: truncate(sentences(message.body).slice(0, 2).join(" "), 300),
    category,
    audience,
    suggestedAgent,
    relevanceScore: score,
    scoreRationale: `${capitalize(reasons.join(", "))}. (Demo-analyse op basis van trefwoorden.)`,
    missingInformation: missing,
    suggestedAction: suggestedAction[category],
    entities: { customer, project, people },
    confidentiality,
  };
}

// --- interviews -------------------------------------------------------------
function questionTemplates(interview: InterviewBrief): { topic: string; text: string }[] {
  const customer = interview.customer ?? "de klant";
  const project = interview.project ?? "dit project";
  switch (interview.kind) {
    case "customer_case":
      return [
        { topic: "aanleiding", text: `Wat was de aanleiding voor ${project} en welke uitdaging lag er bij ${customer}?` },
        { topic: "aanpak", text: "Hoe hebben jullie het aangepakt en welke keuzes waren daarin bepalend?" },
        { topic: "samenwerking", text: `Hoe verliep de samenwerking met ${customer}? Wat maakte het verschil?` },
        { topic: "resultaat", text: "Welke concrete resultaten zijn er bereikt? Noem waar mogelijk cijfers die we mogen delen." },
        { topic: "trots", text: "Waar ben je persoonlijk het meest trots op?" },
        { topic: "vooruitblik", text: "Wat is de volgende stap voor dit project?" },
        { topic: "toestemming", text: `Is ${customer} akkoord met externe publicatie, en wie is daarvoor het aanspreekpunt?` },
      ];
    case "employee_intro":
      return [
        { topic: "achtergrond", text: "Kun je jezelf kort voorstellen? Waar kom je vandaan en wat heb je hiervoor gedaan?" },
        { topic: "rol", text: "Wat ga je bij ons doen en waar kunnen collega's je voor benaderen?" },
        { topic: "motivatie", text: "Waarom heb je voor ons gekozen?" },
        { topic: "eerste indruk", text: "Wat is je eerste indruk na je eerste dagen?" },
        { topic: "buiten werk", text: "Wat doe je graag als je niet aan het werk bent?" },
      ];
    case "management":
      return [
        { topic: "terugblik", text: "Wat waren de belangrijkste ontwikkelingen van de afgelopen twee weken?" },
        { topic: "prioriteiten", text: "Waar ligt de komende periode de prioriteit en waarom?" },
        { topic: "resultaten", text: "Welke resultaten of cijfers wil je met alle collega's delen?" },
        { topic: "mensen", text: "Welke collega's of teams verdienen een compliment?" },
        { topic: "boodschap", text: "Welke boodschap wil je iedereen meegeven?" },
      ];
    case "expert":
      return [
        { topic: "onderwerp", text: "Welke ontwikkeling in je vakgebied houdt je op dit moment het meest bezig?" },
        { topic: "praktijk", text: "Hoe zie je dat terug in het werk voor onze klanten?" },
        { topic: "advies", text: "Welk advies geef je organisaties die hiermee aan de slag willen?" },
        { topic: "vooruitblik", text: "Wat verwacht je voor het komende jaar?" },
      ];
    default:
      return [
        { topic: "aanleiding", text: "Wat is er gebeurd en waarom is dit belangrijk?" },
        { topic: "aanpak", text: "Hoe is dit tot stand gekomen en wie waren erbij betrokken?" },
        { topic: "resultaat", text: "Wat is het resultaat tot nu toe?" },
        { topic: "vooruitblik", text: "Wat is de volgende stap?" },
      ];
  }
}

const TOPIC_HEADINGS: Record<string, string> = {
  aanleiding: "De aanleiding",
  aanpak: "De aanpak",
  samenwerking: "De samenwerking",
  resultaat: "Het resultaat",
  resultaten: "Resultaten",
  trots: "Waar we trots op zijn",
  vooruitblik: "Vooruitblik",
  achtergrond: "Achtergrond",
  rol: "De nieuwe rol",
  motivatie: "De keuze voor ons",
  "eerste indruk": "Eerste indruk",
  "buiten werk": "Buiten het werk",
  terugblik: "Terugblik",
  prioriteiten: "Prioriteiten",
  mensen: "Complimenten",
  boodschap: "Tot slot",
  onderwerp: "Wat er speelt",
  praktijk: "In de praktijk",
  advies: "Advies",
};

const ATTRIBUTIONS = ["zegt", "licht", "vult", "aldus"];

function quoteParagraph(answer: string, name: string, role: string | null, index: number): string {
  const parts = sentences(answer);
  const first = (parts[0] ?? answer).replace(/[.]$/, "");
  const rest = parts.slice(1).join(" ");
  const fn = firstName(name);
  let attribution: string;
  if (index === 0) attribution = `vertelt ${name}${role ? `, ${role}` : ""}`;
  else {
    const verb = ATTRIBUTIONS[index % ATTRIBUTIONS.length];
    attribution = verb === "licht" ? `licht ${fn} toe` : verb === "vult" ? `vult ${fn} aan` : verb === "aldus" ? `aldus ${fn}` : `zegt ${fn}`;
  }
  return rest
    ? `<p>„${esc(first)}”, ${attribution}. „${esc(rest)}”</p>`
    : `<p>„${esc(first)}”, ${attribution}.</p>`;
}

function applyTerminology(text: string, terms: { term: string; instead_of: string }[]): string {
  let out = text;
  for (const rule of terms) {
    if (!rule.instead_of.trim()) continue;
    const pattern = new RegExp(`\\b${rule.instead_of.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(pattern, rule.term);
  }
  return out;
}

function factList(sources: SourceMaterial[], max = 5): { text: string; label: string }[] {
  const seen = new Set<string>();
  const facts: { text: string; label: string }[] = [];
  for (const s of sources) {
    for (const sentence of sentences(s.body)) {
      if (facts.length >= max) return facts;
      const informative = hasNumber(sentence) || /live|opgeleverd|gestart|behaald|gewonnen|verlengd|afgerond|start/i.test(sentence);
      const key = sentence.toLowerCase().slice(0, 60);
      if (!informative || seen.has(key) || sentence.length < 25) continue;
      seen.add(key);
      facts.push({ text: truncate(sentence, 220), label: sourceLabel(s) });
    }
  }
  return facts;
}

function buildContent(input: ContentRequest): GeneratedContent {
  const { brief, brand, interview, sources, channel, contentType } = input;
  const open: string[] = [];
  const lead = applyTerminology(brief.angle || brief.title, brand.terminology);
  const facts = factList(sources);
  const qa = (interview?.qa ?? []).filter((q) => q.answer.trim().length > 0);
  const bodyQa = qa.filter((q) => q.topic !== "toestemming");
  const permissionQa = qa.find((q) => q.topic === "toestemming");

  if (input.classification === "external" && brief.customer) {
    if (!permissionQa || !/\b(ja|akkoord|toestemming)\b/i.test(permissionQa.answer)) {
      open.push(`Toestemming van ${brief.customer} voor externe publicatie is nog niet bevestigd.`);
    }
  }
  if (!qa.some((q) => hasNumber(q.answer)) && facts.every((f) => !/\d+ ?(%|procent)/.test(f.text))) {
    open.push("Er zijn geen concrete resultaten of cijfers gevonden in het bronmateriaal.");
  }
  if (qa.length === 0) open.push("Er is nog geen interview afgenomen; quotes ontbreken.");

  const tags = Array.from(
    new Set(
      [
        { customer_case: "klantcase", news_article: "nieuws", website_article: "artikel", interview: "interview", internal_update: "intern", employee_introduction: "nieuwe collega", management_update: "directie", social_post: "social", newsletter: "nieuwsbrief" }[contentType],
        brief.customer?.toLowerCase(),
        brief.project?.toLowerCase(),
      ].filter((t): t is string => Boolean(t)),
    ),
  ).slice(0, 5);

  const factsHtml = facts.length
    ? `<ul>${facts.map((f) => `<li>${esc(applyTerminology(f.text, brand.terminology))} <em>(${esc(f.label)})</em></li>`).join("")}</ul>`
    : "";

  let body: string;

  if (channel === "slack") {
    // Short announcement: no headings.
    const lines = [`<p><strong>${esc(brief.title)}</strong></p>`, `<p>${esc(lead)}</p>`];
    if (facts.length) lines.push(`<ul>${facts.slice(0, 3).map((f) => `<li>${esc(f.text)}</li>`).join("")}</ul>`);
    if (bodyQa[0] && interview) lines.push(quoteParagraph(bodyQa[0].answer, interview.intervieweeName, interview.intervieweeRole, 0));
    lines.push("<p>Vragen of aanvullingen? Laat het weten in deze thread.</p>");
    body = lines.join("");
  } else if (channel === "email") {
    const lines = [`<p>Beste collega's,</p>`, `<p>${esc(lead)}</p>`];
    if (factsHtml) lines.push("<p>De belangrijkste punten op een rij:</p>", factsHtml);
    bodyQa.slice(0, 2).forEach((q, i) => {
      if (interview) lines.push(quoteParagraph(q.answer, interview.intervieweeName, interview.intervieweeRole, i));
    });
    lines.push("<p>Hartelijke groet,</p>", "<p>[AANVULLEN: naam afzender]</p>");
    open.push("Afzender van de e-mail invullen.");
    body = lines.join("");
  } else {
    const parts: string[] = [`<p><strong>${esc(lead)}</strong></p>`];
    if (bodyQa.length > 0 && interview) {
      bodyQa.forEach((q, i) => {
        const heading = TOPIC_HEADINGS[q.topic ?? ""] ?? capitalize(q.topic ?? "Toelichting");
        parts.push(`<h2>${esc(heading)}</h2>`, quoteParagraph(q.answer, interview.intervieweeName, interview.intervieweeRole, i));
      });
      if (factsHtml) parts.push("<h2>Feiten uit de bronnen</h2>", factsHtml);
    } else {
      parts.push("<h2>Wat er speelt</h2>");
      parts.push(factsHtml || "<p>[AANVULLEN: kernfeiten - in het bronmateriaal zijn geen concrete feiten gevonden]</p>");
      parts.push("<h2>Reactie</h2>", "<p>[AANVULLEN: quote van een betrokkene - neem eerst een interview af]</p>");
    }
    if (input.classification === "external" && brand.boilerplate) {
      parts.push(`<h2>Over ${esc(brand.organizationName)}</h2>`, `<p>${esc(brand.boilerplate)}</p>`);
    }
    body = parts.join("");
  }

  return {
    title: brief.title,
    subtitle: truncate(sentences(lead)[0] ?? lead, 140),
    bodyHtml: body,
    excerpt: truncate(lead, 200),
    tags,
    openQuestions: open,
  };
}

// --- provider ---------------------------------------------------------------
export class DemoProvider implements AIProvider {
  readonly id = "demo" as const;
  readonly model = "demo-regels";
  readonly triageModel = "demo-regels";

  async analyzeMessage(input: Parameters<AIProvider["analyzeMessage"]>[0]): Promise<SignalAnalysis> {
    return analyze(input.message, input.knownPeople);
  }

  async evaluateStory(input: Parameters<AIProvider["evaluateStory"]>[0]): Promise<StoryEvaluation> {
    const { signal, agentKind, people } = input;
    const customer = signal.entities.customer;
    const project = signal.entities.project;
    const names = signal.entities.people ?? [];

    const externalTypes: Partial<Record<SignalCategory, ContentType>> = {
      customer_case: "customer_case",
      commercial_update: "news_article",
      team_achievement: "news_article",
      new_employee: "website_article",
      project_milestone: "website_article",
    };
    const internalTypes: Partial<Record<SignalCategory, ContentType>> = {
      new_employee: "employee_introduction",
      management_update: "management_update",
    };
    const contentType: ContentType =
      agentKind === "external"
        ? (externalTypes[signal.category] ?? "news_article")
        : (internalTypes[signal.category] ?? "internal_update");

    let title = signal.title;
    if (contentType === "customer_case" && customer) title = `Klantcase: ${customer}${project ? ` - ${project}` : ""}`;
    if (contentType === "employee_introduction") title = `Even voorstellen: ${names[0] ?? "onze nieuwe collega"}`;

    const angle =
      contentType === "customer_case"
        ? `${signal.summary} Een klantcase laat zien welk probleem is opgelost, hoe de samenwerking verliep en wat het heeft opgeleverd.`
        : contentType === "employee_introduction"
          ? `${signal.summary} Een korte voorstelronde helpt collega's om snel kennis te maken.`
          : contentType === "management_update"
            ? `${signal.summary} Vertaal dit naar een heldere update voor alle collega's: wat verandert er en waarom.`
            : agentKind === "external"
              ? `${signal.summary} Dit laat zien waar de organisatie mee bezig is en is relevant voor klanten en relaties.`
              : `${signal.summary} Deel dit met collega's zodat iedereen op de hoogte is.`;

    const stakeholders = names.map((name) => {
      const person = people.find((p) => p.name === name || firstName(p.name) === firstName(name));
      const job = person?.jobTitle ?? "Betrokkene";
      const reason = /project/i.test(job)
        ? "Kent het project en de klant inhoudelijk"
        : /account|sales|commerc/i.test(job)
          ? "Commercieel aanspreekpunt; kan klanttoestemming regelen"
          : /directeur|directie/i.test(job)
            ? "Eindverantwoordelijk; geeft richting aan de boodschap"
            : "Wordt genoemd in het bronmateriaal";
      return { name: person?.name ?? name, role: job, reason };
    });

    return {
      title,
      angle,
      contentType,
      classification: agentKind === "external" ? "external" : "internal",
      priority: clamp(signal.relevanceScore + (contentType === "customer_case" ? 5 : 0)),
      stakeholders,
      externalPermission:
        agentKind === "internal"
          ? "not_required"
          : signal.confidentiality === "public_ok"
            ? "granted"
            : customer || signal.category === "new_employee"
              ? "unknown"
              : "not_required",
      alsoInterestingExternally:
        agentKind === "internal" &&
        signal.audience !== "internal" &&
        signal.confidentiality !== "confidential" &&
        signal.relevanceScore >= 55,
      externalPitch:
        agentKind === "internal" && signal.audience !== "internal"
          ? `${signal.title}: mogelijk ook interessant voor extern (${signal.category === "new_employee" ? "employer branding" : "zichtbaarheid bij klanten en relaties"}).`
          : "",
    };
  }

  async generateInterviewQuestions(
    input: Parameters<AIProvider["generateInterviewQuestions"]>[0],
  ): Promise<InterviewQuestion[]> {
    return questionTemplates(input.interview)
      .slice(0, input.count)
      .map((q, i) => ({ id: `q${i + 1}`, text: q.text, topic: q.topic }));
  }

  async nextInterviewTurn(input: Parameters<AIProvider["nextInterviewTurn"]>[0]): Promise<InterviewTurn> {
    const { questions, transcript, interview } = input;
    const asked = new Set(transcript.filter((t) => t.role === "agent" && t.questionId).map((t) => t.questionId));
    const last = transcript[transcript.length - 1];
    const lastAgent = [...transcript].reverse().find((t) => t.role === "agent");

    if (transcript.length === 0) {
      const q = questions[0];
      return {
        message: `Hoi ${firstName(interview.intervieweeName)}, fijn dat je tijd hebt. ${interview.purpose ? `Dit gesprek gaat over: ${interview.purpose.replace(/\.$/, "")}. ` : ""}${q ? q.text : "Waar wil je mee beginnen?"}`,
        done: !q,
        questionId: q?.id ?? null,
      };
    }

    // One follow-up when the answer to a prepared question is very short.
    if (last?.role === "interviewee" && lastAgent?.questionId && last.content.trim().split(/\s+/).length < 8) {
      return {
        message: "Dank je. Kun je daar iets meer over vertellen, bijvoorbeeld met een concreet voorbeeld?",
        done: false,
        questionId: null,
      };
    }

    const next = questions.find((q) => !asked.has(q.id));
    if (!next) {
      return {
        message: `Dank je wel, ${firstName(interview.intervieweeName)}. Ik heb alles wat ik nodig heb. Ik verwerk je antwoorden in een samenvatting en een concepttekst; die gaat altijd eerst langs de redactie voordat er iets wordt gedeeld.`,
        done: true,
        questionId: null,
      };
    }
    const ack = ["Helder, dank je.", "Dank, dat is duidelijk.", "Mooi, dank je wel.", "Dank voor de toelichting."][asked.size % 4];
    return { message: `${ack} ${next.text}`, done: false, questionId: next.id };
  }

  async summarizeInterview(input: Parameters<AIProvider["summarizeInterview"]>[0]): Promise<InterviewSummary> {
    const answers = input.transcript.filter((t) => t.role === "interviewee" && t.content.trim().length > 0);
    const name = input.interview.intervieweeName;
    const keyPoints = answers
      .map((a) => truncate(sentences(a.content)[0] ?? a.content, 200))
      .filter((p) => p.length > 15)
      .slice(0, 6);

    const quotes = answers
      .flatMap((a) => sentences(a.content))
      .filter((s) => {
        const words = s.split(/\s+/).length;
        return words >= 8 && words <= 32 && /\b(we|wij|ik|ons|onze|mijn)\b/i.test(s);
      })
      .slice(0, 4)
      .map((text) => ({ text, speaker: name }));

    const followUps: string[] = [];
    for (const a of answers) {
      if (/moet ik (nog )?(navragen|checken|nagaan)|weet ik niet (precies|zeker)|nog niet bekend|kom ik op terug/i.test(a.content)) {
        followUps.push(`Navragen bij ${firstName(name)}: "${truncate(a.content, 110)}"`);
      }
    }
    if (quotes.length > 0) followUps.push(`Quotes laten accorderen door ${name}.`);
    if (input.interview.kind === "customer_case") {
      followUps.push(`Toestemming voor externe publicatie vastleggen${input.interview.customer ? ` bij ${input.interview.customer}` : ""}.`);
    }
    if (!answers.some((a) => hasNumber(a.content))) followUps.push("Concrete cijfers of resultaten opvragen.");

    return {
      summary: `Interview met ${name}${input.interview.intervieweeRole ? ` (${input.interview.intervieweeRole})` : ""} over: ${input.interview.purpose || input.interview.title}. ${answers.length} antwoord(en) vastgelegd.`,
      key_points: keyPoints,
      quotes,
      follow_ups: followUps,
    };
  }

  async generateContent(input: ContentRequest): Promise<GeneratedContent> {
    const content = buildContent(input);
    // Further interviewees get their own, verbatim quote. Nothing is merged or invented.
    const extra = (input.moreInterviews ?? [])
      .map((interview) => {
        const quote = interview.summary?.quotes[0]?.text ?? sentences(interview.qa[0]?.answer ?? "")[0];
        if (!quote) return "";
        const who = `${interview.intervieweeName}${interview.intervieweeRole ? `, ${interview.intervieweeRole}` : ""}`;
        return `<blockquote><p>“${esc(quote.replace(/^[“"]|[”"]$/g, ""))}”</p><p>${esc(who)}</p></blockquote>`;
      })
      .join("");
    if (!extra) return content;
    const about = content.bodyHtml.lastIndexOf("<h2>Over ");
    return {
      ...content,
      bodyHtml: about > 0 ? `${content.bodyHtml.slice(0, about)}${extra}${content.bodyHtml.slice(about)}` : `${content.bodyHtml}${extra}`,
    };
  }

  async generateSocialPost(input: Parameters<AIProvider["generateSocialPost"]>[0]): Promise<{ body: string }> {
    const { article } = input;
    const all = sentences(article.bodyText);
    const lines = sentences(article.excerpt || article.bodyText).slice(0, 2);
    const hashtags = article.tags
      .slice(0, 3)
      .map((t) => `#${t.replace(/[^\p{L}\p{N}]+/gu, "")}`)
      .filter((t) => t.length > 1)
      .join(" ");
    const link = "Lees het hele verhaal: [link]";
    const join = (parts: string[]) => parts.filter((part, i) => part !== "" || parts[i - 1] !== "").join("\n").trim();

    // Written in a colleague's name: first person, and only what the article says.
    if (input.inNameOf) {
      return {
        body: join([
          `Hier heb ik de afgelopen tijd met plezier aan gewerkt: ${article.title}.`,
          "",
          ...lines,
          "",
          "[AANVULLEN: jouw eigen ervaring in een of twee zinnen. De bot verzint die niet voor je.]",
          "",
          link,
          "",
          hashtags,
        ]),
      };
    }
    if (input.variant === "short") {
      return { body: join([lines[0] ?? article.title, "", link, "", hashtags]) };
    }
    if (input.variant === "quote") {
      const quote = article.bodyText.match(/[“"]([^”"]{30,260})[”"]/)?.[1];
      if (quote) return { body: join([`“${quote.trim()}”`, "", article.title, "", link, "", hashtags]) };
    }
    if (input.variant === "story") {
      return { body: join([article.title, "", ...all.slice(0, 4).map((s) => truncate(s, 220)), "", link, "", hashtags]) };
    }
    return { body: join([article.title, "", ...lines, "", link, "", hashtags]) };
  }

  async triageTip(input: Parameters<AIProvider["triageTip"]>[0]): Promise<TipTriage> {
    const text = `${input.subject ?? ""} ${input.text}`.toLowerCase();
    const words = (value: string) => new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 4));
    const tipWords = words(text);

    // 1. Does it add to a topic the editors already have?
    let best: { id: string; title: string; score: number } | null = null;
    for (const topic of input.openTopics) {
      const topicWords = words(`${topic.title} ${topic.summary}`);
      let overlap = 0;
      for (const w of topicWords) if (tipWords.has(w)) overlap++;
      const score = topicWords.size ? overlap / topicWords.size : 0;
      if (overlap >= 2 && score >= 0.2 && (!best || score > best.score)) best = { id: topic.id, title: topic.title, score };
    }
    if (best) {
      return {
        outcome: "addition",
        topicId: best.id,
        rubric: null,
        reason: `Sluit aan op het lopende onderwerp “${best.title}”.`,
        reply: `Dank je! Dit past bij een onderwerp waar de redactie al mee bezig is (“${best.title}”). Ik heb je bericht daaraan toegevoegd.`,
      };
    }

    // 2. A small item for a fixed section?
    const rubricHints: Record<string, RegExp> = {
      "Nieuwe collega's": /nieuwe collega|begint bij ons|eerste werkdag|komt ons team versterken|in dienst/,
      Jubilea: /jubileum|jaar in dienst|\d+ jaar bij/,
      Vacatures: /vacature|we zoeken|gezocht:/,
      Agenda: /borrel|uitje|save the date|kennissessie|meetup|teamdag/,
    };
    for (const rubric of input.rubrics) {
      if (rubricHints[rubric]?.test(text)) {
        return {
          outcome: "rubric",
          topicId: null,
          rubric,
          reason: `Past in de vaste rubriek “${rubric}”.`,
          reply: `Dank je! Dit is iets voor de rubriek “${rubric}” in de interne nieuwsbrief. De redactie neemt het mee.`,
        };
      }
    }

    // 3. News in its own right, or nothing?
    const analysis = analyze(
      { id: "tip", source: "manual", author: input.senderName, title: input.subject ?? null, body: input.text, occurredAt: new Date().toISOString() },
      [],
    );
    if (analysis.newsworthy && analysis.relevanceScore >= 45) {
      return {
        outcome: "new_proposal",
        topicId: null,
        rubric: null,
        reason: analysis.scoreRationale,
        reply: "Dank je voor de tip! Ik leg hem voor aan de redactie. Zij beslissen of we er iets mee doen; je hoort het als er een stuk van komt.",
      };
    }
    return {
      outcome: "nothing",
      topicId: null,
      rubric: null,
      reason: "Geen nieuws voor de redactie: geen concrete gebeurtenis, oplevering of resultaat herkend.",
      reply: "Dank je voor je bericht. Ik zie hier geen nieuws in voor de redactie, dus we pakken het niet op. Heb ik het mis? Mail dan de redactie rechtstreeks.",
    };
  }

  async reviseContent(input: Parameters<AIProvider["reviseContent"]>[0]): Promise<Revision> {
    // The rule-based stand-in only understands literal requests:
    //   vervang "A" door "B"   ·   "A" moet "B" zijn   ·   schrap / verwijder "A"
    const q = "[“\"‘']([^”\"’']{2,300})[”\"’']";
    const replace =
      input.instruction.match(new RegExp(`vervang\\s+${q}\\s+door\\s+${q}`, "i")) ??
      input.instruction.match(new RegExp(`${q}\\s+moet\\s+${q}\\s+(?:zijn|worden)`, "i"));
    const remove = input.instruction.match(new RegExp(`(?:schrap|verwijder|haal)\\s+(?:de zin\\s+|het woord\\s+)?${q}`, "i"));

    const unchanged = (note: string): Revision => ({ title: input.title, bodyHtml: input.bodyHtml, applied: false, note });
    const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    if (replace) {
      const [, from, to] = replace;
      if (!input.bodyHtml.includes(esc(from)) && !input.title.includes(from)) {
        return unchanged(`De tekst “${from}” komt niet letterlijk voor in het stuk. Een redacteur moet deze aanpassing zelf doen.`);
      }
      return {
        title: input.title.split(from).join(to),
        bodyHtml: input.bodyHtml.split(esc(from)).join(esc(to)),
        applied: true,
        note: `“${from}” is vervangen door “${to}”, op verzoek van ${input.requestedBy}.`,
      };
    }
    if (remove) {
      const [, target] = remove;
      if (!input.bodyHtml.includes(esc(target))) {
        return unchanged(`De tekst “${target}” komt niet letterlijk voor in het stuk. Een redacteur moet deze aanpassing zelf doen.`);
      }
      const body = input.bodyHtml
        .split(esc(target))
        .join("")
        .replace(/<p>\s*<\/p>/g, "")
        .replace(/\s{2,}/g, " ");
      return { title: input.title, bodyHtml: body, applied: true, note: `“${target}” is geschrapt, op verzoek van ${input.requestedBy}.` };
    }
    return unchanged(
      "De demo-modus kan alleen letterlijke verzoeken uitvoeren (vervang \"A\" door \"B\", schrap \"A\"). Met de Claude API herschrijft de bot de tekst zelf. Het verzoek ligt nu bij de redactie.",
    );
  }

  async composeMdUpdate(input: Parameters<AIProvider["composeMdUpdate"]>[0]): Promise<MdUpdateDraft> {
    // One theme per question topic; a passage is the person's own answer, in their own words.
    const themes = new Map<string, { speakerId: string; text: string }[]>();
    for (const contribution of input.contributions) {
      for (const qa of contribution.qa) {
        const answer = qa.answer.trim();
        if (answer.length < 20 || /^(geen|niets|nvt|n\.v\.t\.)/i.test(answer)) continue;
        const theme = (qa.topic || "Overig").replace(/^./, (c) => c.toUpperCase());
        // The speaker's name is shown with the passage; the passage itself is their own words.
        const text = `“${truncate(answer, 600)}”`;
        themes.set(theme, [...(themes.get(theme) ?? []), { speakerId: contribution.speakerId, text }]);
      }
    }
    return { themes: Array.from(themes, ([theme, passages]) => ({ theme, passages })) };
  }

  async generateNewsletterFraming(
    input: Parameters<AIProvider["generateNewsletterFraming"]>[0],
  ): Promise<NewsletterFraming> {
    const { kind, monthLabel, items, brand } = input;
    const highlights = items.slice(0, 2).map((i) => `“${i.title}”`);
    const mention = highlights.length ? ` Onder meer: ${highlights.join(" en ")}.` : "";
    if (kind === "external") {
      return {
        subject: `${brand.organizationName} | Nieuws van ${monthLabel}`,
        introHtml: `<p>Beste relatie,</p><p>In deze editie delen we ${items.length} ${items.length === 1 ? "verhaal" : "verhalen"} uit ${monthLabel}.${esc(mention)}</p>`,
        outroHtml: `<p>Meer weten of eens sparren over jouw vraagstuk? Neem gerust contact met ons op.</p><p>Hartelijke groet,<br>Team ${esc(brand.organizationName)}</p>`,
      };
    }
    return {
      subject: `Intern nieuws - ${monthLabel}`,
      introHtml: `<p>Hoi collega's,</p><p>Tijd voor de update van ${monthLabel}: ${items.length} ${items.length === 1 ? "bericht" : "berichten"} over wat er speelt binnen ${esc(brand.organizationName)}.${esc(mention)}</p>`,
      outroHtml: `<p>Heb je zelf nieuws of een mooi verhaal voor de volgende editie? Stuur de bot een berichtje of gebruik het tipformulier.</p><p>Tot de volgende!</p>`,
    };
  }

  async answerInfoRequest(
    input: Parameters<AIProvider["answerInfoRequest"]>[0],
  ): Promise<{ answer: string; found: boolean }> {
    const keywords = input.question
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 4);
    const hits: string[] = [];
    for (const s of input.sources) {
      for (const sentence of sentences(s.body)) {
        const lower = sentence.toLowerCase();
        if (keywords.some((k) => lower.includes(k)) && hits.length < 4) {
          hits.push(`${truncate(sentence, 220)} (${sourceLabel(s)})`);
        }
      }
    }
    if (hits.length === 0) {
      return {
        answer: "In de geautoriseerde interne bronnen is hierover geen aanvullende informatie gevonden. Advies: vraag het na bij de betrokken projectleider.",
        found: false,
      };
    }
    return { answer: `Op basis van interne bronnen:\n- ${hits.join("\n- ")}`, found: true };
  }
}
