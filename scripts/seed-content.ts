/**
 * Dutch demo content for the seed. Quotes in article bodies are taken verbatim
 * from the interview answers below, mirroring the product rule that nothing is
 * invented.
 */

export const DEMO_PASSWORD = "Demo-Noordlicht-2026";

export const USERS = [
  { key: "sanne", email: "sanne@noordlicht.example", name: "Sanne de Vries", role: "administrator", job: "Hoofd Marketing & Communicatie", department: "Marketing", color: "teal" },
  { key: "daan", email: "daan@noordlicht.example", name: "Daan Bakker", role: "chief_editor", job: "Hoofdredacteur", department: "Marketing", color: "blue" },
  { key: "lotte", email: "lotte@noordlicht.example", name: "Lotte Jansen", role: "editor", job: "Contentmarketeer", department: "Marketing", color: "violet" },
  { key: "ruben", email: "ruben@noordlicht.example", name: "Ruben Visser", role: "reviewer", job: "Lead developer", department: "Development", color: "amber" },
  { key: "femke", email: "femke@noordlicht.example", name: "Femke Mulder", role: "marketing_manager", job: "Marketing- en salesmanager", department: "Sales", color: "rose" },
  { key: "tim", email: "tim@noordlicht.example", name: "Tim Hoekstra", role: "employee", job: "Projectleider", department: "Projecten", color: "green" },
  { key: "marieke", email: "marieke@noordlicht.example", name: "Marieke van Dijk", role: "employee", job: "Algemeen directeur", department: "Directie", color: "slate" },
  { key: "joost", email: "joost@noordlicht.example", name: "Joost Meijer", role: "employee", job: "Senior developer", department: "Development", color: "blue" },
  { key: "bram", email: "bram@noordlicht.example", name: "Bram de Groot", role: "employee", job: "DevOps-engineer", department: "Development", color: "amber" },
] as const;

export type UserKey = (typeof USERS)[number]["key"];

export const BRAND = {
  brand_personality:
    "Noordlicht Digital is nuchter, betrokken en vakkundig. We praten als een collega die er verstand van heeft: helder, zonder poespas en met oog voor de mensen die onze producten gebruiken.",
  writing_style:
    "Schrijf actief en concreet. Laat feiten en mensen het verhaal vertellen. Vermijd jargon; leg een vakterm uit als hij echt nodig is. Gebruik je/jij in plaats van u.",
  sentence_structure:
    "Korte zinnen, gemiddeld 12 tot 15 woorden. Eén gedachte per zin. Begin een stuk met de kern en bouw daarna op. Gebruik tussenkoppen om de 3 à 4 alinea's.",
  tone_internal: "Warm en direct, van collega tot collega. Een knipoog mag, cynisme niet. Noem mensen bij hun voornaam.",
  tone_external:
    "Zelfverzekerd maar bescheiden. De klant en het resultaat staan centraal, niet wij. Geen superlatieven; cijfers alleen als ze kloppen en gedeeld mogen worden.",
  tone_social: "Persoonlijk en to the point. Eén boodschap per post, maximaal drie hashtags, geen clickbait.",
  communication_policies:
    "Klantnamen, resultaten en quotes worden alleen extern gedeeld na schriftelijke toestemming van de klant. Financiële details, personeelszaken en lopende aanbestedingen zijn vertrouwelijk. Nieuwe collega's geven zelf toestemming voor een voorstelbericht en foto.",
  boilerplate:
    "Noordlicht Digital is een digitaal bureau uit Utrecht. Met een team van ontwerpers, developers en strategen bouwen we toegankelijke digitale producten voor organisaties in zorg, logistiek en cultuur.",
  words_to_avoid: ["innovatief", "state-of-the-art", "ontzorgen", "uniek", "oplossing op maat", "synergie"],
  preferred_terminology: [
    { term: "klant", instead_of: "opdrachtgever", note: "We spreken consequent over klanten." },
    { term: "collega's", instead_of: "medewerkers", note: "Zo praten we intern over elkaar." },
    { term: "samenwerking", instead_of: "partnership" },
  ],
};

type QA = { topic: string; question: string; answer: string };

