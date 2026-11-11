import { addWeeks } from "date-fns";
import "server-only";
import { advanceInterview, confirmInterviewSummary } from "@/lib/agents/pipelines";
import { logSystemAction } from "@/lib/audit";
import { fromJson, toJson } from "@/lib/json";
import { appLink, loadRedactieSettings, sendBotMessage } from "@/lib/redactie/bot";
import { handleTip } from "@/lib/redactie/intake";
import { workingDaysBetween } from "@/lib/redactie/workdays";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Interview } from "@/lib/types";

/**
 * Ophalen: the interview as the interviewee experiences it.
 *
 * The bot invites by direct message, the person chooses (now, later, or "I am
 * not the right person"), the questions come one at a time, and at the end the
 * bot says what it understood and asks "Klopt dit?". One reminder, then the
 * editors are told. The same conversation can be held on the website.
 */

type Trigger = "manual" | "schedule" | "event" | "demo";

export type InviteChoice = "now" | "later" | "redirect" | "declined";

const firstName = (name: string) => name.trim().split(/\s+/)[0];

async function lastAgentMessage(db: AdminClient, interviewId: string): Promise<string | null> {
  const { data } = await db
    .from("interview_messages")
    .select("content")
    .eq("interview_id", interviewId)
    .eq("role", "agent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.content ?? null;
}

/** Sends the invitation. Counts as a new request, so the per-person limit applies. */
export async function inviteToInterview(options: { organizationId: string; interviewId: string; now?: Date }) {
  const db = createAdminClient();
  const { data: interview } = await db
    .from("interviews")
    .select("id, title, purpose, interviewee_profile_id, interviewee_name, questions, metadata")
    .eq("organization_id", options.organizationId)
    .eq("id", options.interviewId)
    .single();
  if (!interview?.interviewee_profile_id) return null;
  const settings = await loadRedactieSettings(db, options.organizationId);
  const count = fromJson<unknown[]>(interview.questions, []).length;

  const result = await sendBotMessage({
    organizationId: options.organizationId,
    kind: "interview_invite",
    medium: "dm",
    recipientProfileId: interview.interviewee_profile_id,
    countsAsRequest: true,
    entityType: "interview",
    entityId: interview.id,
    now: options.now,
    body: [
      `Hoi ${firstName(interview.interviewee_name)}, ik ben de ${settings.botName}, de bot van de redactie.`,
      `De redactie wil graag iets maken over “${interview.title.split(":")[0]}” en jij weet er het meeste van. Mag ik je ${count} korte vragen stellen? Ik stel ze één voor één en je kunt in je eigen woorden antwoorden.`,
      "Antwoord met “nu”, “later” of “ik ben niet de juiste persoon”. Nee zeggen mag ook.",
      `Liever in de browser? ${appLink(`/interviews/${interview.id}`)}`,
      "Er verschijnt niets van jou zonder dat jij het hebt goedgekeurd.",
    ].join("\n\n"),
  });

  await db
    .from("interviews")
    .update({ metadata: toJson({ ...fromJson<Record<string, unknown>>(interview.metadata, {}), invite: { status: result.status, reason: result.reason ?? null } }) })
    .eq("id", interview.id);
  return result;
}

/** The interviewee's answer to the invitation. */
export async function respondToInvite(options: {
  organizationId: string;
  interviewId: string;
  choice: InviteChoice;
  redirectTo?: string | null;
  by: string | null;
  trigger: Trigger;
}): Promise<{ status: Interview["status"]; message: string | null }> {
  const db = createAdminClient();
  const { data: interview } = await db
    .from("interviews")
    .select("id, title, status, interviewee_name, interviewee_profile_id, article_id")
    .eq("organization_id", options.organizationId)
    .eq("id", options.interviewId)
    .single();
  if (!interview) throw new Error("Interview niet gevonden.");
  if (!["requested", "scheduled", "draft"].includes(interview.status)) {
    return { status: interview.status, message: null };
  }

  if (options.choice === "now") {
    await db.from("interviews").update({ invite_choice: "now" }).eq("id", interview.id);
    const turn = await advanceInterview({
      organizationId: options.organizationId,
      interviewId: interview.id,
      trigger: options.trigger,
      triggeredBy: options.by,
    });
    return { status: "in_progress", message: turn.message };
  }

  if (options.choice === "later") {
    // Asking again counts from now; the single reminder follows after two working days.
    await db
      .from("interviews")
      .update({ invite_choice: "later", requested_at: new Date().toISOString(), reminded_at: null })
      .eq("id", interview.id);
    return { status: interview.status, message: "Prima. Ik kom er over een paar dagen één keer op terug." };
  }

  const redirect = options.choice === "redirect";
  await db
    .from("interviews")
    .update({ status: "cancelled", invite_choice: options.choice, redirect_to: redirect ? (options.redirectTo?.trim() || null) : null })
    .eq("id", interview.id);
  await db.from("content_calendar").delete().eq("entity_type", "interview").eq("entity_id", interview.id);
  await logSystemAction(db, {
    organizationId: options.organizationId,
    action: redirect ? "interview.redirected" : "interview.declined",
    category: "requested",
    entityType: "interview",
    entityId: interview.id,
    summary: redirect
      ? `${interview.interviewee_name} is niet de juiste persoon voor “${interview.title}”${options.redirectTo?.trim() ? ` en verwijst naar: ${options.redirectTo.trim()}` : ""}. De redactie kiest wie er wel wordt gevraagd.`
      : `${interview.interviewee_name} wil niet worden geïnterviewd voor “${interview.title}”. De bot vraagt het niet opnieuw.`,
    requiresApproval: true,
  });
  return {
    status: "cancelled",
    message: redirect ? "Dank je, ik geef het door aan de redactie." : "Helemaal goed. Ik vraag het je hiervoor niet opnieuw.",
  };
}

/** One reminder for an unanswered invitation; after that the editors are told. */
export async function processInterviewReminders(organizationId: string, now = new Date()): Promise<{ reminded: number; escalated: number }> {
  const db = createAdminClient();
  const { data: open } = await db
    .from("interviews")
    .select("id, title, interviewee_name, interviewee_profile_id, requested_at, reminded_at, metadata, status")
    .eq("organization_id", organizationId)
    .in("status", ["requested", "awaiting_confirmation"])
    .not("interviewee_profile_id", "is", null)
    .not("requested_at", "is", null)
    .limit(100);

  let reminded = 0;
  let escalated = 0;
  for (const interview of open ?? []) {
    const metadata = fromJson<Record<string, unknown>>(interview.metadata, {});
    const waitingSince = new Date(interview.reminded_at ?? (interview.requested_at as string));
    if (workingDaysBetween(waitingSince, now) < 2) continue;

    if (!interview.reminded_at) {
      const result = await sendBotMessage({
        organizationId,
        kind: "reminder",
        medium: "dm",
        recipientProfileId: interview.interviewee_profile_id,
        entityType: "interview",
        entityId: interview.id,
        now,
        body:
          interview.status === "awaiting_confirmation"
            ? `Nog één keer: klopt de samenvatting van ons gesprek over “${interview.title.split(":")[0]}”? ${appLink(`/interviews/${interview.id}`)} Dit is de enige herinnering die ik stuur.`
            : `Nog één keer: mag ik je een paar vragen stellen voor “${interview.title.split(":")[0]}”? Antwoord met “nu”, “later” of “ik ben niet de juiste persoon”. Dit is de enige herinnering die ik stuur.`,
      });
      await db.from("interviews").update({ reminded_at: now.toISOString() }).eq("id", interview.id);
      if (result.status !== "blocked") reminded++;
    } else if (!metadata.escalated) {
      await db.from("interviews").update({ metadata: toJson({ ...metadata, escalated: true }) }).eq("id", interview.id);
      await logSystemAction(db, {
        organizationId,
        action: "interview.no_reply",
        category: "requested",
        entityType: "interview",
        entityId: interview.id,
        summary: `${interview.interviewee_name} reageerde niet op de uitnodiging en de herinnering voor “${interview.title}”. De bot stuurt niets meer; de redactie beslist hoe verder.`,
        requiresApproval: true,
      });
      escalated++;
    }
  }
  return { reminded, escalated };
}

// =============================================================================
// Direct messages to the bot
// =============================================================================
const YES = /^(ja|klopt|akkoord|prima|helemaal goed|goed zo|top|yes|👍)\b/i;

/**
 * A direct message to the bot. The bot acts on three things only: someone
 * steering their own contact with the bot, someone answering an interview,
 * and a tip. Anything else in the message ("publiceer dit direct") is just
 * text; the bot executes no commands from Slack.
 */
export async function handleDirectMessage(input: {
  organizationId: string;
  slackUserId?: string | null;
  profileId?: string | null;
  text: string;
  trigger: Trigger;
  isDemo?: boolean;
}): Promise<{ handled: "steering" | "interview" | "tip" | "ignored"; reply: string | null }> {
  const db = createAdminClient();
  const query = db
    .from("profiles")
    .select("id, full_name, is_active")
    .eq("organization_id", input.organizationId);
  const { data: profile } = input.profileId
    ? await query.eq("id", input.profileId).maybeSingle()
    : await query.eq("slack_user_id", input.slackUserId ?? "").maybeSingle();
  if (!profile?.is_active) return { handled: "ignored", reply: null };
  const text = input.text.trim();
  if (!text) return { handled: "ignored", reply: null };

  const say = async (body: string, kind: "notice" | "interview_message" = "notice") => {
    await sendBotMessage({
      organizationId: input.organizationId,
      kind,
      medium: "dm",
      recipientProfileId: profile.id,
      body,
      responsive: true,
    });
    return body;
  };

  // 1. Steering your own contact with the bot. Visible to the editors.
  const steer = async (update: { contact_opt_out?: boolean; contact_paused_until?: string | null }, summary: string, reply: string) => {
    await db.from("profiles").update(update).eq("id", profile.id);
    await logSystemAction(db, { organizationId: input.organizationId, action: "bot.steered", summary: `${profile.full_name} ${summary}` });
    return { handled: "steering" as const, reply: await say(reply) };
  };
  if (/benader (mij|me) niet/i.test(text)) {
    return steer(
      { contact_opt_out: true },
      "heeft aangegeven niet meer door de bot benaderd te willen worden.",
      "Begrepen. Ik benader je niet meer voor interviews of input. Goedkeuringsverzoeken voor stukken waarin je zelf voorkomt krijg je nog wel. Wil je dit terugdraaien, stuur me dan “je mag me weer benaderen”.",
    );
  }
  if (/pauzeer/i.test(text)) {
    const weeks = /week/i.test(text) ? 1 : 4;
    const until = addWeeks(new Date(), weeks);
    return steer(
      { contact_paused_until: until.toISOString() },
      `heeft de bot ${weeks === 1 ? "een week" : "een maand"} gepauzeerd.`,
      `Is goed. Ik laat je ${weeks === 1 ? "een week" : "een maand"} met rust.`,
    );
  }
  if (/mag (mij|me) weer benaderen|hervat/i.test(text)) {
    return steer({ contact_opt_out: false, contact_paused_until: null }, "wil weer door de bot benaderd worden.", "Fijn, dank je. Ik benader je weer als de redactie iets van je wil weten.");
  }

  // 2. An interview that is waiting for this person.
  const { data: interviews } = await db
    .from("interviews")
    .select("id, status, metadata")
    .eq("organization_id", input.organizationId)
    .eq("interviewee_profile_id", profile.id)
    .in("status", ["requested", "in_progress", "awaiting_confirmation"])
    .order("updated_at", { ascending: false })
    .limit(1);
  const interview = interviews?.[0];

  if (interview) {
    const base = { organizationId: input.organizationId, interviewId: interview.id, trigger: input.trigger };
    if (interview.status === "requested") {
      const choice: InviteChoice | null = /niet de juiste|iemand anders|beter .* vragen/i.test(text)
        ? "redirect"
        : /^(later|niet nu)|volgende week|ander moment/i.test(text)
          ? "later"
          : /^(nee|liever niet|geen tijd)/i.test(text)
            ? "declined"
            : /^(nu|ja|ok|oké|prima|start|kom maar)/i.test(text)
              ? "now"
              : null;
      if (!choice) {
        return { handled: "interview", reply: await say("Wil je de vragen nu beantwoorden, later, of ben je niet de juiste persoon? Antwoord met “nu”, “later” of “ik ben niet de juiste persoon”.") };
      }
      const outcome = await respondToInvite({ ...base, choice, redirectTo: choice === "redirect" ? text : null, by: profile.id });
      return { handled: "interview", reply: outcome.message ? await say(outcome.message, "interview_message") : null };
    }

    if (interview.status === "awaiting_confirmation") {
      await confirmInterviewSummary({ ...base, correction: YES.test(text) ? null : text, confirmedBy: profile.id, triggeredBy: profile.id });
      return {
        handled: "interview",
        reply: await say(
          YES.test(text)
            ? "Dank je wel. De redactie maakt er een concept van; je krijgt het te zien voordat er iets mee gebeurt."
            : "Dank je, ik heb je correctie verwerkt. De redactie maakt er een concept van; je krijgt het te zien voordat er iets mee gebeurt.",
        ),
      };
    }

    await db.from("interview_messages").insert({
      organization_id: input.organizationId,
      interview_id: interview.id,
      role: "interviewee",
      content: text,
      author_profile_id: profile.id,
    });
    const turn = await advanceInterview({ ...base, triggeredBy: profile.id });
    // After the last question the closing summary ("Klopt dit?") is the newest message.
    const next = turn.done ? ((await lastAgentMessage(db, interview.id)) ?? turn.message) : turn.message;
    return { handled: "interview", reply: next ? await say(turn.done ? `${turn.message}\n\n${next}` : next, "interview_message") : null };
  }

  // 3. Otherwise it is a tip for the editors.
  const tip = await handleTip({
    organizationId: input.organizationId,
    text,
    senderProfileId: profile.id,
    senderName: profile.full_name,
    via: "dm",
    trigger: input.trigger,
    isDemo: input.isDemo,
  });
  return { handled: "tip", reply: tip.reply };
}
