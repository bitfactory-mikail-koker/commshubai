"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  advanceInterview,
  completeInterview,
  confirmInterviewSummary,
  convertInterviewToDraft,
  createInterview,
} from "@/lib/agents/pipelines";
import { respondToInvite } from "@/lib/redactie/interview-flow";
import { logUserAction } from "@/lib/audit";
import { can, requireActionSession } from "@/lib/auth";
import { removeCalendarEntry, upsertCalendarEntry } from "@/lib/calendar";
import { CONTENT_TYPES } from "@/lib/constants";
import { parseDateInput } from "@/lib/format";
import { fromJson, toJson } from "@/lib/json";
import { check, fail, ok, runAction, toUserMessage, unwrap, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import type { ContentType, SignalEntities } from "@/lib/types";

const refresh = () => revalidatePath("/", "layout");

const createSchema = z
  .object({
    title: z.string().trim().min(3, "Geef het interview een titel.").max(160),
    purpose: z.string().trim().min(10, "Beschrijf het doel in minimaal 10 tekens.").max(600),
    kind: z.enum(["customer_case", "employee_intro", "management", "expert", "team", "other"]),
    classification: z.enum(["internal", "external"]),
    intervieweeProfileId: z.uuid().nullable(),
    intervieweeName: z.string().trim().max(120),
    intervieweeRole: z.string().trim().max(120).optional(),
    articleId: z.uuid().nullable().optional(),
    scheduledAt: z.string().optional(),
  })
  .refine((v) => v.intervieweeProfileId || v.intervieweeName.length >= 2, {
    message: "Kies een collega of vul de naam van de geïnterviewde in.",
    path: ["intervieweeName"],
  });

export async function createInterviewAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const data = createSchema.parse(input);
    const db = await createClient();

    let name = data.intervieweeName;
    let role = data.intervieweeRole ?? null;
    if (data.intervieweeProfileId) {
      const profile = unwrap(
        await db.from("profiles").select("full_name, job_title").eq("id", data.intervieweeProfileId).single(),
      );
      name = profile.full_name;
      role = role || profile.job_title;
    }

    let customer: string | null = null;
    let project: string | null = null;
    let opportunityId: string | null = null;
    let context = "";
    if (data.articleId) {
      const article = unwrap(
        await db.from("articles").select("title, excerpt, opportunity_id").eq("id", data.articleId).single(),
      );
      context = `${article.title}. ${article.excerpt ?? ""}`;
      opportunityId = article.opportunity_id;
      const { data: links } = await db
        .from("article_signals")
        .select("signal:content_signals(entities)")
        .eq("article_id", data.articleId)
        .limit(1);
      const entities = fromJson<SignalEntities>(links?.[0]?.signal?.entities, {});
      customer = entities.customer ?? null;
      project = entities.project ?? null;
    }

    let scheduledAt: string | null = null;
    if (data.scheduledAt) {
      const date = parseDateInput(data.scheduledAt);
      if (!date) return fail("Kies een geldige datum en tijd.");
      scheduledAt = date.toISOString();
    }

    const result = await createInterview({
      organizationId: session.organization.id,
      agentKind: data.classification === "external" ? "external" : "internal",
      title: data.title,
      purpose: data.purpose,
      kind: data.kind,
      classification: data.classification,
      intervieweeProfileId: data.intervieweeProfileId,
      intervieweeName: name,
      intervieweeRole: role,
      articleId: data.articleId ?? null,
      opportunityId,
      scheduledAt,
      context,
      customer,
      project,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok("Interview aangemaakt met voorbereide vragen.", { id: result.interviewId });
  });
}

async function assertCanAnswer(interviewId: string) {
  const session = await requireActionSession();
  const db = await createClient();
  const interview = unwrap(await db.from("interviews").select("*").eq("id", interviewId).single());
  const isInterviewee = interview.interviewee_profile_id === session.userId;
  if (!isInterviewee && !can(session, "content.create")) {
    throw new Error("Je hebt geen rechten voor deze actie.");
  }
  return { session, db, interview };
}

/** Opens the conversation: the agent asks the first question. */
export async function startInterview(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const id = z.uuid().parse(input.id);
    const { session, interview } = await assertCanAnswer(id);
    if (["completed", "cancelled"].includes(interview.status)) return fail("Dit interview is al afgesloten.");
    await advanceInterview({
      organizationId: session.organization.id,
      interviewId: id,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(interview.status === "in_progress" ? "Interview hervat." : "Interview gestart.");
  });
}