export const INTERVIEW_RIJNMOND: QA[] = [
  {
    topic: "aanleiding",
    question: "Wat was de aanleiding voor het planningsplatform en welke uitdaging lag er bij Rijnmond Logistiek?",
    answer:
      "Rijnmond Logistiek plande de ritten voor zes depots nog grotendeels in spreadsheets. Chauffeurs belden meerdere keren per dag naar de planning om te horen waar ze heen moesten. Dat kostte de planners veel tijd en zorgde voor fouten.",
  },
  {
    topic: "aanpak",
    question: "Hoe hebben jullie het aangepakt en welke keuzes waren daarin bepalend?",
    answer:
      "We zijn gestart met één depot als proeftuin en hebben daar elke week met planners en chauffeurs getest. Pas toen het daar goed liep, hebben we de andere vijf depots aangesloten. Chauffeurs zien hun ritten nu realtime in de app.",
  },
  {
    topic: "samenwerking",
    question: "Hoe verliep de samenwerking met Rijnmond Logistiek? Wat maakte het verschil?",
    answer:
      "De planners van Rijnmond zaten vanaf de eerste dag aan tafel. Zij weten precies waar het in de praktijk misgaat, en dat hebben we gebruikt om keuzes te maken.",
  },
  {
    topic: "resultaat",
    question: "Welke concrete resultaten zijn er bereikt? Noem waar mogelijk cijfers die we mogen delen.",
    answer:
      "In de eerste week na de uitrol kwamen er 32% minder telefoontjes bij de planning binnen. Inmiddels werken 140 chauffeurs dagelijks met de app op alle 6 depots.",
  },
  {
    topic: "vooruitblik",
    question: "Wat is de volgende stap voor dit project?",
    answer: "De volgende stap is een koppeling met de routeplanner, zodat wijzigingen onderweg automatisch worden doorgegeven.",
  },
  {
    topic: "toestemming",
    question: "Is Rijnmond Logistiek akkoord met externe publicatie, en wie is daarvoor het aanspreekpunt?",
    answer: "Ja, Peter van den Berg, operationeel directeur van Rijnmond Logistiek, heeft schriftelijk akkoord gegeven voor publicatie.",
  },
];

export const ARTICLE_RIJNMOND = `<p><strong>Rijnmond Logistiek plande de ritten voor zes depots jarenlang in spreadsheets. Sinds de uitrol van het nieuwe planningsplatform zien chauffeurs hun ritten realtime in een app, en is het een stuk rustiger aan de telefoon.</strong></p>
<h2>De aanleiding</h2>
<p>„Rijnmond Logistiek plande de ritten voor zes depots nog grotendeels in spreadsheets”, vertelt Tim Hoekstra, projectleider bij Noordlicht Digital. „Chauffeurs belden meerdere keren per dag naar de planning om te horen waar ze heen moesten. Dat kostte de planners veel tijd en zorgde voor fouten.”</p>
<h2>De aanpak</h2>
<p>Het team koos voor een gefaseerde uitrol. „We zijn gestart met één depot als proeftuin en hebben daar elke week met planners en chauffeurs getest”, zegt Tim. „Pas toen het daar goed liep, hebben we de andere vijf depots aangesloten.”</p>
<h2>De samenwerking</h2>
<p>„De planners van Rijnmond zaten vanaf de eerste dag aan tafel”, licht Tim toe. „Zij weten precies waar het in de praktijk misgaat, en dat hebben we gebruikt om keuzes te maken.”</p>
<h2>Het resultaat</h2>
<p>„In de eerste week na de uitrol kwamen er 32% minder telefoontjes bij de planning binnen”, aldus Tim. „Inmiddels werken 140 chauffeurs dagelijks met de app op alle 6 depots.”</p>
<h2>Vooruitblik</h2>
<p>„De volgende stap is een koppeling met de routeplanner, zodat wijzigingen onderweg automatisch worden doorgegeven.”</p>`;

export const INTERVIEW_KETEL: QA[] = [
  {
    topic: "aanleiding",
    question: "Wat was de aanleiding voor de nieuwe webshop en welke uitdaging lag er bij Brouwerij De Koperen Ketel?",
    answer:
      "Brouwerij De Koperen Ketel verkocht bier via een verouderde webshop die niet meer te onderhouden was. Bestellingen moesten met de hand worden overgetypt in de kassa.",
  },
  {
    topic: "aanpak",
    question: "Hoe hebben jullie het aangepakt en welke keuzes waren daarin bepalend?",
    answer:
      "We hebben de checkout opnieuw opgezet en de webshop gekoppeld aan de kassa en het voorraadsysteem. Daardoor klopt de voorraad nu altijd.",
  },
  {
    topic: "samenwerking",
    question: "Hoe verliep de samenwerking met Brouwerij De Koperen Ketel? Wat maakte het verschil?",
    answer: "Hanneke Smit, de eigenaar, was bij elke demo aanwezig en besliste snel. Dat maakt het werken heel prettig.",
  },
  {
    topic: "resultaat",
    question: "Welke concrete resultaten zijn er bereikt? Noem waar mogelijk cijfers die we mogen delen.",
    answer: "In het eerste weekend na de livegang kwamen er 410 bestellingen binnen. De conversie steeg van 1,8% naar 2,6%.",
  },
  { topic: "vooruitblik", question: "Wat is de volgende stap voor dit project?", answer: "In de tweede fase voegen we bierabonnementen toe." },
  {
    topic: "toestemming",
    question: "Is Brouwerij De Koperen Ketel akkoord met externe publicatie, en wie is daarvoor het aanspreekpunt?",
    answer: "Dat moet ik nog navragen bij Hanneke. Ze was enthousiast, maar ik heb nog geen formeel akkoord.",
  },
];

