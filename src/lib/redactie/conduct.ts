import { differenceInDays } from "date-fns";
import { toZoned } from "@/lib/format";
import type { RedactieSettings } from "@/lib/redactie/settings";
import { isWorkingTime, nextWorkingMoment } from "@/lib/redactie/workdays";
import type { BotMessageKind } from "@/lib/types";

/**
 * The bot's manners, as one pure decision. Every message the bot wants to send
 * passes through here first; nothing else decides whether a colleague is
 * approached.
 */

export type Recipient = {
  botMayContact: boolean;
  contactOptOut: boolean;
  contactPausedUntil: string | null;
  absentUntil: string | null;
  inPilot: boolean;
  lastRequestedAt: string | null;
  isActive: boolean;
};

export type ChannelTarget = { followed: boolean; isPrivate: boolean; hasExternalMembers: boolean };

export type DeliveryRequest = {
  kind: BotMessageKind;
  medium: "dm" | "channel" | "thread" | "email";
  /** A new request for input (interview, input round). Approval requests do not count. */
  countsAsRequest: boolean;
  /** A direct answer to something the person just did or asked. Not held back by limits or office hours. */
  responsive: boolean;
  recipient: Recipient | null;
  channel: ChannelTarget | null;
};

export type DeliveryDecision =
  | { action: "deliver" }
  | { action: "shadow" }
  | { action: "schedule"; sendAfter: Date }
  | { action: "block"; reason: string };

/** Messages a colleague asked to be spared from: new requests and reminders about them. */
const UNSOLICITED: BotMessageKind[] = ["interview_invite", "input_request", "reminder", "weekly_overview"];

export function decideDelivery(request: DeliveryRequest, settings: RedactieSettings, now: Date): DeliveryDecision {
  if (settings.botPaused) return { action: "block", reason: "De bot is gepauzeerd." };

  const { recipient, channel } = request;

  if (request.medium === "channel" || request.medium === "thread") {
    if (!channel) return { action: "block", reason: "Dit kanaal is niet bekend." };
    if (channel.isPrivate) return { action: "block", reason: "De bot schrijft nooit in besloten kanalen." };
    if (channel.hasExternalMembers) return { action: "block", reason: "De bot schrijft nooit in kanalen met klanten of gasten." };
    if (!channel.followed) return { action: "block", reason: "Dit kanaal wordt niet gevolgd." };
  }

  if (recipient) {
    if (!recipient.isActive) return { action: "block", reason: "Deze persoon is niet meer actief." };
    if (!recipient.botMayContact) return { action: "block", reason: "De beheerder heeft ingesteld dat de bot deze persoon niet benadert." };
    if (settings.pilotOnly && !recipient.inPilot) return { action: "block", reason: "Deze persoon zit niet in de proefgroep." };

    if (!request.responsive) {
      const unsolicited = UNSOLICITED.includes(request.kind) || request.countsAsRequest;
      if (unsolicited && recipient.contactOptOut) {
        return { action: "block", reason: "Deze persoon heeft aangegeven niet benaderd te willen worden." };
      }
      if (unsolicited && recipient.contactPausedUntil && new Date(recipient.contactPausedUntil) > now) {
        return { action: "block", reason: "Deze persoon heeft de bot tijdelijk gepauzeerd." };
      }
      if (recipient.absentUntil && recipient.absentUntil >= isoDay(now)) {
        return { action: "block", reason: `Deze persoon is afwezig tot en met ${recipient.absentUntil}.` };
      }
      if (request.countsAsRequest && settings.minDaysBetweenRequests > 0 && recipient.lastRequestedAt) {
        const days = differenceInDays(now, new Date(recipient.lastRequestedAt));
        if (days < settings.minDaysBetweenRequests) {
          return {
            action: "block",
            reason: `Deze persoon kreeg minder dan ${settings.minDaysBetweenRequests} dagen geleden al een verzoek.`,
          };
        }
      }
    }
  }

  if (settings.shadowMode) return { action: "shadow" };

  if (!request.responsive && !isWorkingTime(now, settings.workStart, settings.workEnd)) {
    return { action: "schedule", sendAfter: nextWorkingMoment(now, settings.workStart, settings.workEnd) };
  }
  return { action: "deliver" };
}

/** Calendar day in the app timezone, as yyyy-mm-dd. */
export function isoDay(now: Date): string {
  const z = toZoned(now);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}