/** Saves an answer and lets the agent respond with the next question. */
export async function answerInterview(
  input: { id: string; content: string },
): Promise<ActionResult<{ done: boolean; agentError: string | null }>> {
  return runAction<{ done: boolean; agentError: string | null }>(async () => {
    const id = z.uuid().parse(input.id);
    const content = z.string().trim().min(1, "Typ een antwoord.").max(6000).parse(input.content);
    const { session, db, interview } = await assertCanAnswer(id);
    if (interview.status !== "in_progress") return fail("Start het interview eerst.");

    check(
      await db.from("interview_messages").insert({
        organization_id: session.organization.id,
        interview_id: id,
        role: "interviewee",
        content,
        author_profile_id: session.userId,
      }),
    );
    // The answer is stored at this point. If the agent cannot respond (paused,
    // AI provider error) we report that without asking the user to resend:
    // "Interview hervatten" lets the agent pick up from the saved answer.
    try {
      const turn = await advanceInterview({
        organizationId: session.organization.id,
        interviewId: id,
        trigger: "manual",
        triggeredBy: session.userId,
      });
      refresh();
      return ok(turn.done ? "Dank je. Lees de samenvatting en laat weten of die klopt." : undefined, { done: turn.done, agentError: null });
    } catch (error) {
      refresh();
      return ok(undefined, { done: false, agentError: toUserMessage(error) });
    }
  });
}

/** Demo interviews only: answers every remaining question with the scripted demo answers. */
export async function autoAnswerDemoInterview(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const id = z.uuid().parse(input.id);
    const { session, db, interview } = await assertCanAnswer(id);
    const answers = fromJson<{ demo_answers?: string[] }>(interview.metadata, {}).demo_answers ?? [];
    if (!interview.is_demo || answers.length === 0) return fail("Voor dit interview zijn geen demo-antwoorden beschikbaar.");
    if (["completed", "cancelled"].includes(interview.status)) return fail("Dit interview is al afgesloten.");

    const base = { organizationId: session.organization.id, interviewId: id, trigger: "demo" as const, triggeredBy: session.userId };
    if (interview.status !== "in_progress") await advanceInterview(base);

    for (let guard = 0; guard < 20; guard++) {
      const { data: messages } = await db
        .from("interview_messages")
        .select("role, question_id")
        .eq("interview_id", id)
        .order("created_at");
      const answered = (messages ?? []).filter((m) => m.role === "interviewee").length;
      const answer = answers[Math.min(answered, answers.length - 1)];
      check(
        await db.from("interview_messages").insert({
          organization_id: session.organization.id,
          interview_id: id,
          role: "interviewee",
          content: answer,
          author_profile_id: session.userId,
        }),
      );
      const turn = await advanceInterview(base);
      if (turn.done) break;
    }
    // The scripted interviewee also confirms the closing summary ("Klopt dit?").
    const after = unwrap(await db.from("interviews").select("status").eq("id", id).single());
    if (after.status === "awaiting_confirmation") await confirmInterviewSummary({ ...base, confirmedBy: session.userId });
    refresh();
    return ok("Demo-antwoorden ingevuld; het interview is afgerond en samengevat.");
  });
}

/** The interviewee's answer to the invitation: now, later, or "I am not the right person". */
export async function respondToInviteAction(input: {
  id: string;
  choice: "now" | "later" | "redirect" | "declined";
  redirectTo?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const id = z.uuid().parse(input.id);
    const choice = z.enum(["now", "later", "redirect", "declined"]).parse(input.choice);
    const redirectTo = z.string().trim().max(200).optional().parse(input.redirectTo);
    const { session } = await assertCanAnswer(id);
    const result = await respondToInvite({
      organizationId: session.organization.id,
      interviewId: id,
      choice,
      redirectTo,
      by: session.userId,
      trigger: "manual",
    });
    refresh();
    return ok(
      choice === "now"
        ? "Interview gestart."
        : (result.message ?? (choice === "later" ? "Genoteerd: later." : "Genoteerd. De redactie is op de hoogte.")),
    );
  });
}