export const ARTICLE_KETEL = `<p><strong>Brouwerij De Koperen Ketel verkoopt haar bier sinds kort via een nieuwe webshop. De koppeling met kassa en voorraad scheelt handwerk, en de eerste cijfers zijn veelbelovend.</strong></p>
<h2>De aanleiding</h2>
<p>„Brouwerij De Koperen Ketel verkocht bier via een verouderde webshop die niet meer te onderhouden was”, vertelt Tim Hoekstra, projectleider bij Noordlicht Digital. „Bestellingen moesten met de hand worden overgetypt in de kassa.”</p>
<h2>De aanpak</h2>
<p>„We hebben de checkout opnieuw opgezet en de webshop gekoppeld aan de kassa en het voorraadsysteem”, zegt Tim. „Daardoor klopt de voorraad nu altijd.”</p>
<h2>De samenwerking</h2>
<p>„Hanneke Smit, de eigenaar, was bij elke demo aanwezig en besliste snel”, licht Tim toe. „Dat maakt het werken heel prettig.”</p>
<h2>Het resultaat</h2>
<p>„In het eerste weekend na de livegang kwamen er 410 bestellingen binnen”, aldus Tim. „De conversie steeg van 1,8% naar 2,6%.”</p>
<h2>Vooruitblik</h2>
<p>„In de tweede fase voegen we bierabonnementen toe.”</p>`;

export const INTERVIEW_MARIEKE: QA[] = [
  {
    topic: "terugblik",
    question: "Wat waren de belangrijkste ontwikkelingen van de afgelopen periode?",
    answer:
      "We hebben het derde kwartaal goed afgesloten. De omzet groeide met 11% ten opzichte van vorig jaar en we verwelkomden 4 nieuwe klanten.",
  },
  {
    topic: "prioriteiten",
    question: "Waar ligt de komende periode de prioriteit en waarom?",
    answer:
      "In het vierde kwartaal ligt de focus op de zorgsector en op toegankelijkheid. Daar zien we de meeste vraag en daar kunnen we het verschil maken.",
  },
  {
    topic: "resultaten",
    question: "Welke resultaten of cijfers wil je met alle collega's delen?",
    answer: "Ik ben vooral blij dat de klanttevredenheid stabiel hoog blijft. Precieze cijfers deel ik zodra het klantonderzoek is afgerond.",
  },
  {
    topic: "mensen",
    question: "Welke collega's of teams verdienen een compliment?",
    answer: "Een groot compliment voor het platformteam, dat voor het eerst dit jaar op nul openstaande bugs op productie staat.",
  },
  {
    topic: "boodschap",
    question: "Welke boodschap wil je iedereen meegeven?",
    answer: "Blijf nieuwsgierig en blijf elkaar opzoeken. Per 1 maart doen we dat in ons nieuwe kantoor aan de Oudegracht.",
  },
];

export const ARTICLE_KWARTAAL = `<p>Beste collega's,</p>
<p><strong>Het derde kwartaal is goed afgesloten. Marieke van Dijk, algemeen directeur, blikt terug en kijkt vooruit.</strong></p>
<h2>Terugblik</h2>
<p>„We hebben het derde kwartaal goed afgesloten”, vertelt Marieke. „De omzet groeide met 11% ten opzichte van vorig jaar en we verwelkomden 4 nieuwe klanten.”</p>
<h2>Prioriteiten</h2>
<p>„In het vierde kwartaal ligt de focus op de zorgsector en op toegankelijkheid”, zegt Marieke. „Daar zien we de meeste vraag en daar kunnen we het verschil maken.”</p>
<h2>Complimenten</h2>
<p>„Een groot compliment voor het platformteam, dat voor het eerst dit jaar op nul openstaande bugs op productie staat.”</p>
<h2>Tot slot</h2>
<p>„Blijf nieuwsgierig en blijf elkaar opzoeken. Per 1 maart doen we dat in ons nieuwe kantoor aan de Oudegracht.”</p>`;

