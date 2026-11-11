"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prepareNewsletter, scheduleLeadershipInterview } from "@/lib/agents/pipelines";
import { SOURCE_OPTIONS, TOOLS } from "@/lib/agents/registry";
import { runDueJobs, runTask } from "@/lib/agents/tasks";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { processSourceMessages } from "@/lib/intelligence/pipeline";
import { fromJson, toJson } from "@/lib/json";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");

export async function setAgentStatus(input: { id: string; status: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage");
    const id = z.uuid().parse(input.id);
    const status = z.enum(["active", "paused"]).parse(input.status);
    const db = await createClient();
    const agent = unwrap(await db.from("agents").select("name").eq("id", id).single());
    check(await db.from("agents").update({ status }).eq("id", id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "agent.status_changed",
      entityType: "agent",
      entityId: id,
      summary: `${agent.name} ${status === "active" ? "geactiveerd" : "gepauzeerd"}.`,
    });
    refresh();
    return ok(status === "active" ? "Agent geactiveerd." : "Agent gepauzeerd.");
  });
}

const configSchema = z.object({
  id: z.uuid(),
  mission: z.string().trim().min(20, "Beschrijf de opdracht van de agent in minimaal 20 tekens.").max(1500),
  allowedTools: z.array(z.string()).max(40),
  allowedSources: z.array(z.string()).max(10),
  minRelevanceScore: z.number().int().min(0).max(100),
  newsletterDay: z.number().int().min(1).max(28),
});

export async function updateAgentConfig(input: z.input<typeof configSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage");
    const data = configSchema.parse(input);
    const db = await createClient();
    const agent = unwrap(await db.from("agents").select("*").eq("id", data.id).single());

    // An agent can only be granted tools that exist for its kind. Human-gated
    // actions are not in the registry, so they can never be granted.
    const grantable = new Set(TOOLS.filter((t) => t.availableTo.includes(agent.kind)).map((t) => t.key as string));
    const tools = data.allowedTools.filter((t) => grantable.has(t));
    const sources = data.allowedSources.filter((s) => SOURCE_OPTIONS.some((o) => o.key === s));

    check(
      await db
        .from("agents")
        .update({
          mission: data.mission,
          allowed_tools: tools,
          allowed_sources: sources,
          config: toJson({
            ...fromJson<Record<string, unknown>>(agent.config, {}),
            min_relevance_score: data.minRelevanceScore,
            newsletter_day_of_month: data.newsletterDay,
          }),
        })
        .eq("id", data.id),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "agent.config_updated",
      entityType: "agent",
      entityId: data.id,
      summary: `Configuratie van ${agent.name} bijgewerkt (${tools.length} tools, ${sources.length} bronnen).`,
      metadata: { tools, sources },
    });
    refresh();
    return ok("Agentconfiguratie opgeslagen.");
  });
}

/** "Nu uitvoeren" buttons on the agent pages. */
export async function runAgentJob(input: { job: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("agents.manage");
    const job = z
      .enum(["process_messages", "external_newsletter", "internal_newsletter", "leadership_interview", "tick"])
      .parse(input.job);
    const base = { organizationId: session.organization.id, trigger: "manual" as const, triggeredBy: session.userId };
    let message: string;

    switch (job) {
      case "process_messages": {
        const result = await processSourceMessages({ ...base, autoEvaluate: true });
        message =
          result.processed === 0
            ? "Er zijn geen onverwerkte bronberichten."
            : `${result.processed} bericht(en) geanalyseerd: ${result.signalIds.length} signaal/signalen, ${result.opportunityIds.length} kans(en).`;
        break;
      }
      case "external_newsletter":
      case "internal_newsletter": {
        const result = await prepareNewsletter({
          ...base,
          kind: job === "external_newsletter" ? "external" : "internal",
          month: new Date(),
        });
        message = result.created
          ? `Nieuwsbrief voorbereid met ${result.itemCount} item(s).`
          : "De nieuwsbrief van deze maand bestond al en is bijgewerkt.";
        break;
      }
      case "leadership_interview": {
        const result = await scheduleLeadershipInterview(base);
        if (result.reason === "no_director") {
          return fail("Er is geen collega met ‘directeur’ in de functietitel gevonden. Pas een functietitel aan onder Mensen en rollen.");
        }
        message = result.created ? "Directie-interview aangevraagd en ingepland." : "Het directie-interview voor deze periode bestond al.";
        break;
      }
      case "tick": {
        const result = await runDueJobs({ organizationId: session.organization.id });
        const published = result.published.articles + result.published.socialPosts + result.published.newsletters;
        message = `Taken verwerkt: ${result.tasksRun} uitgevoerd, ${result.tasksFailed} mislukt, ${published} geplande publicatie(s).`;
        break;
      }
    }
    refresh();
    return ok(message);
  });
}

export async function taskAction(input: { id: string; action: "run" | "cancel" | "retry" }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("agents.manage");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const task = unwrap(await db.from("agent_tasks").select("status, title").eq("id", id).single());

    if (input.action === "cancel") {
      if (!["queued", "waiting_input", "waiting_approval"].includes(task.status)) return fail("Deze taak kan niet meer worden geannuleerd.");
      check(await db.from("agent_tasks").update({ status: "cancelled" }).eq("id", id));
      refresh();
      return ok("Taak geannuleerd.");
    }
    if (input.action === "retry") {
      if (!["failed", "cancelled"].includes(task.status)) return fail("Alleen mislukte of geannuleerde taken kunnen opnieuw worden gestart.");
      check(
        await db.from("agent_tasks").update({ status: "queued", attempts: 0, error: null, scheduled_for: new Date().toISOString() }).eq("id", id),
      );
    } else if (task.status !== "queued") {
      return fail("Deze taak staat niet in de wachtrij.");
    }
    const result = await runTask(id);
    refresh();
    return result.ok ? ok(`Taak “${task.title}” uitgevoerd.`) : fail(result.error ?? "De taak is mislukt.");
  });
}
