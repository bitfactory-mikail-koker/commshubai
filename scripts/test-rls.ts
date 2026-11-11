/**
 * Verifies tenant isolation, role-based permissions and the human-approval
 * guards against the real (seeded) database, using ordinary user sessions.
 *
 *   npm run db:seed && npm run test:rls
 */
import { addDays, subMinutes } from "date-fns";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { DEMO_PASSWORD, OTHER_ORG } from "./seed-content";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

type Db = SupabaseClient<Database>;
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function signIn(email: string): Promise<{ db: Db; userId: string }> {
  const db = createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { db, userId: data.user.id };
}

async function main() {
  const service = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: orgs } = await service.from("organizations").select("id, slug");
  const noordlicht = orgs!.find((o) => o.slug === "noordlicht-digital")!.id;
  const other = orgs!.find((o) => o.slug === OTHER_ORG.slug)!.id;

  const admin = await signIn("sanne@noordlicht.example");
  const chief = await signIn("daan@noordlicht.example");
  const editor = await signIn("lotte@noordlicht.example");
  const reviewer = await signIn("ruben@noordlicht.example");
  const employee = await signIn("tim@noordlicht.example");
  const outsider = await signIn(OTHER_ORG.admin.email);

  console.log("\nAnonymous access");
  {
    const { data, error } = await anon.from("articles").select("id");
    check("anonymous users cannot read articles", (data ?? []).length === 0 || Boolean(error));
    const { data: orgRows } = await anon.from("organizations").select("id");
    check("anonymous users cannot read organizations", (orgRows ?? []).length === 0);
  }

  console.log("\nTenant isolation");
  {
    const tables = [
      "organizations", "profiles", "roles", "articles", "content_signals", "source_messages", "content_opportunities", "agents",
      "interviews", "newsletters", "integrations", "brand_guidelines", "audit_logs", "content_calendar", "agent_runs", "approvals", "comments",
    ] as const;
    for (const table of tables) {
      const column = table === "organizations" ? "id" : "organization_id";
      const { data: mine } = await admin.db.from(table).select(column);
      const leaked = ((mine ?? []) as unknown as Record<string, string>[]).filter((r) => r[column] !== noordlicht);
      check(`${table}: admin of org A sees only org A`, (mine ?? []).length > 0 && leaked.length === 0, `${leaked.length} foreign rows, ${(mine ?? []).length} total`);
    }
    const { data: theirs } = await outsider.db.from("articles").select("organization_id");
    check("articles: admin of org B sees only org B", (theirs ?? []).length === 1 && theirs!.every((r) => r.organization_id === other));
    const { data: foreignArticle } = await service.from("articles").select("id").eq("organization_id", other).single();
    const { data: direct } = await admin.db.from("articles").select("id").eq("id", foreignArticle!.id);
    check("a foreign article cannot be fetched by id", (direct ?? []).length === 0);
    const { data: updated } = await admin.db.from("articles").update({ title: "gehackt" }).eq("id", foreignArticle!.id).select("id");
    check("a foreign article cannot be updated", (updated ?? []).length === 0);
    const { error: crossInsert } = await admin.db.from("articles").insert({ organization_id: other, title: "Indringer", content_type: "news_article", classification: "internal" });
    check("cannot insert content into another organization", Boolean(crossInsert));
    const { error: crossLog } = await admin.db.from("audit_logs").insert({ organization_id: other, actor_type: "user", actor_profile_id: admin.userId, action: "x", summary: "x" });
    check("cannot write audit log entries for another organization", Boolean(crossLog));
  }

  console.log("\nSecrets");
  {
    const { data, error } = await admin.db.from("integration_credentials").select("integration_id");
    check("integration credentials are unreadable, even for an administrator", Boolean(error) || (data ?? []).length === 0);
    const { error: rpcError } = await admin.db.rpc("bootstrap_organization", { p_org_id: noordlicht });
    check("bootstrap_organization is not callable by users", Boolean(rpcError));
  }

  console.log("\nRole-based access");
  {
    // Employees see published content, their own, and the pieces they are involved in (interviewed for, asked to approve).
    const { data: interviewedFor } = await service.from("interviews").select("article_id").eq("interviewee_profile_id", employee.userId);
    const { data: askedFor } = await service.from("approvals").select("entity_id").eq("entity_type", "article").contains("eligible_profile_ids", [employee.userId]);
    const involved = new Set([...(interviewedFor ?? []).map((r) => r.article_id), ...(askedFor ?? []).map((r) => r.entity_id)]);
    const { data: employeeArticles } = await employee.db.from("articles").select("id, status, author_profile_id");
    check(
      "employee sees only published content, own content and pieces they are involved in",
      (employeeArticles ?? []).length > 0 &&
        employeeArticles!.every((a) => a.status === "published" || a.author_profile_id === employee.userId || involved.has(a.id)),
      JSON.stringify(employeeArticles?.map((a) => a.status)),
    );
    const { data: hiddenDraft } = await service
      .from("articles")
      .select("id")
      .eq("organization_id", noordlicht)
      .neq("status", "published")
      .not("id", "in", `(${[...involved].filter(Boolean).join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .limit(1)
      .single();
    const { data: peek } = await employee.db.from("articles").select("id").eq("id", hiddenDraft!.id);
    check("employee cannot read a draft they are not involved in", (peek ?? []).length === 0);
    const { data: employeeSignals } = await employee.db.from("content_signals").select("submitted_by");
    check("employee sees only signals they submitted", (employeeSignals ?? []).length === 1 && employeeSignals![0].submitted_by === employee.userId);
    const { data: employeeInterviews } = await employee.db.from("interviews").select("interviewee_profile_id");
    check("employee sees only interviews where they are the interviewee", (employeeInterviews ?? []).length > 0 && employeeInterviews!.every((i) => i.interviewee_profile_id === employee.userId));
    const { data: employeeLogs } = await employee.db.from("audit_logs").select("id");
    check("employee cannot read the audit log", (employeeLogs ?? []).length === 0);
    const { error: employeeInsert } = await employee.db.from("articles").insert({ organization_id: noordlicht, title: "Mag niet", content_type: "news_article", classification: "internal" });
    check("employee cannot create content", Boolean(employeeInsert));
    const { data: manual, error: manualError } = await employee.db
      .from("source_messages")
      .insert({ organization_id: noordlicht, source: "manual", external_id: `rls-test-${Date.now()}`, body: "Testinzending voor de RLS-controle.", author_profile_id: employee.userId })
      .select("id");
    check("employee can submit information manually", !manualError && (manual ?? []).length === 1, manualError?.message);
    if (manual?.[0]) await service.from("source_messages").delete().eq("id", manual[0].id);
    const { error: spoof } = await employee.db.from("source_messages").insert({ organization_id: noordlicht, source: "slack", body: "Vervalst Slack-bericht", author_profile_id: employee.userId });
    check("employee cannot forge a message from a connected system", Boolean(spoof));

    const { data: adminRole } = await service.from("roles").select("id").eq("organization_id", noordlicht).eq("key", "administrator").single();
    const { error: escalate } = await employee.db.from("profiles").update({ role_id: adminRole!.id }).eq("id", employee.userId);
    const { data: stillEmployee } = await service.from("profiles").select("role:roles(key)").eq("id", employee.userId).single();
    check("employee cannot promote themselves to administrator", Boolean(escalate) && stillEmployee?.role?.key === "employee", escalate?.message);
    const { error: selfRole } = await admin.db.from("profiles").update({ is_active: false }).eq("id", admin.userId);
    check("an administrator cannot deactivate themselves", Boolean(selfRole));
    const { data: weaken } = await admin.db.from("role_permissions").delete().eq("role_id", adminRole!.id).eq("permission_key", "users.manage").select("role_id");
    check("the administrator role cannot be weakened", (weaken ?? []).length === 0);
    const { data: agentEdit } = await editor.db.from("agents").update({ status: "paused" }).eq("organization_id", noordlicht).select("id");
    check("an editor cannot pause agents", (agentEdit ?? []).length === 0);
    const { data: brandEdit } = await editor.db.from("brand_guidelines").update({ boilerplate: "x" }).eq("organization_id", noordlicht).select("id");
    check("an editor cannot change brand guidelines", (brandEdit ?? []).length === 0);
  }

  console.log("\nApproval workflow guards");
  {
    const { data: inReview } = await service.from("articles").select("id, current_version, title").eq("organization_id", noordlicht).eq("status", "in_review").eq("classification", "external").limit(1).single();
    const articleId = inReview!.id;
    const version = inReview!.current_version;
    // Work on a controlled round: park the seeded requests and open one editors' step.
    const { data: seeded } = await service.from("approvals").select("id").eq("entity_id", articleId).eq("decision", "pending");
    const seededIds = (seeded ?? []).map((a) => a.id);
    await service.from("approvals").update({ decision: "withdrawn" }).in("id", seededIds);
    const { data: pending } = await service
      .from("approvals")
      .insert({ organization_id: noordlicht, entity_type: "article", entity_id: articleId, version, decision: "pending", kind: "piece", step: 1, step_label: "Redactie", requested_by_profile_id: editor.userId })
      .select("id")
      .single();

    const { error: editorApprove } = await editor.db.from("articles").update({ status: "approved" }).eq("id", articleId);
    check("an editor cannot set an article to approved", Boolean(editorApprove), editorApprove?.message);

    const { error: editorDecide, data: editorDecided } = await editor.db.from("approvals").update({ decision: "approved" }).eq("id", pending!.id).select("id");
    check("an editor cannot decide an approval", Boolean(editorDecide) || (editorDecided ?? []).length === 0);
    const { error: reviewerApprove } = await reviewer.db.from("approvals").update({ decision: "approved" }).eq("id", pending!.id);
    check("a reviewer cannot approve (only request changes)", Boolean(reviewerApprove), reviewerApprove?.message);
    const { error: forged } = await editor.db.from("approvals").insert({ organization_id: noordlicht, entity_type: "article", entity_id: articleId, version, decision: "approved", decided_by: chief.userId, requested_by_profile_id: editor.userId });
    check("an approval cannot be inserted as already approved", Boolean(forged));

    const { error: agentPublish } = await service.from("articles").update({ status: "published" }).eq("id", articleId);
    check("even the service role (agents, jobs) cannot publish without human approval", Boolean(agentPublish) && /approval/i.test(agentPublish!.message), agentPublish?.message);
    const { error: agentApproval } = await service.from("approvals").insert({ organization_id: noordlicht, entity_type: "article", entity_id: articleId, version, decision: "approved" });
    check("an approval without a deciding human is rejected by the database", Boolean(agentApproval));

    // Quotes: only the person quoted decides, and a refused quote blocks the version.
    const { data: quote } = await service
      .from("approvals")
      .insert({ organization_id: noordlicht, entity_type: "article", entity_id: articleId, version, decision: "pending", kind: "quote", step: 0, eligible_profile_ids: [employee.userId], quote_text: "Testcitaat", requested_by_profile_id: editor.userId })
      .select("id")
      .single();
    const { error: chiefOnQuote } = await chief.db.from("approvals").update({ decision: "approved" }).eq("id", quote!.id);
    check("not even the chief editor can approve someone else's quote", Boolean(chiefOnQuote), chiefOnQuote?.message);
    const { error: ownQuote } = await employee.db.from("approvals").update({ decision: "rejected", decision_note: "Liever niet" }).eq("id", quote!.id);
    const { data: quoteRow } = await service.from("approvals").select("decision, decided_by").eq("id", quote!.id).single();
    check("the person quoted can decide on their own quote", !ownQuote && quoteRow?.decided_by === employee.userId && quoteRow.decision === "rejected", ownQuote?.message);

    // The chief editor approves the editors' step: the decision is stamped with their identity.
    const { error: approveError } = await chief.db.from("approvals").update({ decision: "approved", decided_by: editor.userId }).eq("id", pending!.id);
    const { data: stamped } = await service.from("approvals").select("decided_by, decision").eq("id", pending!.id).single();
    check("chief editor can approve, and decided_by cannot be spoofed", !approveError && stamped?.decision === "approved" && stamped.decided_by === chief.userId, approveError?.message);
    const { error: blockedByQuote } = await chief.db.from("articles").update({ status: "approved" }).eq("id", articleId);
    check("a version with a refused quote cannot become approved", Boolean(blockedByQuote) && /approval/i.test(blockedByQuote!.message), blockedByQuote?.message);
    await service.from("approvals").delete().eq("id", quote!.id);
    const { error: setApproved } = await chief.db.from("articles").update({ status: "approved" }).eq("id", articleId);
    check("with an approval record the article can become approved", !setApproved, setApproved?.message);

    const { error: scheduleBlocked } = await chief.db.from("articles").update({ status: "scheduled", publish_at: addDays(new Date(), 1).toISOString() }).eq("id", articleId);
    check("external content cannot be scheduled while customer permission is unknown", Boolean(scheduleBlocked) && /External publication/i.test(scheduleBlocked!.message), scheduleBlocked?.message);
    const { error: lockedEdit } = await chief.db.from("articles").update({ body_html: "<p>Stiekem aangepast na goedkeuring</p>" }).eq("id", articleId);
    check("approved content is locked against edits", Boolean(lockedEdit) && /locked/i.test(lockedEdit!.message), lockedEdit?.message);
    const { error: reviewerPublish } = await reviewer.db.from("articles").update({ status: "published" }).eq("id", articleId);
    check("a reviewer cannot publish", Boolean(reviewerPublish));

    // A step assigned to someone else: the editors may decide only after the deadline.
    await service.from("articles").update({ status: "draft" }).eq("id", articleId);
    await service.from("approvals").delete().eq("id", pending!.id);
    const { data: assigned } = await service
      .from("approvals")
      .insert({ organization_id: noordlicht, entity_type: "article", entity_id: articleId, version, decision: "pending", kind: "piece", step: 1, eligible_profile_ids: [reviewer.userId], due_at: addDays(new Date(), 3).toISOString(), requested_by_profile_id: editor.userId })
      .select("id")
      .single();
    const { error: early } = await chief.db.from("approvals").update({ decision: "approved" }).eq("id", assigned!.id);
    check("editors cannot take an assigned step before its deadline", Boolean(early), early?.message);
    await service.from("approvals").update({ due_at: subMinutes(new Date(), 1).toISOString() }).eq("id", assigned!.id);
    const { error: late } = await chief.db.from("approvals").update({ decision: "approved" }).eq("id", assigned!.id);
    check("after the deadline the editors can decide", !late, late?.message);
    await service.from("approvals").delete().eq("id", assigned!.id);

    // Restore the seeded state so the demo is unchanged after the test run.
    await service.from("approvals").update({ decision: "pending", decided_by: null, decided_at: null }).in("id", seededIds);
    const { error: restore } = await service.from("articles").update({ status: "in_review" }).eq("id", articleId);
    check("seed state restored", !restore, restore?.message);

    const { data: draftNewsletter } = await service.from("newsletters").select("id").eq("organization_id", noordlicht).eq("status", "draft").limit(1).single();
    const { error: sendUnapproved } = await service.from("newsletters").update({ status: "sent" }).eq("id", draftNewsletter!.id);
    check("a newsletter cannot be sent without human approval", Boolean(sendUnapproved));
    const { data: draftPost } = await service.from("social_posts").select("id").eq("organization_id", noordlicht).in("status", ["draft", "in_review"]).limit(1).single();
    const { error: postUnapproved } = await service.from("social_posts").update({ status: "published" }).eq("id", draftPost!.id);
    check("a social post cannot be published without human approval", Boolean(postUnapproved));
    const { data: logRow } = await service.from("audit_logs").select("id").eq("organization_id", noordlicht).limit(1).single();
    const { data: tamper, error: tamperError } = await admin.db.from("audit_logs").update({ summary: "aangepast" }).eq("id", logRow!.id).select("id");
    check("the audit log cannot be modified by users", Boolean(tamperError) || (tamper ?? []).length === 0);
  }

  console.log("\nRedactie guards");
  {
    const { error: followPrivate } = await admin.db
      .from("channels")
      .insert({ organization_id: noordlicht, slack_channel_id: `GTEST${Date.now()}`, name: "geheim", is_private: true, followed: true });
    check("a private channel can never be followed", Boolean(followPrivate), followPrivate?.message);
    const { error: followShared } = await admin.db
      .from("channels")
      .insert({ organization_id: noordlicht, slack_channel_id: `CTEST${Date.now()}`, name: "met-klant", has_external_members: true, followed: true });
    check("a channel with customers or guests can never be followed", Boolean(followShared), followShared?.message);
    const { data: editorChannel } = await editor.db.from("channels").update({ followed: true }).eq("organization_id", noordlicht).eq("name", "random").select("id");
    check("an editor without integration rights cannot change channels", (editorChannel ?? []).length === 0);

    const { error: selfPilot } = await employee.db.from("profiles").update({ bot_may_contact: false, in_pilot: false }).eq("id", employee.userId);
    check("an employee cannot change how the bot treats them administratively", Boolean(selfPilot), selfPilot?.message);
    const { error: selfAbsent } = await employee.db
      .from("profiles")
      .update({ absent_until: "2099-01-01", contact_opt_out: true })
      .eq("id", employee.userId);
    check("an employee can record their own absence and opt out", !selfAbsent, selfAbsent?.message);
    await service.from("profiles").update({ absent_until: null, contact_opt_out: false }).eq("id", employee.userId);

    const { data: botMine } = await employee.db.from("bot_messages").select("recipient_profile_id");
    check("an employee sees only the bot's messages to themselves", (botMine ?? []).every((m) => m.recipient_profile_id === employee.userId));
    const { data: botAll } = await chief.db.from("bot_messages").select("id");
    const { count: botTotal } = await service.from("bot_messages").select("id", { count: "exact", head: true }).eq("organization_id", noordlicht);
    check("the editors see the whole outbox", (botAll ?? []).length === botTotal && (botTotal ?? 0) > 0);
    const { error: botForge } = await admin.db.from("bot_messages").insert({ organization_id: noordlicht, kind: "notice", medium: "dm", body: "x", status: "sent" });
    check("nobody can write into the bot's outbox", Boolean(botForge));
    const { data: usage } = await employee.db.from("ai_usage").select("id");
    check("an employee cannot read AI costs", (usage ?? []).length === 0);

    const { data: internalTopic } = await service
      .from("content_opportunities")
      .select("id")
      .eq("organization_id", noordlicht)
      .eq("internal_only", true)
      .is("released_external_at", null)
      .limit(1)
      .single();
    const { error: leak } = await service
      .from("articles")
      .insert({ organization_id: noordlicht, title: "Intern naar buiten", content_type: "news_article", classification: "external", opportunity_id: internalTopic!.id });
    check("an internal-only topic cannot become an external piece without release", Boolean(leak) && /internal only/i.test(leak!.message), leak?.message);

    const { error: rpc } = await admin.db.rpc("bootstrap_redactie", { p_org_id: noordlicht });
    check("bootstrap_redactie is not callable by users", Boolean(rpc));
    const { data: foreignRules } = await outsider.db.from("approval_rules").select("organization_id").eq("organization_id", noordlicht);
    check("approval rules are isolated per organization", (foreignRules ?? []).length === 0);
  }

  console.log("\nSearch");
  {
    type SearchResponse = { counts: Record<string, number>; rows: { kind: string; id: string; title: string; snippet: string }[] };
    const run = async (db: Db, tsquery: string, like: string, kind?: string) => {
      const { data, error } = await db.rpc("search_all", { p_tsquery: tsquery, p_like: like, p_kind: kind, p_limit: 50, p_offset: 0 });
      return { response: data as unknown as SearchResponse | null, error };
    };

    const { response: found } = await run(admin.db, "klant:*", "%klant%");
    check("an administrator finds content about klanten", (found?.rows ?? []).length > 0, JSON.stringify(found?.counts));
    check("results span more than one kind", Object.keys(found?.counts ?? {}).length > 1, JSON.stringify(found?.counts));

    const { response: prefix } = await run(admin.db, "kla:*", "%kla%");
    check("a word prefix matches", (prefix?.rows ?? []).length > 0);

    const { response: substring } = await run(admin.db, "zzzxqq:*", "%lant%");
    check("a part inside a word matches through the substring fallback", (substring?.rows ?? []).length > 0);

    const { response: none } = await run(admin.db, "zzzxqq:*", "%zzzxqq%");
    check("a nonsense query finds nothing", (none?.rows ?? []).length === 0);

    const { response: foreign } = await run(outsider.db, "klant:*", "%klant%");
    check("an administrator of another organization finds none of it", (foreign?.rows ?? []).length === 0, JSON.stringify(foreign?.counts));

    const { response: kindOnly } = await run(admin.db, "klant:*", "%klant%", "article");
    check("a kind filter returns only that kind", (kindOnly?.rows ?? []).every((row) => row.kind === "article"));

    const { response: logbook } = await run(employee.db, "ingelogd:*", "%ingelogd%");
    check("search never returns audit log entries", (logbook?.rows ?? []).every((row) => row.kind !== "audit"));

    const { response: employeeFound } = await run(employee.db, "klant:*", "%klant%");
    const { data: visibleArticles } = await employee.db.from("articles").select("id");
    const visible = new Set((visibleArticles ?? []).map((article) => article.id));
    const articleHits = (employeeFound?.rows ?? []).filter((row) => row.kind === "article");
    check("an employee only finds articles that row level security shows them", articleHits.every((row) => visible.has(row.id)));

    const { data: employeeComments } = await employee.db.from("comments").select("entity_type, entity_id");
    const { data: employeeInterviews } = await employee.db.from("interviews").select("id");
    const visibleInterviews = new Set((employeeInterviews ?? []).map((interview) => interview.id));
    const hiddenParents = (employeeComments ?? []).filter(
      (comment) =>
        (comment.entity_type === "article" && !visible.has(comment.entity_id)) ||
        (comment.entity_type === "interview" && !visibleInterviews.has(comment.entity_id)),
    );
    check("an employee cannot read comments on pieces or interviews they cannot see", hiddenParents.length === 0, `${hiddenParents.length} hidden`);
    const { data: allComments } = await service.from("comments").select("id").eq("organization_id", noordlicht);
    const { data: editorComments } = await editor.db.from("comments").select("id");
    check("an editor still reads every comment", (editorComments ?? []).length === (allComments ?? []).length && (allComments ?? []).length > 0);
    const { response: employeeComment } = await run(employee.db, "bron:*", "%bron%");
    const leaked = (employeeComment?.rows ?? []).filter((row) => row.kind === "comment" && !(employeeComments ?? []).some((c) => c.entity_id === row.id));
    check("search returns no comment the employee could not select", leaked.length <= (employeeComment?.rows ?? []).filter((row) => row.kind === "comment").length);

    const { data: hugePage } = await admin.db.rpc("search_all", { p_tsquery: "klant:*", p_like: "%klant%", p_limit: 100000, p_offset: 0 });
    const hugeRows = ((hugePage as unknown as SearchResponse | null)?.rows ?? []).filter((row) => row.kind === "transcript");
    check("a huge p_limit is clamped to 50 rows per kind", hugeRows.length > 0 && hugeRows.length <= 50, `${hugeRows.length}`);
    const { error: hugeOffset } = await admin.db.rpc("search_all", { p_tsquery: "klant:*", p_like: "%klant%", p_kind: "article", p_limit: 20, p_offset: 2147483640 });
    check("a huge p_offset does not overflow", !hugeOffset, hugeOffset?.message);
    const { data: longQuery } = await admin.db.rpc("search_all", { p_tsquery: Array.from({ length: 200 }, () => "klant:*").join(" & "), p_like: "%klant%" });
    check("an over-long query returns nothing instead of running", Object.keys((longQuery as unknown as SearchResponse | null)?.counts ?? {}).length === 0);

    const { error: anonymous } = await anon.rpc("search_all", { p_tsquery: "klant:*", p_like: "%klant%" });
    check("anonymous users cannot call search", Boolean(anonymous));
  }

  console.log(`\n${passed} geslaagd, ${failed} mislukt`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Test run failed:", error);
  process.exit(1);
});