export const INTERVIEW_BRAM: QA[] = [
  {
    topic: "achtergrond",
    question: "Kun je jezelf kort voorstellen? Waar kom je vandaan en wat heb je hiervoor gedaan?",
    answer:
      "Ik ben Bram, 31 jaar en ik woon in Zwolle. Hiervoor heb ik vijf jaar bij een hostingpartij gewerkt, waar ik verantwoordelijk was voor de beschikbaarheid van klantomgevingen.",
  },
  {
    topic: "rol",
    question: "Wat ga je bij ons doen en waar kunnen collega's je voor benaderen?",
    answer:
      "Ik ga in het platformteam aan de slag als DevOps-engineer. Je kunt bij mij terecht voor alles rond deployments, monitoring en de buildstraat.",
  },
  {
    topic: "motivatie",
    question: "Waarom heb je voor ons gekozen?",
    answer: "Ik wilde dichter bij de mensen werken die de producten bouwen. Hier zit ik letterlijk naast de developers.",
  },
  {
    topic: "eerste indruk",
    question: "Wat is je eerste indruk na je eerste dagen?",
    answer: "Iedereen neemt de tijd om dingen uit te leggen. En de koffie is goed, dat helpt ook.",
  },
  {
    topic: "buiten werk",
    question: "Wat doe je graag als je niet aan het werk bent?",
    answer: "In het weekend zit ik graag op de racefiets, het liefst richting de Veluwe.",
  },
];

export const ARTICLE_BRAM = `<p><strong>Bram de Groot is gestart als DevOps-engineer in het platformteam. Tijd om kennis te maken.</strong></p>
<h2>Achtergrond</h2>
<p>„Ik ben Bram, 31 jaar en ik woon in Zwolle”, vertelt Bram de Groot. „Hiervoor heb ik vijf jaar bij een hostingpartij gewerkt, waar ik verantwoordelijk was voor de beschikbaarheid van klantomgevingen.”</p>
<h2>De nieuwe rol</h2>
<p>„Ik ga in het platformteam aan de slag als DevOps-engineer”, zegt Bram. „Je kunt bij mij terecht voor alles rond deployments, monitoring en de buildstraat.”</p>
<h2>De keuze voor ons</h2>
<p>„Ik wilde dichter bij de mensen werken die de producten bouwen. Hier zit ik letterlijk naast de developers.”</p>
<h2>Buiten het werk</h2>
<p>„In het weekend zit ik graag op de racefiets, het liefst richting de Veluwe.”</p>`;

export const ARTICLE_BUGS = `<p><strong>Sprint 48 is afgerond met een record: voor het eerst dit jaar staan er geen openstaande bugs op productie.</strong></p>
<h2>Wat er speelt</h2>
<ul><li>Sprint 48 afgerond met een record: 0 openstaande bugs op productie voor het eerst dit jaar. <em>(Slack #team-development)</em></li></ul>
<h2>Reactie</h2>
<p>[AANVULLEN: quote van een betrokkene - neem eerst een interview af]</p>`;

export const ARTICLE_TOEGANKELIJKHEID = `<p><strong>Toegankelijkheid wordt vaak pas aan het eind van een project getest. Dat is te laat. Wie er in de ontwerpfase rekening mee houdt, bouwt een beter product voor iedereen.</strong></p>
<h2>Begin bij het ontwerp</h2>
<p>Contrast, leesbare lettergroottes en een logische volgorde van elementen kosten in de ontwerpfase nauwelijks extra tijd. Achteraf herstellen is duurder en levert vaak een halve oplossing op.</p>
<h2>Test met echte gebruikers</h2>
<p>Volgens onderzoek heeft 25% van de Nederlanders moeite met digitale diensten. Onze innovatieve aanpak: we testen elk ontwerp met mensen die een schermlezer of alleen een toetsenbord gebruiken.</p>
<h2>Wat het oplevert</h2>
<p>Een toegankelijk product is eenvoudiger te gebruiken voor iedereen. Dat merkt elke opdrachtgever aan minder vragen bij de klantenservice.</p>`;

export const ARTICLE_TEAMDAG = `<p><strong>Vorige week trokken we er met het hele team op uit voor de jaarlijkse teamdag. Dit keer in de Biesbosch, in de kano.</strong></p>
<h2>Samen het water op</h2>
<p>Na een korte uitleg stapten we in tweetallen in de kano. De route voerde door smalle kreken en langs een bevernest. Niet iedereen bleef droog, maar iedereen kwam lachend aan.</p>
<h2>Tijd voor elkaar</h2>
<p>'s Middags was er ruimte om bij te praten over wat ons bezighoudt, zonder agenda en zonder schermen. Dat leverde verrassend veel goede ideeën op, die we de komende weken uitwerken.</p>
<h2>Volgend jaar weer</h2>
<p>De organisatie van volgend jaar ligt bij het designteam. Suggesties zijn welkom.</p>`;

export const OTHER_ORG = {
  name: "Andere Organisatie BV",
  slug: "andere-organisatie",
  admin: { email: "admin@andere-organisatie.example", name: "Eva Peeters" },
};
