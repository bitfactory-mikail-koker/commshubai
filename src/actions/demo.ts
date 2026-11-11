"use server";

import { revalidatePath } from "next/cache";
import { acceptOpportunity, createInterview, generateDraft } from "@/lib/agents/pipelines";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { SCENARIO_ANSWERS, SCENARIO_MESSAGE } from "@/lib/demo/feed";
import { getScenarioState } from "@/lib/demo/scenario";
import { env } from "@/lib/env";
import { ingestDemoMessages } from "@/lib/integrations/service";
import { fail, ok, runAction, type ActionResult } from "@/lib/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");

function assertDemoMode() {
  if (!env.demoMode) throw new Error("De demo-modus staat uit (NEXT_PUBLIC_DEMO_MODE).");
}

/** Step 1-3: a simulated Slack message arrives and runs through the engine. */
export async function startDemoScenario(): Promise<ActionResult> {
  return runAction(async () => {
    assertDemoMode();
    const session = await requireActionSession("content.create");
    const db = await createClient();
    const existing = await getScenarioState(db, session.organization.id);
    if (existing.message) return fail("Het demoscenario loopt al. Reset het om opnieuw te beginnen.");

    const result = await ingestDemoMessages({
      organizationId: session.organization.id,
      messages: [SCENARIO_MESSAGE],
      trigger: "demo",
      triggeredBy: session.userId,
    });
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "demo.scenario_started",
      category: "system",
      summary: "Demoscenario gestart: gesimuleerd Slack-bericht aangeleverd in #project-veldhuis.",
      metadata: { demo: true },
    });
    refresh();
    if (result.signalIds.length === 0) return fail("Het bericht is verwerkt, maar er is geen signaal gedetecteerd.");
    return ok(
      result.opportunityIds.length > 0
        ? "Slack-bericht ontvangen, signaal gedetecteerd en als contentkans voorgesteld."
        : "Slack-bericht ontvangen en signaal gedetecteerd.",
    );
  });
}

/** Step 4: the external agent picks up the opportunity and requests an interview. */
export async function demoRequestInterview(): Promise<ActionResult> {
  return runAction(async () => {
    assertDemoMode();
    const session = await requireActionSession("content.create");
    const db = await createClient();
    const state = await getScenarioState(db, session.organization.id);
    if (!state.opportunity) return fail("Er is nog geen contentkans. Start het scenario eerst.");
    if (state.interview) return fail("Het interview is al aangevraagd.");

    const base = { organizationId: session.organization.id, trigger: "demo" as const, triggeredBy: session.userId };
    const { articleId } = await acceptOpportunity({ ...base, opportunityId: state.opportunity.id });

    const { data: interviewee } = await db
      .from("profiles")
      .select("id, full_name, job_title")
      .eq("full_name", SCENARIO_MESSAGE.authorName)
      .maybeSingle();

    await createInterview({
      ...base,
      agentKind: "external",
      title: "Klantcase Veldhuis Zorggroep - cliëntenportaal",
      purpose: "Het verhaal achter de livegang van het cliëntenportaal ophalen voor een klantcase: aanleiding, aanpak, samenwerking en resultaat",
      kind: "customer_case",
      classification: "external",
      intervieweeProfileId: interviewee?.id ?? null,
      intervieweeName: interviewee?.full_name ?? SCENARIO_MESSAGE.authorName,
      intervieweeRole: interviewee?.job_title ?? "Projectleider",
      articleId,
      opportunityId: state.opportunity.id,
      context: state.opportunity.title,
      customer: String(SCENARIO_MESSAGE.metadata.customer),
      project: String(SCENARIO_MESSAGE.metadata.project),
      metadata: { demo_answers: SCENARIO_ANSWERS },
      isDemo: true,
    });
    refresh();
    return ok("De externe agent heeft de kans opgepakt en een interview aangevraagd.");
  });
}

/** Step 6: the external agent writes the first draft. */
export async function demoGenerateDraft(): Promise<ActionResult> {
  return runAction(async () => {
    assertDemoMode();
    const session = await requireActionSession("content.create");
    const db = await createClient();
    const state = await getScenarioState(db, session.organization.id);
    if (!state.article) return fail("Er is nog geen contentitem.");
    if (state.interview?.status !== "completed") return fail("Rond eerst het interview af.");
    const result = await generateDraft({
      organizationId: session.organization.id,
      articleId: state.article.id,
      trigger: "demo",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(`Concept geschreven (versie ${result.version}, merkscore ${result.brandScore}/100).`);
  });
}

/** Removes everything the scenario created so it can be replayed. */
export async function resetDemoScenario(): Promise<ActionResult> {
  return runAction(async () => {
    assertDemoMode();
    const session = await requireActionSession("agents.manage", "users.manage");
    const db = await createClient();
    const state = await getScenarioState(db, session.organization.id);
    if (!state.message) return ok("Er is geen lopend demoscenario.");

    // Demo records only; identified through the scenario's own source message.
    const admin = createAdminClient();
    const orgId = session.organization.id;
    if (state.article) {
      const articleId = state.article.id;
      const { data: variants } = await admin
        .from("articles")
        .select("id")
        .eq("organization_id", orgId)
        .eq("opportunity_id", state.opportunity?.id ?? "00000000-0000-0000-0000-000000000000");
      const articleIds = Array.from(new Set([articleId, ...(variants ?? []).map((v) => v.id)]));
      await admin.from("content_calendar").delete().eq("organization_id", orgId).eq("entity_type", "article").in("entity_id", articleIds);
      await admin.from("approvals").delete().eq("organization_id", orgId).eq("entity_type", "article").in("entity_id", articleIds);
      await admin.from("comments").delete().eq("organization_id", orgId).eq("entity_type", "article").in("entity_id", articleIds);
      const { data: posts } = await admin.from("social_posts").select("id").in("article_id", articleIds);
      if (posts?.length) {
        const postIds = posts.map((p) => p.id);
        await admin.from("content_calendar").delete().eq("entity_type", "social_post").in("entity_id", postIds);
        await admin.from("approvals").delete().eq("entity_type", "social_post").in("entity_id", postIds);
        await admin.from("social_posts").delete().in("id", postIds);
      }
      const { data: interviews } = await admin.from("interviews").select("id").in("article_id", articleIds);
      if (interviews?.length) {
        const interviewIds = interviews.map((i) => i.id);
        await admin.from("content_calendar").delete().eq("entity_type", "interview").in("entity_id", interviewIds);
        await admin.from("interviews").delete().in("id", interviewIds);
      }
      await admin.from("agent_messages").delete().eq("organization_id", orgId).in("article_id", articleIds);
      await admin.from("articles").delete().in("id", articleIds);
    }
    if (state.signal) {
      await admin.from("agent_messages").delete().eq("organization_id", orgId).eq("signal_id", state.signal.id);
      await admin.from("content_opportunities").delete().eq("organization_id", orgId).eq("signal_id", state.signal.id);
      await admin.from("content_signals").delete().eq("organization_id", orgId).eq("id", state.signal.id);
    }
    await admin.from("source_messages").delete().eq("organization_id", orgId).eq("id", state.message.id);

    await logUserAction(db, session.userId, {
      organizationId: orgId,
      action: "demo.scenario_reset",
      category: "system",
      summary: "Demoscenario gereset: de demorecords van het scenario zijn verwijderd.",
      metadata: { demo: true },
    });
    refresh();
    return ok("Demoscenario gereset. Je kunt het opnieuw starten.");
  });
}
