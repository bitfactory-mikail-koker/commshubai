import { env } from "@/lib/env";
import { handleInboundMail } from "@/lib/redactie/intake";
import { redactieSettings } from "@/lib/redactie/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/secure-compare";

export const dynamic = "force-dynamic";

/**
 * Webhook for the editors' mailbox. Point the inbound-mail feature of your mail
 * provider at this URL and send, as JSON: { to, from, subject, text }.
 * Authorization: Bearer INBOUND_MAIL_SECRET.
 *
 * The organization is found by the mailbox address. Mail from outside the
 * organization's own domain is refused unread; the text of accepted mail is
 * judged as a tip and never treated as an instruction.
 */
export async function POST(request: Request) {
  const secret = env.inboundMailSecret;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(given, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { to?: string; from?: string; subject?: string; text?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload.to || !payload.from || !payload.text) {
    return Response.json({ error: "to, from and text are required" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: organizations } = await db.from("organizations").select("id, settings");
  const to = payload.to.trim().toLowerCase();
  const organization = (organizations ?? []).find((o) => {
    const address = redactieSettings(o.settings).mailboxAddress.toLowerCase();
    return address && to.includes(address);
  });
  if (!organization) return Response.json({ accepted: false, reason: "Unknown mailbox" }, { status: 404 });

  const result = await handleInboundMail({
    organizationId: organization.id,
    from: payload.from,
    subject: payload.subject ?? null,
    text: payload.text,
    trigger: "event",
  });
  return Response.json({ accepted: result.accepted, reason: result.reason ?? null, outcome: result.result?.outcome ?? null });
}
