import { NextResponse, type NextRequest } from "next/server";
import { logSystemAction } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Return address of "Inloggen met Slack". Exchanges the code for a session
 * and lets the person in only when they already belong to an organization:
 * people are added by the administrator (imported from Slack), never by
 * signing in. Supabase links the Slack identity to the existing account with
 * the same verified e-mail address.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/for-me";
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?fout=${reason}`, url.origin));
  if (!code) return fail("slack");

  const db = await createClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail("slack");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, organization_id, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await db.auth.signOut();
    // An account that only exists because of this sign-in attempt is removed again.
    if (!profile) await admin.auth.admin.deleteUser(data.user.id);
    return fail("geen-account");
  }

  // Remember the Slack user id, so the bot can reach this person.
  const slackId = (data.user.user_metadata?.provider_id ?? data.user.user_metadata?.sub) as string | undefined;
  if (slackId) {
    await admin.from("profiles").update({ slack_user_id: slackId }).eq("id", profile.id).is("slack_user_id", null);
  }
  await logSystemAction(admin, {
    organizationId: profile.organization_id,
    action: "auth.slack_login",
    summary: "Ingelogd met Slack.",
    metadata: { profile_id: profile.id },
  });
  return NextResponse.redirect(new URL(target, url.origin));
}
