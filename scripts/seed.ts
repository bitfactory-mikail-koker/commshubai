/**
 * Seeds the demo organization "Noordlicht Digital" plus a second organization
 * that is used to verify tenant isolation.
 *
 *   npm run db:seed
 *
 * Idempotent: it removes the two demo organizations (and their users) first.
 * All seeded intelligence data is flagged is_demo.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { addDays, addMinutes, format, setHours, setMinutes, startOfMonth } from "date-fns";
import { nl } from "date-fns/locale";
import { validateBrand } from "../src/lib/agents/brand-validation";
import type { Database } from "../src/lib/database.types";
import {
  ARTICLE_BRAM,
  ARTICLE_BUGS,
  ARTICLE_KETEL,
  ARTICLE_KWARTAAL,
  ARTICLE_RIJNMOND,
  ARTICLE_TEAMDAG,
  ARTICLE_TOEGANKELIJKHEID,
  BRAND,
  DEMO_PASSWORD,
  INTERVIEW_BRAM,
  INTERVIEW_KETEL,
  INTERVIEW_MARIEKE,
  INTERVIEW_RIJNMOND,
  OTHER_ORG,
  USERS,
  type UserKey,
} from "./seed-content";
import { seedRedactie } from "./seed-redactie";

config({ path: ".env.local" });
delete process.env.ANTHROPIC_API_KEY;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  process.exit(1);
}
const db = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

type Tables = Database["public"]["Tables"];
type Json = NonNullable<Tables["articles"]["Row"]["source_refs"]>;
const json = (v: unknown) => v as Json;

const NOW = new Date();
/** n days from now (negative = past) at a fixed time of day. */
const at = (days: number, hour = 10, minute = 0) => setMinutes(setHours(addDays(NOW, days), hour), minute).toISOString();
const SLUG = "noordlicht-digital";

async function insert<T extends keyof Tables>(table: T, row: Tables[T]["Insert"]): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from(table) as any).insert(row).select("*").single();
  if (error) throw new Error(`${String(table)}: ${error.message}`);
  return (data as { id: string }).id;
}

async function insertMany<T extends keyof Tables>(table: T, rows: Tables[T]["Insert"][]): Promise<void> {
  if (rows.length === 0) return;
  // defaultToNull:false → columns missing from a row use their database default.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from(table) as any).insert(rows, { defaultToNull: false });
  if (error) throw new Error(`${String(table)}: ${error.message}`);
}

async function removeOrganization(slug: string) {
  const { data: org } = await db.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (!org) return;
  const { data: profiles } = await db.from("profiles").select("id").eq("organization_id", org.id);
  const { error } = await db.from("organizations").delete().eq("id", org.id);
  if (error) throw new Error(`delete organization: ${error.message}`);
  for (const p of profiles ?? []) await db.auth.admin.deleteUser(p.id);
}

async function removeStrayUsers(emails: string[]) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users ?? []) {
    if (user.email && emails.includes(user.email)) await db.auth.admin.deleteUser(user.id);
  }
}

async function createOrganization(name: string, slug: string, settings: Record<string, unknown> = {}) {
  const orgId = await insert("organizations", { name, slug, settings: json(settings) });
  const { error } = await db.rpc("bootstrap_organization", { p_org_id: orgId });
  if (error) throw new Error(`bootstrap: ${error.message}`);
  const { error: redactieError } = await db.rpc("bootstrap_redactie", { p_org_id: orgId });
  if (redactieError) throw new Error(`bootstrap redactie: ${redactieError.message}`);
  const { data: roles } = await db.from("roles").select("id, key").eq("organization_id", orgId);
  const { data: agents } = await db.from("agents").select("id, kind").eq("organization_id", orgId);
  return {
    orgId,
    roleId: (k: string) => roles!.find((r) => r.key === k)!.id,
    external: agents!.find((a) => a.kind === "external")!.id,
    internal: agents!.find((a) => a.kind === "internal")!.id,
  };
}

async function createUser(orgId: string, roleId: string, u: { email: string; name: string; job?: string; department?: string; color?: string }) {
  const { data, error } = await db.auth.admin.createUser({
    email: u.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.name },
  });
  if (error || !data.user) throw new Error(`createUser ${u.email}: ${error?.message}`);
  await insertMany("profiles", [
    {
      id: data.user.id,
      organization_id: orgId,
      role_id: roleId,
      full_name: u.name,
      email: u.email,
      job_title: u.job ?? null,
      department: u.department ?? null,
      avatar_color: u.color ?? "slate",
    },
  ]);
  return data.user.id;
}