/** "Klopt dit?": confirm the closing summary, or correct it once. */
export async function confirmSummaryAction(input: { id: string; correction?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const id = z.uuid().parse(input.id);
    const correction = z.string().trim().max(4000).optional().parse(input.correction);
    const { session, interview } = await assertCanAnswer(id);
    if (interview.status !== "awaiting_confirmation") return fail("Dit interview wacht niet op een bevestiging.");
    await confirmInterviewSummary({
      organizationId: session.organization.id,
      interviewId: id,
      correction: correction || null,
      confirmedBy: session.userId,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok(correction ? "Je correctie is verwerkt in de samenvatting." : "Dank je. De samenvatting is bevestigd.");
  });
}

export async function finishInterview(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    await completeInterview({
      organizationId: session.organization.id,
      interviewId: z.uuid().parse(input.id),
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok("Interview afgesloten en samengevat.");
  });
}

export async function convertInterview(input: {
  id: string;
  contentType: string;
}): Promise<ActionResult<{ articleId: string }>> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const contentType = z.enum(CONTENT_TYPES as [string, ...string[]]).parse(input.contentType) as ContentType;
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const interview = unwrap(await db.from("interviews").select("status").eq("id", id).single());
    if (interview.status !== "completed") return fail("Rond het interview eerst af.");
    const result = await convertInterviewToDraft({
      organizationId: session.organization.id,
      interviewId: id,
      contentType,
      trigger: "manual",
      triggeredBy: session.userId,
    });
    refresh();
    return ok("Het interview is omgezet naar een concept.", { articleId: result.articleId });
  });
}

export async function updateInterviewQuestions(input: {
  id: string;
  questions: { id: string; text: string; topic?: string }[];
}): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const questions = z
      .array(z.object({ id: z.string().min(1), text: z.string().trim().min(5, "Een vraag is te kort.").max(500), topic: z.string().max(40).optional() }))
      .min(1, "Een interview heeft minimaal één vraag nodig.")
      .max(15)
      .parse(input.questions);
    const db = await createClient();
    const interview = unwrap(await db.from("interviews").select("status").eq("id", id).single());
    if (!["draft", "requested", "scheduled"].includes(interview.status)) {
      return fail("De vragen kunnen niet meer worden aangepast nadat het interview is gestart.");
    }
    check(await db.from("interviews").update({ questions: toJson(questions) }).eq("id", id));
    refresh();
    return ok("Vragen opgeslagen.");
  });
}

export async function scheduleInterview(input: { id: string; scheduledAt: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const date = parseDateInput(input.scheduledAt);
    if (!date) return fail("Kies een geldige datum en tijd.");
    const db = await createClient();
    const interview = unwrap(await db.from("interviews").select("*").eq("id", id).single());
    if (["completed", "cancelled"].includes(interview.status)) return fail("Dit interview is al afgesloten.");
    check(
      await db
        .from("interviews")
        .update({ scheduled_at: date.toISOString(), status: interview.status === "in_progress" ? "in_progress" : "scheduled" })
        .eq("id", id),
    );
    await upsertCalendarEntry(db, {
      organizationId: session.organization.id,
      entityType: "interview",
      entityId: id,
      entryType: "interview",
      title: `Interview: ${interview.interviewee_name}`,
      startsAt: date.toISOString(),
      classification: interview.classification,
      createdBy: session.userId,
    });
    refresh();
    return ok("Interview ingepland.");
  });
}

export async function cancelInterview(input: { id: string }): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const interview = unwrap(await db.from("interviews").select("title, status").eq("id", id).single());
    if (interview.status === "completed") return fail("Een afgerond interview kan niet worden geannuleerd.");
    check(await db.from("interviews").update({ status: "cancelled" }).eq("id", id));
    await removeCalendarEntry(db, "interview", id);
    await logUserAction(db, session.userId, {
      organizationId: session.organization.id,
      action: "interview.cancelled",
      entityType: "interview",
      entityId: id,
      summary: `Interview “${interview.title}” geannuleerd.`,
    });
    refresh();
    return ok("Interview geannuleerd.");
  });
}

export async function toggleFollowUp(input: { id: string; followUpId: string; done: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    await requireActionSession("content.create");
    const id = z.uuid().parse(input.id);
    const db = await createClient();
    const interview = unwrap(await db.from("interviews").select("follow_up_actions").eq("id", id).single());
    const actions = fromJson<{ id: string; text: string; done: boolean }[]>(interview.follow_up_actions, []).map((a) =>
      a.id === input.followUpId ? { ...a, done: input.done } : a,
    );
    check(await db.from("interviews").update({ follow_up_actions: toJson(actions) }).eq("id", id));
    refresh();
    return ok();
  });
}
