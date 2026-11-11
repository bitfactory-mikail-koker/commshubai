"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { evaluateSignal } from "@/lib/agents/pipelines";
import { TopicError, declineTopic, pickUpTopic } from "@/lib/redactie/topics";
import { logUserAction } from "@/lib/audit";
import { requireActionSession } from "@/lib/auth";
import { processSourceMessages } from "@/lib/intelligence/pipeline";
import { check, fail, ok, runAction, unwrap, type ActionResult } from "@/lib/result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const refresh = () => revalidatePath("/", "layout");

const submitSchema = z.object({
  title: z.string().trim().min(3, "Geef een korte titel.").max(160),
  body: z.string().trim().min(30, "Beschrijf wat er speelt in minimaal 30 tekens.").max(6000),
  customer: z.string().trim().max(120).optional(),
});

/** Anyone in the organization can submit information manually. */
export async function submitInformation(
  input: z.input<typeof submitSchema>,
): Promise<ActionResult<{ signalId: string | null }>> {
  return runAction<{ signalId: string | null }>(async () => {
    const session = await requireActionSession();
    const data = submitSchema.parse(input);
    const db = await createClient();

    const message = unwrap(
      await db
        .from("source_messages")
        .insert({
          organization_id: session.organization.id,
          source: "manual",
          external_id: `manual-${crypto.randomUUID()}`,
          channel: "Handmatige inzending",
          author_name: session.profile.full_name,
          author_profile_id: session.userId,
          title: data.title,
          body: data.body,
          metadata: data.customer ? { customer: data.customer } : {},
        })
        .select("id")
        .single(),
    );

    const result = await processSourceMessages({
      organizationId: session.organization.id,
      messageIds: [message.id],
      trigger: "manual",
      triggeredBy: session.userId,
      autoEvaluate: true,
    });
    refresh();

    const signalId = result.signalIds[0] ?? result.duplicateSignalIds[0] ?? null;
    if (result.duplicateSignalIds.length > 0) {
      return ok("Dank je. Dit lijkt op een bestaand signaal; je informatie is daar als extra bron aan toegevoegd.", { signalId });
    }
    if (!signalId) {
      return ok("Dank je. De informatie is opgeslagen, maar is niet als nieuwswaardig signaal herkend.", { signalId: null });
    }
    return ok("Dank je. Je informatie is als signaal opgenomen in de inbox.", { signalId });
  });
}

export async function setSignalStatus(input: { id: string; status: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const status = z.enum(["new", "needs_info", "dismissed"]).parse(input.status);
    const db = await createClient();
    const signal = unwrap(await db.from("content_signals").select("title").eq("id", id).single());
    check(await db.from("content_signals").update({ status }).eq("id", id));
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "signal.status_changed",
      entityType: "signal",
      entityId: id,
      summary:
        status === "dismissed"
          ? `Signaal “${signal.title}” afgewezen.`
          : `Signaal “${signal.title}” teruggezet naar ${status === "new" ? "nieuw" : "meer info nodig"}.`,
    });
    refresh();
    return ok(status === "dismissed" ? "Signaal afgewezen." : "Signaal bijgewerkt.");
  });
}

const infoSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().min(10, "Voeg minimaal 10 tekens aan informatie toe.").max(4000),
  resolved: z.array(z.string()).max(20),
});

/** Adds missing information to a signal as an extra (manual) source. */
export async function addSignalInformation(input: z.input<typeof infoSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const data = infoSchema.parse(input);
    const db = await createClient();
    const signal = unwrap(await db.from("content_signals").select("*").eq("id", data.id).single());

    const message = unwrap(
      await db
        .from("source_messages")
        .insert({
          organization_id: session.organization.id,
          source: "manual",
          external_id: `manual-${crypto.randomUUID()}`,
          channel: "Aanvulling op signaal",
          author_name: session.profile.full_name,
          author_profile_id: session.userId,
          title: `Aanvulling: ${signal.title}`,
          body: data.text,
          processed_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
    );

    // Linking sources is an engine-side table; the permission was checked above.
    const admin = createAdminClient();
    check(
      await admin.from("signal_sources").insert({
        signal_id: signal.id,
        source_message_id: message.id,
        organization_id: session.organization.id,
        relation: "related",
      }),
    );

    const missing = (Array.isArray(signal.missing_information) ? signal.missing_information : []).filter(
      (item) => typeof item === "string" && !data.resolved.includes(item),
    );
    check(
      await db
        .from("content_signals")
        .update({
          missing_information: missing,
          status: signal.status === "needs_info" && missing.length < 2 ? "new" : signal.status,
        })
        .eq("id", signal.id),
    );
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "signal.info_added",
      entityType: "signal",
      entityId: signal.id,
      summary: `Informatie aangevuld bij signaal “${signal.title}” (${data.resolved.length} punt(en) afgehandeld).`,
    });
    refresh();
    return ok("Informatie toegevoegd aan het signaal.");
  });
}

export async function evaluateSignalAction(input: { id: string; agentKind?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const agentKind = input.agentKind ? z.enum(["external", "internal"]).parse(input.agentKind) : undefined;
    const result = await evaluateSignal({
      organizationId: session.organization.id,
      signalId: z.uuid().parse(input.id),
      agentKind,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    if (result.skippedReason === "confidential") {
      return fail("Dit signaal is vertrouwelijk en wordt niet door de externe agent verwerkt.");
    }
    if (!result.opportunityId) return fail("Er is geen contentkans aangemaakt.");
    return ok(
      result.externalOpportunityId
        ? "Contentkans aangemaakt en doorverwezen naar de externe agent."
        : "Contentkans aangemaakt.",
    );
  });
}

export async function acceptOpportunityAction(input: { id: string }): Promise<ActionResult<{ articleId: string }>> {
  return runAction<{ articleId: string }>(async () => {
    const session = await requireActionSession("content.create");
    try {
      const result = await pickUpTopic({
        organizationId: session.organization.id,
        opportunityId: z.uuid().parse(input.id),
        by: session.userId,
        trigger: "manual",
      });
      refresh();
      const interviews = result.interviewIds.length;
      return ok(
        `Opgepakt: er is een stuk gestart${interviews ? ` en ${interviews === 1 ? "er is één interview" : `er zijn ${interviews} interviews`} aangevraagd` : ""}.`,
        { articleId: result.articleId },
      );
    } catch (error) {
      if (error instanceof TopicError) return fail(error.message);
      throw error;
    }
  });
}

export async function declineOpportunity(input: { id: string; reason?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const reason = z.string().trim().max(500).optional().parse(input.reason) || "Geen reden opgegeven";
    const db = await createClient();
    // Read through the user's session first: RLS decides whether this topic is theirs to judge.
    unwrap(await db.from("content_opportunities").select("id").eq("id", id).single());
    try {
      const topic = await declineTopic(createAdminClient(), session.organization.id, id, reason);
      await logUserAction(db, session.userId, {
        organizationId: session.organization.id,
        action: "opportunity.declined",
        entityType: "opportunity",
        entityId: id,
        summary: `Voorstel “${topic.title}” afgewezen. Reden: ${reason}.`,
        metadata: { reason },
      });
    } catch (error) {
      if (error instanceof TopicError) return fail(error.message);
      throw error;
    }
    refresh();
    return ok("Voorstel afgewezen.");
  });
}