async function main() {
  console.log("→ Removing previous demo data");
  await removeOrganization(SLUG);
  await removeOrganization(OTHER_ORG.slug);
  // Organizations created by the end-to-end registration test.
  const { data: e2eOrgs } = await db.from("organizations").select("slug").like("slug", "e2e-testorganisatie-%");
  for (const o of e2eOrgs ?? []) await removeOrganization(o.slug);
  await removeStrayUsers([...USERS.map((u) => u.email), OTHER_ORG.admin.email]);

  // ---------------------------------------------------------------------------
  // Organization, users, brand, integrations
  // ---------------------------------------------------------------------------
  console.log("→ Organization and users");
  const org = await createOrganization("Noordlicht Digital", SLUG, { require_four_eyes: false, retention_days: 365 });
  const O = org.orgId;
  const U = {} as Record<UserKey, string>;
  for (const u of USERS) {
    U[u.key] = await createUser(O, org.roleId(u.role), { email: u.email, name: u.name, job: u.job, department: u.department, color: u.color });
  }

  const { error: brandError } = await db
    .from("brand_guidelines")
    .update({ ...BRAND, preferred_terminology: json(BRAND.preferred_terminology), updated_by: U.sanne })
    .eq("organization_id", O);
  if (brandError) throw new Error(brandError.message);

  // Source systems run as clearly marked demo simulations; nothing is "connected".
  await db
    .from("integrations")
    .update({ status: "demo", last_sync_at: at(0, 8, 30), last_sync_status: "success", last_sync_count: 2 })
    .eq("organization_id", O)
    .in("provider", ["slack", "jira", "teamleader", "email"]);
  const { data: integrations } = await db.from("integrations").select("id, provider").eq("organization_id", O);
  const integ = (p: string) => integrations!.find((i) => i.provider === p)!.id;

  // ---------------------------------------------------------------------------
  // Source messages
  // ---------------------------------------------------------------------------
  console.log("→ Source messages and signals");
  type Src = { key: string; source: "slack" | "jira" | "teamleader" | "email" | "manual"; channel: string; author: UserKey; title?: string; body: string; days: number; hour?: number; meta?: Record<string, unknown>; processed?: boolean };
  const sources: Src[] = [
    { key: "s1", source: "slack", channel: "#project-rijnmond", author: "tim", days: -24, hour: 11, body: "Het planningsplatform van Rijnmond Logistiek is live gegaan op alle 6 depots! Chauffeurs zien hun ritten nu realtime in de app. In de eerste week kwamen er 32% minder telefoontjes bij de planning binnen. De klant is erg tevreden.", meta: { customer: "Rijnmond Logistiek", project: "Planningsplatform", people: ["Tim Hoekstra"] } },
    { key: "s2", source: "jira", channel: "RML", author: "joost", days: -25, hour: 16, title: "RML-210: Planningsplatform - uitrol alle depots (afgerond)", body: "Epic afgerond in project Rijnmond Logistiek. De uitrol naar 6 depots is afgerond; 140 chauffeurs zijn actief in de app.", meta: { customer: "Rijnmond Logistiek", project: "Planningsplatform", people: ["Joost Meijer"] } },
    { key: "s3", source: "teamleader", channel: "Deals", author: "femke", days: -22, hour: 9, title: "Rijnmond Logistiek - akkoord op klantcase", body: "Rijnmond Logistiek heeft schriftelijk toestemming gegeven voor een gezamenlijke klantcase. Contactpersoon: Peter van den Berg, operationeel directeur. Akkoord met publicatie na inzage.", meta: { customer: "Rijnmond Logistiek", people: ["Femke Mulder"] } },
    { key: "s4", source: "slack", channel: "#project-koperenketel", author: "tim", days: -9, hour: 10, body: "De nieuwe webshop van Brouwerij De Koperen Ketel is opgeleverd en live gegaan! In het eerste weekend kwamen er 410 bestellingen binnen en de conversie steeg van 1,8% naar 2,6%. Eigenaar Hanneke Smit is erg enthousiast.", meta: { customer: "Brouwerij De Koperen Ketel", project: "Webshop", people: ["Tim Hoekstra"] } },
    { key: "s5", source: "jira", channel: "KET", author: "joost", days: -10, hour: 17, title: "KET-61: Webshop De Koperen Ketel - livegang (afgerond)", body: "Epic afgerond in project Brouwerij De Koperen Ketel. De nieuwe checkout en de koppeling met de kassa en het voorraadsysteem zijn live.", meta: { customer: "Brouwerij De Koperen Ketel", project: "Webshop", people: ["Joost Meijer"] } },
    { key: "s6", source: "slack", channel: "#project-lezenverbindt", author: "tim", days: -3, hour: 14, body: "Mooie mijlpaal: de voorleesapp van Stichting Lezen Verbindt is opgeleverd. Inmiddels gebruiken 85 bibliotheken de app en zijn er 12.000 voorleesmomenten geregistreerd. De stichting vraagt of wij hier samen iets over willen delen.", meta: { customer: "Stichting Lezen Verbindt", project: "Voorleesapp", people: ["Tim Hoekstra"] } },
    { key: "s7", source: "email", channel: "nieuws@noordlicht.example", author: "marieke", days: -6, hour: 9, title: "Nieuwe collega: Noor Bennani", body: "Goed nieuws: binnenkort komt Noor Bennani ons team versterken als senior UX-designer. Noor werkte hiervoor bij een scale-up in Eindhoven en is gespecialiseerd in toegankelijkheid. Haar eerste werkdag is op maandag.", meta: { people: ["Noor Bennani", "Marieke van Dijk"] } },
    { key: "s8", source: "slack", channel: "#algemeen", author: "sanne", days: -12, hour: 9, body: "Welkom aan Bram de Groot! Bram is vandaag gestart als DevOps-engineer in het platformteam. Bram komt uit Zwolle en heeft hiervoor vijf jaar bij een hostingpartij gewerkt.", meta: { people: ["Bram de Groot"] } },
    { key: "s9", source: "slack", channel: "#team-development", author: "ruben", days: -5, hour: 16, body: "Sprint 48 afgerond met een record: 0 openstaande bugs op productie voor het eerst dit jaar. Knap werk van het hele team!", meta: { people: ["Ruben Visser"] } },
    { key: "s10", source: "email", channel: "nieuws@noordlicht.example", author: "marieke", days: -4, hour: 8, title: "Kwartaalupdate directie Q3", body: "De directie deelt de kwartaalupdate: de omzet groeide met 11% ten opzichte van vorig jaar en we verwelkomden 4 nieuwe klanten. Voor het vierde kwartaal ligt de focus op de zorgsector en op toegankelijkheid. Het MT werkt aan het jaarplan.", meta: { people: ["Marieke van Dijk"] } },
    { key: "s11", source: "slack", channel: "#algemeen", author: "sanne", days: -2, hour: 13, body: "We verhuizen! Per 1 maart betrekken we het nieuwe kantoor aan de Oudegracht in Utrecht. Meer ruimte voor workshops en een eigen podcaststudio. Binnenkort volgt een rondleiding.", meta: { people: ["Sanne de Vries"] } },
    { key: "s12", source: "teamleader", channel: "Deals", author: "femke", days: -1, hour: 15, title: "Deal gewonnen: Havenbedrijf Delfzijl B.V.", body: "Deal gewonnen: Havenbedrijf Delfzijl B.V. kiest ons voor de bouw van een nieuw klantportaal. Het contract is getekend; we starten in januari.", meta: { customer: "Havenbedrijf Delfzijl B.V.", project: "Klantportaal", people: ["Femke Mulder"] } },
    { key: "s13", source: "slack", channel: "#project-rijnmond", author: "joost", days: -23, hour: 9, body: "Livegang Rijnmond Logistiek is rond: alle 6 depots draaien op het nieuwe planningsplatform en de klant is tevreden.", meta: { customer: "Rijnmond Logistiek", project: "Planningsplatform", people: ["Joost Meijer"] } },
    { key: "s14", source: "manual", channel: "Handmatige inzending", author: "tim", days: -1, hour: 11, title: "Joost spreekt op de Frontend Dag", body: "Joost Meijer is gevraagd als spreker op de Frontend Dag. Hij vertelt daar over toegankelijke componenten. Misschien leuk om iets over te delen?", meta: { people: ["Joost Meijer", "Tim Hoekstra"] } },
    { key: "s15", source: "slack", channel: "#random", author: "joost", days: -1, hour: 12, body: "Iemand zin om vrijdag mee te lunchen bij de nieuwe Italiaan om de hoek?" },
    { key: "s16", source: "jira", channel: "VZG", author: "joost", days: -2, hour: 17, title: "VZG-142: Cliëntenportaal fase 1 - pilot (afgerond)", body: "Epic afgerond in project Veldhuis Zorggroep. De pilot van het cliëntenportaal op twee locaties is technisch afgerond; de toegankelijkheidstoets op WCAG 2.2 AA is behaald.", meta: { customer: "Veldhuis Zorggroep", project: "Cliëntenportaal Mijn Veldhuis", people: ["Joost Meijer"] } },
    { key: "s17", source: "teamleader", channel: "Deals", author: "femke", days: -3, hour: 10, title: "Veldhuis Zorggroep - vervolgopdracht fase 2", body: "Offerte geaccepteerd: Veldhuis Zorggroep geeft akkoord op fase 2 van het cliëntenportaal, de uitrol naar alle locaties.", meta: { customer: "Veldhuis Zorggroep", project: "Cliëntenportaal Mijn Veldhuis", people: ["Femke Mulder"] } },
    // Left unprocessed on purpose: "Bronberichten analyseren" picks this up.
    { key: "s18", source: "slack", channel: "#algemeen", author: "sanne", days: 0, hour: 8, processed: false, body: "We hebben de Dutch Interactive Award gewonnen voor het planningsplatform van Rijnmond Logistiek! De jury prees de eenvoud voor chauffeurs. Trots op iedereen die hieraan heeft meegewerkt." },
  ];
  const S: Record<string, string> = {};
  const userName = (k: UserKey) => USERS.find((u) => u.key === k)!.name;
  for (const s of sources) {
    const occurred = at(s.days, s.hour ?? 10);
    S[s.key] = await insert("source_messages", {
      organization_id: O,
      integration_id: s.source === "manual" ? null : integ(s.source),
      source: s.source,
      external_id: `seed-${s.key}`,
      channel: s.channel,
      author_name: userName(s.author),
      author_profile_id: U[s.author],
      title: s.title ?? null,
      body: s.body,
      metadata: json({ ...(s.meta ?? {}), demo: true }),
      is_demo: true,
      occurred_at: occurred,
      ingested_at: occurred,
      processed_at: s.processed === false ? null : occurred,
    });
  }
  const src = (k: string) => sources.find((s) => s.key === k)!;

  // ---------------------------------------------------------------------------
  // Signals
  // ---------------------------------------------------------------------------
  type Sig = { key: string; title: string; summary: string; category: string; audience: string; agent: "external" | "internal"; score: number; rationale: string; status: string; missing: string[]; action: string; entities: Record<string, unknown>; conf: string; primary: string; related?: string[]; duplicateOf?: string; submittedBy?: UserKey };
  const signals: Sig[] = [
    { key: "g1", title: "Rijnmond Logistiek: planningsplatform live op alle depots", summary: "Het planningsplatform van Rijnmond Logistiek is live op alle 6 depots. In de eerste week kwamen er 32% minder telefoontjes bij de planning binnen.", category: "customer_case", audience: "external", agent: "external", score: 92, rationale: "Concreet klantresultaat met cijfers, bevestigd door een afgeronde Jira-epic en schriftelijke toestemming van de klant.", status: "converted", missing: [], action: "Klantcase uitwerken en publiceren.", entities: { customer: "Rijnmond Logistiek", project: "Planningsplatform", people: ["Tim Hoekstra"] }, conf: "public_ok", primary: "s1", related: ["s2", "s3"] },
    { key: "g2", title: "Brouwerij De Koperen Ketel: nieuwe webshop live", summary: "De nieuwe webshop van Brouwerij De Koperen Ketel is live. In het eerste weekend kwamen er 410 bestellingen binnen en de conversie steeg van 1,8% naar 2,6%.", category: "customer_case", audience: "external", agent: "external", score: 88, rationale: "Livegang met concrete cijfers en een enthousiaste klant; toestemming voor publicatie ontbreekt nog.", status: "converted", missing: ["Toestemming van de klant voor externe publicatie"], action: "Toestemming van de klant vastleggen voordat de klantcase wordt ingepland.", entities: { customer: "Brouwerij De Koperen Ketel", project: "Webshop", people: ["Tim Hoekstra"] }, conf: "needs_permission", primary: "s4", related: ["s5"] },
    { key: "g3", title: "Stichting Lezen Verbindt: voorleesapp opgeleverd", summary: "De voorleesapp van Stichting Lezen Verbindt is opgeleverd. 85 bibliotheken gebruiken de app en er zijn 12.000 voorleesmomenten geregistreerd.", category: "customer_case", audience: "external", agent: "external", score: 84, rationale: "Maatschappelijk verhaal met cijfers; de klant stelt zelf voor om er samen over te communiceren.", status: "needs_info", missing: ["Toestemming van de klant voor externe publicatie", "Quote van een betrokkene"], action: "Laat de externe agent de klantcase oppakken en een interview aanvragen bij de projectleider.", entities: { customer: "Stichting Lezen Verbindt", project: "Voorleesapp", people: ["Tim Hoekstra"] }, conf: "needs_permission", primary: "s6" },
    { key: "g4", title: "Nieuwe collega: Noor Bennani (senior UX-designer)", summary: "Noor Bennani komt het team versterken als senior UX-designer. Ze is gespecialiseerd in toegankelijkheid.", category: "new_employee", audience: "both", agent: "internal", score: 74, rationale: "Nieuwe collega met een relevant specialisme; geschikt voor een voorstelronde en mogelijk employer branding.", status: "converted", missing: ["Korte persoonlijke introductie en foto"], action: "Plan een voorstelronde-interview met de nieuwe collega.", entities: { people: ["Noor Bennani", "Marieke van Dijk"] }, conf: "needs_permission", primary: "s7" },
    { key: "g5", title: "Nieuwe collega: Bram de Groot (DevOps-engineer)", summary: "Bram de Groot is gestart als DevOps-engineer in het platformteam.", category: "new_employee", audience: "internal", agent: "internal", score: 72, rationale: "Nieuwe collega; een voorstelbericht helpt het team om kennis te maken.", status: "converted", missing: [], action: "Voorstelbericht publiceren in de interne nieuwsbrief.", entities: { people: ["Bram de Groot"] }, conf: "internal_only", primary: "s8" },
    { key: "g6", title: "Sprint 48: nul openstaande bugs op productie", summary: "Sprint 48 is afgerond met een record: voor het eerst dit jaar zijn er geen openstaande bugs op productie.", category: "team_achievement", audience: "internal", agent: "internal", score: 66, rationale: "Concrete teamprestatie met een duidelijke mijlpaal.", status: "converted", missing: ["Quote van een betrokkene"], action: "Maak een interne update en vraag een korte reactie van het team.", entities: { people: ["Ruben Visser"] }, conf: "internal_only", primary: "s9" },
    { key: "g7", title: "Kwartaalupdate directie Q3", summary: "De omzet groeide met 11% ten opzichte van vorig jaar en er kwamen 4 nieuwe klanten bij. De focus voor het vierde kwartaal ligt op de zorgsector en toegankelijkheid.", category: "management_update", audience: "internal", agent: "internal", score: 78, rationale: "Update van de directie met cijfers en een duidelijke koers; relevant voor alle collega's.", status: "converted", missing: [], action: "Verwerk dit in de eerstvolgende directie-update.", entities: { people: ["Marieke van Dijk"] }, conf: "internal_only", primary: "s10" },
    { key: "g8", title: "Verhuizing naar de Oudegracht per 1 maart", summary: "Per 1 maart verhuist het kantoor naar de Oudegracht in Utrecht, met meer ruimte voor workshops en een eigen podcaststudio.", category: "organizational_update", audience: "internal", agent: "internal", score: 70, rationale: "Organisatienieuws dat alle collega's raakt.", status: "new", missing: [], action: "Neem dit mee in de interne nieuwsbrief.", entities: { people: ["Sanne de Vries"] }, conf: "internal_only", primary: "s11" },
    { key: "g9", title: "Nieuwe klant: Havenbedrijf Delfzijl B.V.", summary: "Havenbedrijf Delfzijl B.V. kiest voor de bouw van een nieuw klantportaal. Het contract is getekend; de start is in januari.", category: "commercial_update", audience: "both", agent: "external", score: 71, rationale: "Commercieel nieuws met een nieuwe klantnaam; publicatie vereist toestemming.", status: "needs_info", missing: ["Toestemming van de klant voor externe publicatie", "Quote van een betrokkene"], action: "Controleer of het nieuws gedeeld mag worden en bereid een nieuwsbericht voor.", entities: { customer: "Havenbedrijf Delfzijl B.V.", project: "Klantportaal", people: ["Femke Mulder"] }, conf: "needs_permission", primary: "s12" },
    { key: "g10", title: "Livegang Rijnmond Logistiek is rond", summary: "Alle 6 depots draaien op het nieuwe planningsplatform en de klant is tevreden.", category: "customer_case", audience: "external", agent: "external", score: 70, rationale: "Zelfde klant, project en gebeurtenis als een bestaand signaal.", status: "duplicate", missing: [], action: "Samengevoegd met een bestaand signaal; de bron is daar als context toegevoegd.", entities: { customer: "Rijnmond Logistiek", project: "Planningsplatform", people: ["Joost Meijer"] }, conf: "needs_permission", primary: "s13", duplicateOf: "g1" },
    { key: "g11", title: "Joost spreekt op de Frontend Dag", summary: "Joost Meijer is gevraagd als spreker op de Frontend Dag en vertelt over toegankelijke componenten.", category: "team_achievement", audience: "both", agent: "internal", score: 58, rationale: "Zichtbaarheid van een collega als expert; details over datum en sessie ontbreken nog.", status: "needs_info", missing: ["Datum en titel van de sessie", "Quote van een betrokkene"], action: "Vraag de ontbrekende details op en maak een interne update.", entities: { people: ["Joost Meijer", "Tim Hoekstra"] }, conf: "internal_only", primary: "s14", submittedBy: "tim" },
  ];
  const G: Record<string, string> = {};
  for (const g of signals) {
    const detected = addMinutes(new Date(at(src(g.primary).days, src(g.primary).hour ?? 10)), 5).toISOString();
    G[g.key] = await insert("content_signals", {
      organization_id: O,
      title: g.title,
      summary: g.summary,
      category: g.category,
      audience: g.audience,
      suggested_agent: g.agent,
      relevance_score: g.score,
      score_rationale: g.rationale,
      status: g.status,
      missing_information: json(g.missing),
      suggested_action: g.action,
      entities: json(g.entities),
      confidentiality: g.conf,
      duplicate_of_id: g.duplicateOf ? G[g.duplicateOf] : null,
      primary_source_id: S[g.primary],
      submitted_by: g.submittedBy ? U[g.submittedBy] : null,
      detection_provider: "demo",
      is_demo: true,
      detected_at: detected,
      created_at: detected,
    });
    await insertMany("signal_sources", [
      { signal_id: G[g.key], source_message_id: S[g.primary], organization_id: O, relation: "primary" },
      ...(g.related ?? []).map((r) => ({ signal_id: G[g.key], source_message_id: S[r], organization_id: O, relation: "related" })),
    ]);
  }
  // The duplicate's source is attached to the original signal as context.
  await insertMany("signal_sources", [{ signal_id: G.g1, source_message_id: S.s13, organization_id: O, relation: "related" }]);
  await db.from("content_signals").update({ related_signal_ids: [G.g7] }).eq("id", G.g6);
  await db.from("content_signals").update({ related_signal_ids: [G.g6] }).eq("id", G.g7);

  // ---------------------------------------------------------------------------
  // Articles (inserted as drafts; statuses that need approval are set later)
  // ---------------------------------------------------------------------------
  console.log("→ Opportunities, interviews and content");
  const refs = (keys: string[]) =>
    keys.map((k) => {
      const s = src(k);
      const system = { slack: "Slack", jira: "Jira", teamleader: "Teamleader Orbit", email: "E-mail", manual: "Handmatig aangeleverd" }[s.source];
      return { source_message_id: S[k], source: s.source, label: `${system} ${s.channel} - ${userName(s.author)}`, occurred_at: at(s.days, s.hour ?? 10) };
    });
  const sourceTexts = (keys: string[]) => keys.map((k) => `${src(k).title ?? ""} ${src(k).body}`);
  const brandCheck = (html: string, title: string, classification: "internal" | "external", texts: string[]) =>
    json(
      validateBrand({
        html,
        title,
        wordsToAvoid: BRAND.words_to_avoid,
        terminology: BRAND.preferred_terminology,
        classification,
        sourceTexts: [...texts, BRAND.boilerplate],
      }),
    );

  const A: Record<string, string> = {};
  A.a1 = await insert("articles", {
    organization_id: O, title: "Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning", subtitle: "Zes depots, 140 chauffeurs en één app waarin iedereen zijn ritten ziet.",
    body_html: ARTICLE_RIJNMOND, excerpt: "Rijnmond Logistiek verving spreadsheets door een planningsplatform. In de eerste week kwamen er 32% minder telefoontjes bij de planning binnen.",
    content_type: "customer_case", classification: "external", target_audience: "Klanten en relaties", channel: "website", status: "draft", tags: ["klantcase", "logistiek", "planningsplatform"],
    source_refs: json(refs(["s1", "s2", "s3"])), agent_id: org.external, reviewer_id: U.daan, current_version: 2, external_permission: "granted",
    brand_check: brandCheck(ARTICLE_RIJNMOND, "Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning", "external", [...sourceTexts(["s1", "s2", "s3"]), ...INTERVIEW_RIJNMOND.map((q) => q.answer)]),
    generation_provider: "demo", is_demo: true, created_by: U.lotte, created_at: at(-23, 14), author_profile_id: U.lotte,
  });
  A.a2 = await insert("articles", {
    organization_id: O, title: "Klantcase: Brouwerij De Koperen Ketel - nieuwe webshop", subtitle: "Een nieuwe checkout en een koppeling met kassa en voorraad.",
    body_html: ARTICLE_KETEL, excerpt: "De nieuwe webshop van Brouwerij De Koperen Ketel leverde in het eerste weekend 410 bestellingen op.",
    content_type: "customer_case", classification: "external", target_audience: "Klanten en relaties", channel: "website", status: "draft", tags: ["klantcase", "e-commerce"],
    source_refs: json(refs(["s4", "s5"])), agent_id: org.external, reviewer_id: U.daan, current_version: 1, external_permission: "unknown",
    brand_check: brandCheck(ARTICLE_KETEL, "Klantcase: Brouwerij De Koperen Ketel - nieuwe webshop", "external", [...sourceTexts(["s4", "s5"]), ...INTERVIEW_KETEL.map((q) => q.answer)]),
    generation_provider: "demo", is_demo: true, created_by: U.lotte, created_at: at(-8, 10), author_profile_id: U.lotte,
  });
  A.a3 = await insert("articles", {
    organization_id: O, title: "Waarom toegankelijkheid begint bij het ontwerp", subtitle: "Achteraf repareren is duurder dan vooraf goed doen.",
    body_html: ARTICLE_TOEGANKELIJKHEID, excerpt: "Wie in de ontwerpfase rekening houdt met toegankelijkheid, bouwt een beter product voor iedereen.",
    content_type: "website_article", classification: "external", target_audience: "Klanten en relaties", channel: "website", status: "draft", tags: ["toegankelijkheid", "ontwerp"],
    agent_id: org.external, reviewer_id: U.daan, current_version: 1, external_permission: "not_required",
    brand_check: brandCheck(ARTICLE_TOEGANKELIJKHEID, "Waarom toegankelijkheid begint bij het ontwerp", "external", []),
    is_demo: true, created_by: U.lotte, created_at: at(-6, 11), author_profile_id: U.lotte,
  });
  A.a4 = await insert("articles", {
    organization_id: O, title: "Even voorstellen: Noor Bennani", excerpt: "Noor Bennani komt het team versterken als senior UX-designer. Een korte voorstelronde helpt collega's om snel kennis te maken.",
    content_type: "employee_introduction", classification: "internal", target_audience: "Alle medewerkers", channel: "internal_newsletter", status: "interview_requested",
    source_refs: json(refs(["s7"])), agent_id: org.internal, external_permission: "not_required", is_demo: true, created_at: at(-5, 9),
  });
  A.a5 = await insert("articles", {
    organization_id: O, title: "Even voorstellen: Bram de Groot", subtitle: "Onze nieuwe DevOps-engineer in het platformteam.",
    body_html: ARTICLE_BRAM, excerpt: "Bram de Groot is gestart als DevOps-engineer in het platformteam. Tijd om kennis te maken.",
    content_type: "employee_introduction", classification: "internal", target_audience: "Alle medewerkers", channel: "internal_newsletter", status: "draft", tags: ["nieuwe collega", "platformteam"],
    source_refs: json(refs(["s8"])), agent_id: org.internal, reviewer_id: U.daan, current_version: 1, external_permission: "not_required",
    brand_check: brandCheck(ARTICLE_BRAM, "Even voorstellen: Bram de Groot", "internal", [...sourceTexts(["s8"]), ...INTERVIEW_BRAM.map((q) => q.answer)]),
    generation_provider: "demo", is_demo: true, created_at: at(-11, 10),
  });
  A.a6 = await insert("articles", {
    organization_id: O, title: "Nul openstaande bugs op productie", subtitle: "Sprint 48 is afgerond met een record.",
    body_html: ARTICLE_BUGS, excerpt: "Voor het eerst dit jaar staan er geen openstaande bugs op productie.",
    content_type: "internal_update", classification: "internal", target_audience: "Alle medewerkers", channel: "intranet", status: "draft", tags: ["intern", "development"],
    source_refs: json(refs(["s9"])), agent_id: org.internal, current_version: 1, external_permission: "not_required",
    brand_check: brandCheck(ARTICLE_BUGS, "Nul openstaande bugs op productie", "internal", sourceTexts(["s9"])),
    generation_provider: "demo", is_demo: true, created_at: at(-4, 15),
  });
  A.a7 = await insert("articles", {
    organization_id: O, title: "Kwartaalupdate Q3: groei en focus op zorg en toegankelijkheid", subtitle: "Marieke van Dijk blikt terug en kijkt vooruit.",
    body_html: ARTICLE_KWARTAAL, excerpt: "Het derde kwartaal is goed afgesloten: 11% omzetgroei en 4 nieuwe klanten.",
    content_type: "management_update", classification: "internal", target_audience: "Alle medewerkers", channel: "email", status: "draft", tags: ["directie", "kwartaalupdate"],
    source_refs: json(refs(["s10"])), agent_id: org.internal, reviewer_id: U.daan, current_version: 1, external_permission: "not_required",
    brand_check: brandCheck(ARTICLE_KWARTAAL, "Kwartaalupdate Q3: groei en focus op zorg en toegankelijkheid", "internal", [...sourceTexts(["s10"]), ...INTERVIEW_MARIEKE.map((q) => q.answer)]),
    generation_provider: "demo", is_demo: true, created_at: at(-3, 12),
  });
  A.a8 = await insert("articles", {
    organization_id: O, title: "Terugblik op de teamdag in de Biesbosch", subtitle: "Met het hele team het water op.",
    body_html: ARTICLE_TEAMDAG, excerpt: "De jaarlijkse teamdag bracht ons dit keer naar de Biesbosch, in de kano.",
    content_type: "internal_update", classification: "internal", target_audience: "Alle medewerkers", channel: "internal_newsletter", status: "draft", tags: ["teamdag", "intern"],
    agent_id: org.internal, reviewer_id: U.femke, current_version: 1, external_permission: "not_required",
    brand_check: brandCheck(ARTICLE_TEAMDAG, "Terugblik op de teamdag in de Biesbosch", "internal", []),
    is_demo: true, created_by: U.lotte, created_at: at(-5, 16), author_profile_id: U.lotte,
  });

  // ---------------------------------------------------------------------------
  // Opportunities
  // ---------------------------------------------------------------------------
  const stake = (k: UserKey, reason: string) => ({ name: userName(k), role: USERS.find((u) => u.key === k)!.job, profile_id: U[k], reason });
  const P: Record<string, string> = {};
  const opp = async (k: string, row: Omit<Tables["content_opportunities"]["Insert"], "organization_id">) => {
    P[k] = await insert("content_opportunities", { organization_id: O, is_demo: true, ...row });
  };
  await opp("o1", { signal_id: G.g1, title: "Klantcase: Rijnmond Logistiek - Planningsplatform", angle: "Laat zien hoe zes depots van spreadsheets naar één planningsplatform gingen en wat dat opleverde voor planners en chauffeurs.", suggested_content_type: "customer_case", classification: "external", assigned_agent_id: org.external, status: "converted", priority: 95, stakeholders: json([stake("tim", "Kent het project en de klant inhoudelijk"), stake("femke", "Commercieel aanspreekpunt; kan klanttoestemming regelen")]), external_permission: "granted", article_id: A.a1, created_at: at(-24, 12) });
  await opp("o2", { signal_id: G.g2, title: "Klantcase: Brouwerij De Koperen Ketel - Webshop", angle: "Een ambachtelijke brouwerij die met een nieuwe webshop handwerk schrapt en meer verkoopt.", suggested_content_type: "customer_case", classification: "external", assigned_agent_id: org.external, status: "in_progress", priority: 90, stakeholders: json([stake("tim", "Kent het project en de klant inhoudelijk")]), external_permission: "unknown", article_id: A.a2, created_at: at(-9, 11) });
  await opp("o3", { signal_id: G.g3, title: "Klantcase: Stichting Lezen Verbindt - Voorleesapp", angle: "Een maatschappelijk verhaal: 85 bibliotheken en 12.000 voorleesmomenten. De stichting wil er zelf graag samen over communiceren.", suggested_content_type: "customer_case", classification: "external", assigned_agent_id: org.external, status: "proposed", priority: 86, stakeholders: json([stake("tim", "Kent het project en de klant inhoudelijk")]), external_permission: "unknown", created_at: at(-3, 15) });
  await opp("o4", { signal_id: G.g4, title: "Even voorstellen: Noor Bennani", angle: "Een korte voorstelronde helpt collega's om snel kennis te maken met Noor en haar specialisme toegankelijkheid.", suggested_content_type: "employee_introduction", classification: "internal", assigned_agent_id: org.internal, status: "in_progress", priority: 74, stakeholders: json([stake("marieke", "Heeft de komst van Noor aangekondigd")]), external_permission: "not_required", article_id: A.a4, created_at: at(-6, 10) });
  await opp("o5", { signal_id: G.g5, title: "Even voorstellen: Bram de Groot", angle: "Voorstelbericht voor de interne nieuwsbrief.", suggested_content_type: "employee_introduction", classification: "internal", assigned_agent_id: org.internal, status: "converted", priority: 72, stakeholders: json([stake("bram", "De nieuwe collega zelf")]), external_permission: "not_required", article_id: A.a5, created_at: at(-12, 10) });
  await opp("o6", { signal_id: G.g6, title: "Nul openstaande bugs op productie", angle: "Deel deze mijlpaal met alle collega's en laat het team zelf aan het woord.", suggested_content_type: "internal_update", classification: "internal", assigned_agent_id: org.internal, status: "in_progress", priority: 66, stakeholders: json([stake("ruben", "Meldde de mijlpaal; kan een reactie geven namens het team")]), external_permission: "not_required", article_id: A.a6, created_at: at(-5, 17) });
  await opp("o7", { signal_id: G.g7, title: "Kwartaalupdate Q3", angle: "Vertaal de kwartaalupdate naar een heldere update voor alle collega's: wat ging goed en waar ligt de focus.", suggested_content_type: "management_update", classification: "internal", assigned_agent_id: org.internal, status: "in_progress", priority: 78, stakeholders: json([stake("marieke", "Eindverantwoordelijk; geeft richting aan de boodschap")]), external_permission: "not_required", article_id: A.a7, created_at: at(-4, 9) });
  await opp("o8", { signal_id: G.g8, title: "We verhuizen naar de Oudegracht", angle: "Praktische update over de verhuizing: wanneer, wat verandert er en wat kunnen collega's verwachten.", suggested_content_type: "internal_update", classification: "internal", assigned_agent_id: org.internal, status: "proposed", priority: 70, stakeholders: json([stake("sanne", "Kondigde de verhuizing aan")]), external_permission: "not_required", created_at: at(-2, 14) });
  await opp("o9", { signal_id: G.g9, title: "Havenbedrijf Delfzijl kiest voor nieuw klantportaal", angle: "Nieuwsbericht over de nieuwe samenwerking, zodra de klant akkoord is met communicatie.", suggested_content_type: "news_article", classification: "external", assigned_agent_id: org.external, status: "proposed", priority: 71, stakeholders: json([stake("femke", "Commercieel aanspreekpunt; kan klanttoestemming regelen")]), external_permission: "unknown", created_at: at(-1, 16) });
  await opp("o10", { signal_id: G.g11, title: "Joost spreekt op de Frontend Dag", angle: "Interne update: een collega op het podium over toegankelijke componenten.", suggested_content_type: "internal_update", classification: "internal", assigned_agent_id: org.internal, status: "proposed", priority: 58, stakeholders: json([stake("joost", "De spreker zelf")]), external_permission: "not_required", created_at: at(-1, 12) });
  await opp("o11", { signal_id: G.g11, title: "Expertverhaal: toegankelijke componenten bouwen", angle: "Positioneer Joost als expert met een artikel over toegankelijke componenten, gekoppeld aan zijn sessie.", suggested_content_type: "website_article", classification: "external", assigned_agent_id: org.external, referred_by_agent_id: org.internal, status: "proposed", priority: 60, stakeholders: json([stake("joost", "De spreker zelf")]), external_permission: "unknown", created_at: at(-1, 12, 5) });

  for (const [a, o] of [["a1", "o1"], ["a2", "o2"], ["a4", "o4"], ["a5", "o5"], ["a6", "o6"], ["a7", "o7"]] as const) {
    await db.from("articles").update({ opportunity_id: P[o] }).eq("id", A[a]);
  }
  await insertMany("article_signals", [
    { article_id: A.a1, signal_id: G.g1, organization_id: O },
    { article_id: A.a2, signal_id: G.g2, organization_id: O },
    { article_id: A.a4, signal_id: G.g4, organization_id: O },
    { article_id: A.a5, signal_id: G.g5, organization_id: O },
    { article_id: A.a6, signal_id: G.g6, organization_id: O },
    { article_id: A.a7, signal_id: G.g7, organization_id: O },
  ]);

  // ---------------------------------------------------------------------------
  // Interviews with transcripts
  // ---------------------------------------------------------------------------
  const I: Record<string, string> = {};
  type QA = { topic: string; question: string; answer: string };
  const completedInterview = async (k: string, row: Omit<Tables["interviews"]["Insert"], "organization_id" | "questions">, qa: QA[], startDays: number, interviewee: UserKey, followUps: string[], quotes: string[]) => {
    const questions = qa.map((q, i) => ({ id: `q${i + 1}`, text: q.question, topic: q.topic }));
    I[k] = await insert("interviews", {
      organization_id: O, is_demo: true, ...row, questions: json(questions), status: "completed",
      summary: json({
        summary: `Interview met ${row.interviewee_name}${row.interviewee_role ? ` (${row.interviewee_role})` : ""} over: ${row.purpose}. ${qa.length} antwoorden vastgelegd.`,
        key_points: qa.slice(0, 5).map((q) => q.answer.split(/(?<=[.!?])\s/)[0]),
        quotes: quotes.map((text) => ({ text, speaker: row.interviewee_name })),
        follow_ups: followUps,
      }),
      follow_up_actions: json(followUps.map((text, i) => ({ id: `f${i + 1}`, text, done: i === 0 && k !== "i2" }))),
      requested_at: at(startDays - 1, 10), completed_at: at(startDays, 15),
    });
    let minute = 0;
    const messages: Tables["interview_messages"]["Insert"][] = [];
    qa.forEach((q, i) => {
      const prefix = i === 0 ? `Hoi ${row.interviewee_name.split(" ")[0]}, fijn dat je tijd hebt. ` : "Dank je, helder. ";
      messages.push({ organization_id: O, interview_id: I[k], role: "agent", content: `${prefix}${q.question}`, question_id: `q${i + 1}`, created_at: at(startDays, 14, minute++) });
      messages.push({ organization_id: O, interview_id: I[k], role: "interviewee", content: q.answer, author_profile_id: U[interviewee], created_at: at(startDays, 14, minute++) });
    });
    messages.push({ organization_id: O, interview_id: I[k], role: "agent", content: `Dank je wel, ${row.interviewee_name.split(" ")[0]}. Ik verwerk je antwoorden in een samenvatting en een concepttekst; die gaat altijd eerst langs de redactie.`, created_at: at(startDays, 14, minute) });
    await insertMany("interview_messages", messages);
  };

  await completedInterview("i1", { title: "Klantcase Rijnmond Logistiek - planningsplatform", purpose: "het verhaal achter de uitrol van het planningsplatform ophalen voor een klantcase", kind: "customer_case", classification: "external", interviewee_profile_id: U.tim, interviewee_name: "Tim Hoekstra", interviewee_role: "Projectleider", agent_id: org.external, opportunity_id: P.o1, article_id: A.a1, metadata: json({ customer: "Rijnmond Logistiek", project: "Planningsplatform" }), created_by: U.lotte },
    INTERVIEW_RIJNMOND, -22, "tim", ["Quotes laten accorderen door Tim Hoekstra.", "Tekst ter inzage sturen naar Peter van den Berg (Rijnmond Logistiek)."], [INTERVIEW_RIJNMOND[3].answer.split(/(?<=[.!?])\s/)[0], INTERVIEW_RIJNMOND[2].answer.split(/(?<=[.!?])\s/)[0]]);
  await completedInterview("i2", { title: "Klantcase Brouwerij De Koperen Ketel - webshop", purpose: "het verhaal achter de nieuwe webshop ophalen voor een klantcase", kind: "customer_case", classification: "external", interviewee_profile_id: U.tim, interviewee_name: "Tim Hoekstra", interviewee_role: "Projectleider", agent_id: org.external, opportunity_id: P.o2, article_id: A.a2, metadata: json({ customer: "Brouwerij De Koperen Ketel", project: "Webshop" }), created_by: U.lotte },
    INTERVIEW_KETEL, -8, "tim", ["Toestemming voor externe publicatie vastleggen bij Brouwerij De Koperen Ketel.", "Quotes laten accorderen door Tim Hoekstra."], [INTERVIEW_KETEL[3].answer.split(/(?<=[.!?])\s/)[0]]);
  await completedInterview("i3", { title: "Directie-update kwartaal 3", purpose: "de belangrijkste ontwikkelingen vertalen naar een update voor alle collega's", kind: "management", classification: "internal", interviewee_profile_id: U.marieke, interviewee_name: "Marieke van Dijk", interviewee_role: "Algemeen directeur", agent_id: org.internal, opportunity_id: P.o7, article_id: A.a7, created_by: null },
    INTERVIEW_MARIEKE, -3, "marieke", ["Cijfers uit het klantonderzoek opvragen zodra het is afgerond.", "Quotes laten accorderen door Marieke van Dijk."], [INTERVIEW_MARIEKE[1].answer.split(/(?<=[.!?])\s/)[0], INTERVIEW_MARIEKE[4].answer.split(/(?<=[.!?])\s/)[0]]);
  await completedInterview("i5", { title: "Voorstelronde Bram de Groot", purpose: "kennismaken met onze nieuwe DevOps-engineer voor een voorstelbericht", kind: "employee_intro", classification: "internal", interviewee_profile_id: U.bram, interviewee_name: "Bram de Groot", interviewee_role: "DevOps-engineer", agent_id: org.internal, opportunity_id: P.o5, article_id: A.a5, created_by: U.lotte },
    INTERVIEW_BRAM, -11, "bram", ["Foto van Bram opvragen voor bij het bericht."], [INTERVIEW_BRAM[2].answer.split(/(?<=[.!?])\s/)[0]]);

  I.i4 = await insert("interviews", {
    organization_id: O, title: "Voorstelronde Noor Bennani", purpose: "kennismaken met onze nieuwe senior UX-designer voor een voorstelbericht", kind: "employee_intro", classification: "internal",
    interviewee_name: "Noor Bennani", interviewee_role: "Senior UX-designer", status: "scheduled", agent_id: org.internal, opportunity_id: P.o4, article_id: A.a4,
    questions: json([
      { id: "q1", topic: "achtergrond", text: "Kun je jezelf kort voorstellen? Waar kom je vandaan en wat heb je hiervoor gedaan?" },
      { id: "q2", topic: "rol", text: "Wat ga je bij ons doen en waar kunnen collega's je voor benaderen?" },
      { id: "q3", topic: "motivatie", text: "Waarom heb je voor ons gekozen?" },
      { id: "q4", topic: "eerste indruk", text: "Wat is je eerste indruk na je eerste dagen?" },
      { id: "q5", topic: "buiten werk", text: "Wat doe je graag als je niet aan het werk bent?" },
    ]),
    scheduled_at: at(2, 14), requested_at: at(-5, 9), is_demo: true,
  });
  const half = NOW.getDate() < 15 ? "eerste" : "tweede";
  I.i6 = await insert("interviews", {
    organization_id: O, title: `Directie-update ${half} helft ${format(NOW, "MMMM yyyy", { locale: nl })}`, purpose: "De belangrijkste ontwikkelingen van de afgelopen twee weken vertalen naar een update voor alle collega's",
    kind: "management", classification: "internal", interviewee_profile_id: U.marieke, interviewee_name: "Marieke van Dijk", interviewee_role: "Algemeen directeur", status: "scheduled", agent_id: org.internal,
    questions: json([
      { id: "q1", topic: "terugblik", text: "Wat waren de belangrijkste ontwikkelingen van de afgelopen twee weken?" },
      { id: "q2", topic: "prioriteiten", text: "Waar ligt de komende periode de prioriteit en waarom?" },
      { id: "q3", topic: "resultaten", text: "Welke resultaten of cijfers wil je met alle collega's delen?" },
      { id: "q4", topic: "mensen", text: "Welke collega's of teams verdienen een compliment?" },
      { id: "q5", topic: "boodschap", text: "Welke boodschap wil je iedereen meegeven?" },
    ]),
    scheduled_at: at(4, 10), requested_at: at(-1, 9), is_demo: true,
  });
  for (const [a, i] of [["a1", "i1"], ["a2", "i2"], ["a4", "i4"], ["a5", "i5"], ["a7", "i3"]] as const) {
    await db.from("articles").update({ interview_id: I[i] }).eq("id", A[a]);
  }
  // Interviews also count as traceable sources.
  for (const [a, i, who] of [["a1", "i1", "Tim Hoekstra"], ["a2", "i2", "Tim Hoekstra"], ["a5", "i5", "Bram de Groot"], ["a7", "i3", "Marieke van Dijk"]] as const) {
    const { data } = await db.from("articles").select("source_refs").eq("id", A[a]).single();
    await db.from("articles").update({ source_refs: json([...((data?.source_refs as unknown[]) ?? []), { interview_id: I[i], source: "interview", label: `Interview met ${who}` }]) }).eq("id", A[a]);
  }

  // ---------------------------------------------------------------------------
  // Versions, approvals, reviews, comments → final statuses
  // ---------------------------------------------------------------------------
  console.log("→ Versions, approvals and workflow statuses");
  const { data: allArticles } = await db.from("articles").select("id, title, subtitle, body_html, current_version").eq("organization_id", O);
  const art = (k: string) => allArticles!.find((a) => a.id === A[k])!;
  const version = (k: string, v: number, summary: string, days: number, by: { agent?: string; profile?: string }, body?: string) => ({
    organization_id: O, article_id: A[k], version: v, title: art(k).title, subtitle: art(k).subtitle, body_html: body ?? art(k).body_html,
    change_summary: summary, created_by_agent_id: by.agent ?? null, created_by_profile_id: by.profile ?? null, created_at: at(days, 11),
  });
  await insertMany("content_versions", [
    version("a1", 1, "Eerste concept door agent", -21, { agent: org.external }, ARTICLE_RIJNMOND.replace("Het team koos voor een gefaseerde uitrol. ", "")),
    version("a1", 2, "Inleiding aangescherpt en overgang toegevoegd", -20, { profile: U.lotte }),
    version("a2", 1, "Eerste concept door agent", -7, { agent: org.external }),
    version("a3", 1, "Eerste versie", -6, { profile: U.lotte }),
    version("a5", 1, "Eerste concept door agent", -10, { agent: org.internal }),
    version("a6", 1, "Eerste concept door agent", -4, { agent: org.internal }),
    version("a7", 1, "Eerste concept door agent", -2, { agent: org.internal }),
    version("a8", 1, "Eerste versie", -5, { profile: U.lotte }),
  ]);

  const approval = (entityType: string, entityId: string, v: number, decision: string, requestedBy: string, decidedBy: string | null, note: string | null, reqDays: number, decDays: number | null) => ({
    organization_id: O, entity_type: entityType, entity_id: entityId, version: v, decision, requested_by_profile_id: requestedBy, decided_by: decidedBy, decision_note: note,
    requested_at: at(reqDays, 9), decided_at: decDays === null ? null : at(decDays, 16),
  });
  await insertMany("approvals", [
    approval("article", A.a1, 2, "approved", U.lotte, U.daan, "Sterke case. Toestemming van de klant is binnen.", -20, -19),
    approval("article", A.a2, 1, "pending", U.lotte, null, null, -1, null),
    approval("article", A.a3, 1, "changes_requested", U.lotte, U.daan, "Mooi stuk, maar het cijfer van 25% heeft een bron nodig en ‘innovatief’ staat op de lijst met te vermijden woorden.", -5, -4),
    approval("article", A.a5, 1, "approved", U.lotte, U.daan, null, -10, -9),
    approval("article", A.a7, 1, "pending", U.lotte, null, null, -1, null),
    approval("article", A.a8, 1, "approved", U.lotte, U.femke, "Leuk stuk, kan zo mee in de nieuwsbrief.", -4, -3),
  ]);
  await insertMany("reviews", [
    { organization_id: O, article_id: A.a1, version: 2, reviewer_id: U.daan, recommendation: "approve", notes: "Sterke case. Toestemming van de klant is binnen.", created_at: at(-19, 16) },
    { organization_id: O, article_id: A.a2, version: 1, reviewer_id: U.ruben, recommendation: "comment", notes: "De genoemde cijfers komen overeen met wat ik in de analytics zie.", created_at: at(-1, 14) },
    { organization_id: O, article_id: A.a3, version: 1, reviewer_id: U.daan, recommendation: "changes_requested", notes: "Het cijfer van 25% heeft een bron nodig en ‘innovatief’ staat op de lijst met te vermijden woorden.", created_at: at(-4, 16) },
    { organization_id: O, article_id: A.a5, version: 1, reviewer_id: U.daan, recommendation: "approve", notes: null, created_at: at(-9, 16) },
    { organization_id: O, article_id: A.a8, version: 1, reviewer_id: U.femke, recommendation: "approve", notes: "Leuk stuk, kan zo mee in de nieuwsbrief.", created_at: at(-3, 16) },
  ]);
  await insertMany("comments", [
    { organization_id: O, entity_type: "article", entity_id: A.a2, author_agent_id: org.external, body: "Open punten bij dit concept (versie 1):\n• Toestemming van Brouwerij De Koperen Ketel voor externe publicatie is nog niet bevestigd.", created_at: at(-7, 11) },
    { organization_id: O, entity_type: "article", entity_id: A.a2, author_agent_id: org.internal, body: "Antwoord op informatieverzoek van de externe agent (“Zijn er interne cijfers bekend over het aantal bestellingen na de livegang?”):\nOp basis van interne bronnen:\n- In het eerste weekend kwamen er 410 bestellingen binnen en de conversie steeg van 1,8% naar 2,6%. (Slack #project-koperenketel)", created_at: at(-7, 12) },
    { organization_id: O, entity_type: "article", entity_id: A.a2, author_profile_id: U.femke, body: "Ik bel Hanneke morgen voor het akkoord. Tot die tijd niet inplannen.", created_at: at(-1, 15) },
    { organization_id: O, entity_type: "article", entity_id: A.a3, author_profile_id: U.daan, body: "Kun je een bron toevoegen bij het percentage, of de zin herschrijven zonder cijfer?", quote: "Volgens onderzoek heeft 25% van de Nederlanders moeite met digitale diensten.", created_at: at(-4, 16) },
    { organization_id: O, entity_type: "article", entity_id: A.a6, author_agent_id: org.internal, body: "Open punten bij dit concept (versie 1):\n• Er is nog geen interview afgenomen; quotes ontbreken.", created_at: at(-4, 15) },
    { organization_id: O, entity_type: "article", entity_id: A.a1, author_profile_id: U.femke, body: "Peter van den Berg heeft de tekst gelezen en is akkoord.", resolved: true, created_at: at(-19, 11) },
  ]);

  const setStatus = async (k: string, patch: Tables["articles"]["Update"]) => {
    const { error } = await db.from("articles").update(patch).eq("id", A[k]);
    if (error) throw new Error(`status ${k}: ${error.message}`);
  };
  await setStatus("a1", { status: "published", published_at: at(-18, 9), publish_at: at(-18, 9), publication_mode: "simulated" });
  await setStatus("a2", { status: "in_review" });
  await setStatus("a3", { status: "changes_requested" });
  await setStatus("a5", { status: "published", published_at: at(-8, 9), publish_at: at(-8, 9), publication_mode: "simulated" });
  await setStatus("a7", { status: "in_review" });
  await setStatus("a8", { status: "scheduled", publish_at: at(3, 9) });

  // ---------------------------------------------------------------------------
  // Social posts
  // ---------------------------------------------------------------------------
  const p1 = await insert("social_posts", {
    organization_id: O, article_id: A.a1, platform: "linkedin", status: "draft", agent_id: org.external, generation_provider: "demo", is_demo: true, created_at: at(-18, 10),
    body: "Van spreadsheets naar één planningsplatform voor zes depots.\n\nBij Rijnmond Logistiek zien chauffeurs hun ritten nu realtime in een app. In de eerste week kwamen er 32% minder telefoontjes bij de planning binnen.\n\nLees het hele verhaal: [link]\n\n#klantcase #logistiek",
  });
  await insertMany("approvals", [approval("social_post", p1, 1, "approved", U.lotte, U.femke, null, -18, -18)]);
  {
    const { error } = await db.from("social_posts").update({ status: "published", published_at: at(-17, 9), publish_at: at(-17, 9), publication_mode: "simulated" }).eq("id", p1);
    if (error) throw new Error(error.message);
  }
  const p2 = await insert("social_posts", {
    organization_id: O, article_id: A.a2, platform: "linkedin", status: "draft", agent_id: org.external, generation_provider: "demo", is_demo: true, created_at: at(-7, 12),
    body: "Een nieuwe webshop voor Brouwerij De Koperen Ketel.\n\nDe koppeling met kassa en voorraad scheelt handwerk. In het eerste weekend kwamen er 410 bestellingen binnen.\n\nLees het hele verhaal: [link]\n\n#klantcase #ecommerce",
  });

  // ---------------------------------------------------------------------------
  // Newsletters
  // ---------------------------------------------------------------------------
  console.log("→ Newsletters, calendar, agent activity");
  const externalMonth = startOfMonth(new Date(at(-18)));
  const externalLabel = format(externalMonth, "MMMM yyyy", { locale: nl });
  const n1 = await insert("newsletters", {
    organization_id: O, kind: "external", title: `Externe nieuwsbrief ${externalLabel}`, subject: `Noordlicht Digital | Nieuws van ${externalLabel}`, period_month: format(externalMonth, "yyyy-MM-dd"),
    status: "draft", agent_id: org.external, generation_provider: "demo", is_demo: true, created_at: at(-17, 9),
    intro_html: `<p>Beste relatie,</p><p>In deze editie delen we 2 verhalen uit ${externalLabel}. Onder meer: “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning”.</p>`,
    outro_html: "<p>Meer weten of eens sparren over jouw vraagstuk? Neem gerust contact met ons op.</p><p>Hartelijke groet,<br>Team Noordlicht Digital</p>",
  });
  await insertMany("newsletter_items", [
    { organization_id: O, newsletter_id: n1, article_id: A.a1, section: "Klantcases", position: 0 },
    { organization_id: O, newsletter_id: n1, custom_title: "Nieuw: spreekuur toegankelijkheid", custom_summary: "Elke eerste donderdag van de maand kun je bij ons terecht met vragen over digitale toegankelijkheid. Aanmelden kan via je vaste contactpersoon.", section: "Ontwikkelingen", position: 1 },
  ]);
  await insertMany("approvals", [approval("newsletter", n1, 1, "approved", U.lotte, U.femke, "Akkoord voor verzending.", -15, -14)]);
  {
    const { error } = await db.from("newsletters").update({ status: "sent", send_at: at(-13, 9), sent_at: at(-13, 9), send_mode: "simulated" }).eq("id", n1);
    if (error) throw new Error(error.message);
  }

  const internalMonth = startOfMonth(NOW);
  const internalLabel = format(internalMonth, "MMMM yyyy", { locale: nl });
  const n2 = await insert("newsletters", {
    organization_id: O, kind: "internal", title: `Interne nieuwsbrief ${internalLabel}`, subject: `Intern nieuws - ${internalLabel}`, period_month: format(internalMonth, "yyyy-MM-dd"),
    status: "draft", agent_id: org.internal, generation_provider: "demo", is_demo: true, created_at: at(-2, 9),
    intro_html: `<p>Hoi collega's,</p><p>Tijd voor de update van ${internalLabel}: 3 berichten over wat er speelt binnen Noordlicht Digital. Onder meer: “Even voorstellen: Bram de Groot” en “Terugblik op de teamdag in de Biesbosch”.</p>`,
    outro_html: "<p>Heb je zelf nieuws of een mooi verhaal voor de volgende editie? Lever het aan via de Intelligence Inbox.</p><p>Tot de volgende!</p>",
  });
  await insertMany("newsletter_items", [
    { organization_id: O, newsletter_id: n2, article_id: A.a5, section: "Nieuwe collega's", position: 0 },
    { organization_id: O, newsletter_id: n2, article_id: A.a8, section: "Teamnieuws", position: 1 },
    { organization_id: O, newsletter_id: n2, custom_title: "We verhuizen naar de Oudegracht", custom_summary: "Per 1 maart betrekken we het nieuwe kantoor aan de Oudegracht in Utrecht, met meer ruimte voor workshops en een eigen podcaststudio. Binnenkort volgt een rondleiding.", section: "Organisatienieuws", position: 2 },
  ]);

  // ---------------------------------------------------------------------------
  // Calendar
  // ---------------------------------------------------------------------------
  const newsletterDay = setHours(addDays(internalMonth, 24), 9);
  await insertMany("content_calendar", [
    { organization_id: O, title: art("a1").title, entry_type: "article", entity_type: "article", entity_id: A.a1, classification: "external", starts_at: at(-18, 9), status: "done" },
    { organization_id: O, title: art("a5").title, entry_type: "article", entity_type: "article", entity_id: A.a5, classification: "internal", starts_at: at(-8, 9), status: "done" },
    { organization_id: O, title: art("a8").title, entry_type: "article", entity_type: "article", entity_id: A.a8, classification: "internal", starts_at: at(3, 9), status: "planned", created_by: U.femke },
    { organization_id: O, title: "Interview: Noor Bennani", entry_type: "interview", entity_type: "interview", entity_id: I.i4, classification: "internal", starts_at: at(2, 14) },
    { organization_id: O, title: "Interview: Marieke van Dijk", entry_type: "interview", entity_type: "interview", entity_id: I.i6, classification: "internal", starts_at: at(4, 10) },
    { organization_id: O, title: `Interne nieuwsbrief ${internalLabel}`, entry_type: "newsletter", entity_type: "newsletter", entity_id: n2, classification: "internal", starts_at: (newsletterDay < NOW ? addDays(NOW, 5) : newsletterDay).toISOString() },
    { organization_id: O, title: `Externe nieuwsbrief ${externalLabel}`, entry_type: "newsletter", entity_type: "newsletter", entity_id: n1, classification: "external", starts_at: at(-13, 9), status: "done" },
    { organization_id: O, title: "LinkedIn: Van spreadsheets naar één planningsplatform", entry_type: "social_post", entity_type: "social_post", entity_id: p1, classification: "external", starts_at: at(-17, 9), status: "done" },
    { organization_id: O, title: "Deadline: kopij interne nieuwsbrief", entry_type: "deadline", classification: "internal", starts_at: at(6, 17), notes: "Alle bijdragen voor de interne nieuwsbrief aanleveren bij de redactie.", created_by: U.daan },
    { organization_id: O, title: "Deadline: akkoord klantcase Koperen Ketel", entry_type: "deadline", classification: "external", starts_at: at(1, 12), notes: "Femke belt Hanneke Smit voor toestemming.", created_by: U.femke },
  ]);

  // ---------------------------------------------------------------------------
  // Agent runs, tasks, messages
  // ---------------------------------------------------------------------------
  const step = (key: string, label: string, detail: string, tool: string | undefined, days: number, hour: number, status = "completed") => ({ key, label, detail, tool, status, at: at(days, hour) });
  const run = (agent: string | null, pipeline: string, trigger: string, days: number, hour: number, steps: unknown[], output: Record<string, unknown>, extra: Partial<Tables["agent_runs"]["Insert"]> = {}) => ({
    organization_id: O, agent_id: agent, pipeline, trigger, status: "completed", input: json({}), output: json(output), steps: json(steps), ai_provider: "demo",
    started_at: at(days, hour), finished_at: at(days, hour, 1), ...extra,
  });
  await insertMany("agent_runs", [
    run(null, "intelligence", "event", -24, 11, [step("retrieval", "Bronberichten opgehaald", "1 bericht(en)", "read_sources", -24, 11), step("detect", "Signaal gedetecteerd", "“Rijnmond Logistiek: planningsplatform live op alle depots” - relevantie 92, 2 gerelateerde bron(nen), 0 gerelateerd(e) signaal/signalen", "detect_signals", -24, 11)], { processed: 1, signalIds: [G.g1] }),
    run(org.external, "story_evaluation", "event", -24, 12, [step("context", "Context geladen", "3 bron(nen) uit toegestane systemen", "read_sources", -24, 12), step("evaluate", "Verhaal beoordeeld", "Klantcase - prioriteit 95", "evaluate_story", -24, 12), step("opportunity", "Contentkans aangemaakt", "Klantcase: Rijnmond Logistiek - Planningsplatform", "create_opportunity", -24, 12)], { opportunityId: P.o1 }),
    run(null, "intelligence", "event", -23, 9, [step("retrieval", "Bronberichten opgehaald", "1 bericht(en)", "read_sources", -23, 9), step("dedupe", "Duplicaat herkend", "“Livegang Rijnmond Logistiek is rond” hoort bij “Rijnmond Logistiek: planningsplatform live op alle depots”", "enrich_context", -23, 9)], { processed: 1, duplicateSignalIds: [G.g10] }),
    run(org.external, "interview_request", "manual", -23, 14, [step("questions", "Interviewvragen opgesteld", "6 vragen", "generate_interview_questions", -23, 14), step("request", "Interview aangevraagd", "Tim Hoekstra (Projectleider)", "conduct_interview", -23, 14)], { interviewId: I.i1 }, { triggered_by: U.lotte }),
    run(org.external, "content_generation", "manual", -21, 11, [step("material", "Materiaal verzameld", "3 bron(nen), interview met Tim Hoekstra (6 antwoorden)", "read_sources", -21, 11), step("generate", "Concept geschreven", "212 woorden", "generate_content", -21, 11), step("brand", "Merkcontrole uitgevoerd", "Score 100/100, 0 aandachtspunt(en)", "validate_brand", -21, 11)], { articleId: A.a1, version: 1 }, { triggered_by: U.lotte }),
    run(org.internal, "story_evaluation", "event", -12, 10, [step("context", "Context geladen", "1 bron(nen) uit toegestane systemen", "read_sources", -12, 10), step("evaluate", "Verhaal beoordeeld", "Voorstelronde collega - prioriteit 72", "evaluate_story", -12, 10), step("opportunity", "Contentkans aangemaakt", "Even voorstellen: Bram de Groot", "create_opportunity", -12, 10)], { opportunityId: P.o5 }),
    run(null, "intelligence", "event", -9, 10, [step("retrieval", "Bronberichten opgehaald", "1 bericht(en)", "read_sources", -9, 10), step("detect", "Signaal gedetecteerd", "“Brouwerij De Koperen Ketel: nieuwe webshop live” - relevantie 88, 1 gerelateerde bron(nen), 0 gerelateerd(e) signaal/signalen", "detect_signals", -9, 10)], { processed: 1, signalIds: [G.g2] }),
    run(org.external, "info_request", "manual", -7, 12, [step("request", "Informatie opgevraagd bij interne agent", "Zijn er interne cijfers bekend over het aantal bestellingen na de livegang?", "request_internal_info", -7, 12)], {}, { triggered_by: U.lotte }),
    run(org.internal, "info_response", "event", -7, 12, [step("sources", "Interne bronnen geraadpleegd", "2 bron(nen) binnen de toegestane systemen", "read_sources", -7, 12), step("answer", "Verzoek beantwoord", "Op basis van interne bronnen: In het eerste weekend kwamen er 410 bestellingen binnen…", "answer_info_request", -7, 12)], { found: true }),
    run(org.external, "social_posts", "schedule", -6, 9, [step("error", "Run mislukt", "Dit contentitem heeft nog geen tekst.", undefined, -6, 9, "failed")], {}, { status: "failed", error: "Dit contentitem heeft nog geen tekst." }),
    run(org.internal, "content_generation", "manual", -2, 12, [step("material", "Materiaal verzameld", "1 bron(nen), interview met Marieke van Dijk (5 antwoorden)", "read_sources", -2, 12), step("generate", "Concept geschreven", "118 woorden", "generate_content", -2, 12), step("brand", "Merkcontrole uitgevoerd", "Score 100/100, 0 aandachtspunt(en)", "validate_brand", -2, 12)], { articleId: A.a7, version: 1 }, { triggered_by: U.lotte }),
    run(org.internal, "newsletter_preparation", "schedule", -2, 9, [step("select", "Content geselecteerd", `2 goedgekeurd(e) of gepubliceerd(e) item(s) in ${internalLabel}`, "read_sources", -2, 9), step("framing", "Inleiding en afsluiting geschreven", `Intern nieuws - ${internalLabel}`, "prepare_internal_newsletter", -2, 9)], { newsletterId: n2 }),
    run(org.internal, "story_evaluation", "event", -1, 12, [step("evaluate", "Verhaal beoordeeld", "Interne update - prioriteit 58", "evaluate_story", -1, 12), step("opportunity", "Contentkans aangemaakt", "Joost spreekt op de Frontend Dag", "create_opportunity", -1, 12), step("referral", "Doorverwezen naar externe agent", "Mogelijk ook interessant voor extern (zichtbaarheid bij klanten en relaties).", "refer_to_external_agent", -1, 12)], { opportunityId: P.o10, referred: true }),
    run(org.external, "handle_referral", "event", -1, 12, [step("accepted", "Doorverwijzing opgepakt", "Expertverhaal: toegankelijke componenten bouwen", "create_opportunity", -1, 12)], { opportunityId: P.o11 }),
  ]);
  await db.from("agents").update({ last_run_at: at(-1, 12) }).eq("organization_id", O);

  const month = format(NOW, "yyyy-MM");
  const nextHalf = NOW.getDate() < 15 ? { key: `${month}:2`, date: setHours(addDays(startOfMonth(NOW), 14), 8) } : { key: `${format(addDays(startOfMonth(NOW), 32), "yyyy-MM")}:1`, date: setHours(startOfMonth(addDays(startOfMonth(NOW), 32)), 8) };
  const newsletterPrep = setHours(addDays(startOfMonth(NOW), 19), 8);
  await insertMany("agent_tasks", [
    { organization_id: O, agent_id: org.external, type: "prepare_newsletter", title: `Externe nieuwsbrief voorbereiden (${month})`, status: "queued", payload: json({ kind: "external", month: `${month}-01` }), dedupe_key: `newsletter:external:${month}`, scheduled_for: (newsletterPrep < NOW ? addDays(NOW, 1) : newsletterPrep).toISOString() },
    { organization_id: O, agent_id: org.internal, type: "leadership_interview", title: "Directie-interview plannen (volgende periode)", status: "queued", dedupe_key: `leadership:${nextHalf.key}`, scheduled_for: nextHalf.date.toISOString() },
    { organization_id: O, agent_id: org.internal, type: "prepare_newsletter", title: `Interne nieuwsbrief voorbereiden (${month})`, status: "completed", payload: json({ kind: "internal", month: `${month}-01` }), dedupe_key: `newsletter:internal:${month}`, result: json({ newsletterId: n2, itemCount: 2 }), attempts: 1, scheduled_for: at(-2, 9), started_at: at(-2, 9), completed_at: at(-2, 9, 1) },
    { organization_id: O, agent_id: null, type: "process_messages", title: "Nieuwe bronberichten analyseren", status: "completed", dedupe_key: `process:seed`, result: json({ processed: 2, signalIds: [G.g9, G.g11] }), attempts: 1, scheduled_for: at(-1, 16), started_at: at(-1, 16), completed_at: at(-1, 16, 1) },
    { organization_id: O, agent_id: org.external, type: "generate_social_posts", title: "Social posts opstellen bij klantcase", status: "failed", payload: json({ article_id: A.a4 }), attempts: 3, error: "Social posts kunnen alleen worden gemaakt bij externe content.", scheduled_for: at(-6, 9), started_at: at(-6, 9), related_entity_type: "article", related_entity_id: A.a4 },
  ]);

  await insertMany("agent_messages", [
    { organization_id: O, from_agent_id: org.external, to_agent_id: org.internal, type: "info_request", subject: "Aanvullende informatie voor “Klantcase: Brouwerij De Koperen Ketel - nieuwe webshop”", body: "Zijn er interne cijfers bekend over het aantal bestellingen na de livegang?", status: "answered", article_id: A.a2, response: "Op basis van interne bronnen:\n- In het eerste weekend kwamen er 410 bestellingen binnen en de conversie steeg van 1,8% naar 2,6%. (Slack #project-koperenketel)", responded_at: at(-7, 12, 1), created_at: at(-7, 12) },
    { organization_id: O, from_agent_id: org.internal, to_agent_id: org.external, type: "opportunity_referral", subject: "Mogelijk extern verhaal: Joost spreekt op de Frontend Dag", body: "Joost spreekt op de Frontend Dag: mogelijk ook interessant voor extern (zichtbaarheid bij klanten en relaties).", status: "accepted", signal_id: G.g11, opportunity_id: P.o10, response: "Opgepakt als externe contentkans: “Expertverhaal: toegankelijke componenten bouwen”. Externe publicatie vereist nog expliciete toestemming.", responded_at: at(-1, 12, 6), created_at: at(-1, 12, 4) },
    { organization_id: O, from_agent_id: org.internal, to_agent_id: org.external, type: "opportunity_referral", subject: "Mogelijk extern verhaal: Nieuwe collega: Noor Bennani (senior UX-designer)", body: "Nieuwe collega met specialisme toegankelijkheid: mogelijk ook interessant voor extern (employer branding).", status: "open", signal_id: G.g4, opportunity_id: P.o4, created_at: at(-6, 10, 5) },
  ]);

  // ---------------------------------------------------------------------------
  // Shared activity log (audit_logs)
  // ---------------------------------------------------------------------------
  type Log = Tables["audit_logs"]["Insert"];
  const sys = (days: number, hour: number, minute: number, action: string, category: string, summary: string, entityType?: string, entityId?: string, meta: Record<string, unknown> = {}): Log => ({ organization_id: O, actor_type: "system", action, category, summary, entity_type: entityType ?? null, entity_id: entityId ?? null, metadata: json({ demo: true, ...meta }), created_at: at(days, hour, minute) });
  const agentLog = (agent: string, days: number, hour: number, minute: number, action: string, category: string, summary: string, entityType?: string, entityId?: string, requiresApproval = false, meta: Record<string, unknown> = {}): Log => ({ organization_id: O, actor_type: "agent", actor_agent_id: agent, action, category, summary, entity_type: entityType ?? null, entity_id: entityId ?? null, requires_approval: requiresApproval, metadata: json({ demo: true, ai_provider: "demo", ...meta }), created_at: at(days, hour, minute) });
  const userLog = (user: UserKey, days: number, hour: number, minute: number, action: string, category: string, summary: string, entityType?: string, entityId?: string): Log => ({ organization_id: O, actor_type: "user", actor_profile_id: U[user], action, category, summary, entity_type: entityType ?? null, entity_id: entityId ?? null, metadata: json({}), created_at: at(days, hour, minute) });
  const EXT = org.external;
  const INT = org.internal;
  await insertMany("audit_logs", [
    // The complete Rijnmond story: Slack → signal → opportunity → interview → draft → approval → publication.
    sys(-24, 11, 5, "signal.detected", "discovered", "Nieuw signaal uit Slack (#project-rijnmond): “Rijnmond Logistiek: planningsplatform live op alle depots” (relevantie 92).", "signal", G.g1, { source: "slack", related_sources: 2 }),
    agentLog(EXT, -24, 12, 0, "opportunity.created", "discovered", "Contentkans voorgesteld: “Klantcase: Rijnmond Logistiek - Planningsplatform” (Klantcase).", "opportunity", P.o1, false, { sources_used: [S.s1, S.s2, S.s3] }),
    sys(-23, 9, 5, "signal.duplicate", "discovered", "Dubbel signaal herkend: “Livegang Rijnmond Logistiek is rond” is samengevoegd met “Rijnmond Logistiek: planningsplatform live op alle depots”.", "signal", G.g10),
    agentLog(EXT, -23, 14, 0, "article.created", "performed", "Contentitem gestart vanuit kans “Klantcase: Rijnmond Logistiek - Planningsplatform” (status: Onderzoek).", "article", A.a1),
    agentLog(EXT, -23, 14, 2, "interview.requested", "requested", "Interview aangevraagd bij Tim Hoekstra (Projectleider): “Klantcase Rijnmond Logistiek - planningsplatform” met 6 voorbereide vragen.", "interview", I.i1),
    agentLog(EXT, -22, 15, 0, "interview.completed", "generated", "Interview met Tim Hoekstra afgerond en samengevat (5 kernpunten, 2 quotes).", "interview", I.i1),
    agentLog(EXT, -21, 11, 1, "article.draft_generated", "generated", "Concept geschreven voor “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning” (versie 1, merkscore 100/100). Wacht op review en menselijke goedkeuring.", "article", A.a1, true, { sources_used: [S.s1, S.s2, S.s3], interview_id: I.i1 }),
    userLog("lotte", -20, 11, 0, "article.saved", "performed", "Versie 2 opgeslagen van “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning”.", "article", A.a1),
    userLog("lotte", -20, 11, 5, "article.submitted", "approval", "“Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning” (versie 2) ingediend ter review.", "article", A.a1),
    userLog("femke", -19, 11, 0, "article.external_permission", "approval", "Toestemming voor externe publicatie van “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning” gezet op: granted. Toelichting: schriftelijk akkoord van Peter van den Berg.", "article", A.a1),
    userLog("daan", -19, 16, 0, "article.approved", "approval", "“Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning” (versie 2) goedgekeurd. Toelichting: Sterke case. Toestemming van de klant is binnen.", "article", A.a1),
    userLog("femke", -19, 16, 30, "article.scheduled", "performed", "Publicatie van “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning” ingepland.", "article", A.a1),
    sys(-18, 9, 0, "article.published", "performed", "Geplande publicatie uitgevoerd: “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning”. Geen CMS verbonden: publicatie is gesimuleerd en alleen in de hub vastgelegd.", "article", A.a1, { mode: "simulated" }),
    agentLog(EXT, -18, 10, 0, "social.drafted", "generated", "1 social-concept(en) gemaakt bij “Klantcase: Rijnmond Logistiek - 32% minder telefoontjes naar de planning”. Plaatsen kan alleen na menselijke goedkeuring.", "article", A.a1, true),
    agentLog(EXT, -17, 9, 0, "newsletter.prepared", "generated", `Externe nieuwsbrief voor ${externalLabel} voorbereid met 1 item(s). Verzenden kan alleen na menselijke goedkeuring.`, "newsletter", n1, true),
    userLog("femke", -14, 16, 0, "newsletter.approved", "approval", `“Externe nieuwsbrief ${externalLabel}” goedgekeurd.`, "newsletter", n1),
    userLog("femke", -13, 9, 0, "newsletter.sent", "performed", `“Externe nieuwsbrief ${externalLabel}” gemarkeerd als verzonden - gesimuleerd, er is geen e-mailkoppeling.`, "newsletter", n1),
    // Internal agent: new colleague
    sys(-12, 9, 5, "signal.detected", "discovered", "Nieuw signaal uit Slack (#algemeen): “Nieuwe collega: Bram de Groot (DevOps-engineer)” (relevantie 72).", "signal", G.g5),
    agentLog(INT, -12, 10, 0, "opportunity.created", "discovered", "Contentkans voorgesteld: “Even voorstellen: Bram de Groot” (Voorstelronde collega).", "opportunity", P.o5),
    agentLog(INT, -11, 15, 0, "interview.completed", "generated", "Interview met Bram de Groot afgerond en samengevat (5 kernpunten, 1 quotes).", "interview", I.i5),
    agentLog(INT, -10, 11, 0, "article.draft_generated", "generated", "Concept geschreven voor “Even voorstellen: Bram de Groot” (versie 1, merkscore 100/100). Wacht op review en menselijke goedkeuring.", "article", A.a5, true),
    userLog("daan", -9, 16, 0, "article.approved", "approval", "“Even voorstellen: Bram de Groot” (versie 1) goedgekeurd.", "article", A.a5),
    // Koperen Ketel
    sys(-9, 10, 5, "signal.detected", "discovered", "Nieuw signaal uit Slack (#project-koperenketel): “Brouwerij De Koperen Ketel: nieuwe webshop live” (relevantie 88).", "signal", G.g2, { related_sources: 1 }),
    agentLog(EXT, -9, 11, 0, "opportunity.created", "discovered", "Contentkans voorgesteld: “Klantcase: Brouwerij De Koperen Ketel - Webshop” (Klantcase). Toestemming voor externe publicatie is nog niet geverifieerd.", "opportunity", P.o2, true),
    agentLog(EXT, -8, 15, 0, "interview.completed", "generated", "Interview met Tim Hoekstra afgerond en samengevat (5 kernpunten, 1 quotes).", "interview", I.i2),
    agentLog(EXT, -7, 11, 0, "article.draft_generated", "generated", "Concept geschreven voor “Klantcase: Brouwerij De Koperen Ketel - nieuwe webshop” (versie 1, merkscore 100/100). Wacht op review en menselijke goedkeuring.", "article", A.a2, true),
    agentLog(EXT, -7, 12, 0, "agent.info_requested", "requested", "Aanvullende informatie gevraagd aan de Interne Communicatie-agent: “Zijn er interne cijfers bekend over het aantal bestellingen na de livegang?”", "article", A.a2),
    agentLog(INT, -7, 12, 1, "agent.info_answered", "handoff", "Informatieverzoek van de Externe Communicatie-agent beantwoord met 2 interne bron(nen).", "article", A.a2, false, { sources_used: [S.s4, S.s5] }),
    userLog("daan", -4, 16, 0, "article.changes_requested", "approval", "“Waarom toegankelijkheid begint bij het ontwerp” (versie 1) teruggestuurd met wijzigingsverzoek.", "article", A.a3),
    sys(-4, 8, 5, "signal.detected", "discovered", "Nieuw signaal uit e-mail (nieuws@noordlicht.example): “Kwartaalupdate directie Q3” (relevantie 78).", "signal", G.g7),
    agentLog(INT, -3, 15, 0, "interview.completed", "generated", "Interview met Marieke van Dijk afgerond en samengevat (5 kernpunten, 2 quotes).", "interview", I.i3),
    sys(-3, 14, 5, "signal.detected", "discovered", "Nieuw signaal uit Slack (#project-lezenverbindt): “Stichting Lezen Verbindt: voorleesapp opgeleverd” (relevantie 84).", "signal", G.g3),
    agentLog(EXT, -3, 15, 0, "opportunity.created", "discovered", "Contentkans voorgesteld: “Klantcase: Stichting Lezen Verbindt - Voorleesapp” (Klantcase). Toestemming voor externe publicatie is nog niet geverifieerd.", "opportunity", P.o3, true),
    userLog("femke", -3, 16, 0, "article.approved", "approval", "“Terugblik op de teamdag in de Biesbosch” (versie 1) goedgekeurd.", "article", A.a8),
    agentLog(INT, -2, 9, 1, "newsletter.prepared", "generated", `Interne nieuwsbrief voor ${internalLabel} voorbereid met 2 item(s). Verzenden kan alleen na menselijke goedkeuring.`, "newsletter", n2, true),
    agentLog(INT, -2, 12, 1, "article.draft_generated", "generated", "Concept geschreven voor “Kwartaalupdate Q3: groei en focus op zorg en toegankelijkheid” (versie 1, merkscore 100/100). Wacht op review en menselijke goedkeuring.", "article", A.a7, true),
    sys(-2, 13, 5, "signal.detected", "discovered", "Nieuw signaal uit Slack (#algemeen): “Verhuizing naar de Oudegracht per 1 maart” (relevantie 70).", "signal", G.g8),
    userLog("lotte", -1, 9, 0, "article.submitted", "approval", "“Kwartaalupdate Q3: groei en focus op zorg en toegankelijkheid” (versie 1) ingediend ter review.", "article", A.a7),
    userLog("lotte", -1, 9, 5, "article.submitted", "approval", "“Klantcase: Brouwerij De Koperen Ketel - nieuwe webshop” (versie 1) ingediend ter review.", "article", A.a2),
    agentLog(INT, -1, 9, 10, "interview.requested", "requested", "Interview aangevraagd bij Marieke van Dijk (Algemeen directeur) voor de directie-update met 5 voorbereide vragen.", "interview", I.i6),
    sys(-1, 11, 5, "signal.detected", "discovered", "Nieuw signaal uit een handmatige inzending: “Joost spreekt op de Frontend Dag” (relevantie 58).", "signal", G.g11),
    agentLog(INT, -1, 12, 4, "agent.referral", "handoff", "Verhaal aangedragen bij de Externe Communicatie-agent: “Joost spreekt op de Frontend Dag”.", "signal", G.g11),
    agentLog(EXT, -1, 12, 6, "agent.referral_accepted", "handoff", "Doorverwijzing van de interne agent opgepakt als externe kans: “Expertverhaal: toegankelijke componenten bouwen”. Toestemming voor externe publicatie moet nog worden bevestigd.", "opportunity", P.o11, true),
    sys(-1, 15, 5, "signal.detected", "discovered", "Nieuw signaal uit Teamleader Orbit (Deals): “Nieuwe klant: Havenbedrijf Delfzijl B.V.” (relevantie 71).", "signal", G.g9),
    agentLog(EXT, -1, 16, 0, "opportunity.created", "discovered", "Contentkans voorgesteld: “Havenbedrijf Delfzijl kiest voor nieuw klantportaal” (Nieuwsbericht). Toestemming voor externe publicatie is nog niet geverifieerd.", "opportunity", P.o9, true),
  ]);

  // ---------------------------------------------------------------------------
  // Redactie: people, projects, channels, groups, rhythms and flows in progress
  // ---------------------------------------------------------------------------
  console.log("→ Redactie (rollen, projecten, kanalen, ritmes, lopende goedkeuringen)");
  await seedRedactie({ db, orgId: O, users: U, articles: A, opportunities: P, signals: G, socialPostInReview: p2 });

  // ---------------------------------------------------------------------------
  // Second organization: used to verify tenant isolation
  // ---------------------------------------------------------------------------
  console.log("→ Second organization (isolation check)");
  const other = await createOrganization(OTHER_ORG.name, OTHER_ORG.slug);
  const otherAdmin = await createUser(other.orgId, other.roleId("administrator"), { email: OTHER_ORG.admin.email, name: OTHER_ORG.admin.name, job: "Beheerder", color: "violet" });
  const otherSource = await insert("source_messages", { organization_id: other.orgId, source: "manual", external_id: "seed-other-1", channel: "Handmatige inzending", author_name: OTHER_ORG.admin.name, author_profile_id: otherAdmin, title: "Vertrouwelijk: nieuw product", body: "Dit bericht hoort bij een andere organisatie en mag nooit zichtbaar zijn voor Noordlicht Digital.", processed_at: NOW.toISOString(), is_demo: true });
  await insert("content_signals", { organization_id: other.orgId, title: "Signaal van een andere organisatie", summary: "Alleen zichtbaar binnen Andere Organisatie BV.", category: "other", audience: "internal", suggested_agent: "internal", relevance_score: 50, primary_source_id: otherSource, is_demo: true });
  await insert("articles", { organization_id: other.orgId, title: "Artikel van een andere organisatie", body_html: "<p>Alleen zichtbaar binnen Andere Organisatie BV.</p>", content_type: "internal_update", classification: "internal", status: "draft", agent_id: other.internal, created_by: otherAdmin, author_profile_id: otherAdmin });

  console.log("\n✓ Demo data geladen.");
  console.log(`  Organisatie: Noordlicht Digital (${USERS.length} gebruikers)`);
  console.log(`  Inloggen:    ${USERS[0].email} / ${DEMO_PASSWORD}`);
  console.log(`  Signalen: ${signals.length} · Contentitems: ${Object.keys(A).length} · Interviews: ${Object.keys(I).length} · Nieuwsbrieven: 2`);
}

main().catch((error) => {
  console.error("\n✗ Seed mislukt:", error.message);
  process.exit(1);
});
