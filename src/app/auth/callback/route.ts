import { NextResponse, type NextRequest } from "next/server";
import { logSystemAction } from "@/lib/audit";
import {
  auditActionFor,
  auditSummaryFor,
  failureFor,
  isGoogleLoginEmail,
  LoginError,
  parseSsoProvider,
  SsoProvider,
} from "@/lib/sso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const provider = parseSsoProvider(url.searchParams.get("provider"));
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/for-me";
  const fail = (reason: LoginError) => NextResponse.redirect(new URL(`/login?fout=${reason}`, url.origin));
  if (!code) return fail(failureFor(provider));

  const db = await createClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail(failureFor(provider));

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, organization_id, is_active").eq("id", data.user.id).maybeSingle();

  if (provider === SsoProvider.Google) {
    const verified = data.user.user_metadata?.email_verified === true;
    if (!verified || !isGoogleLoginEmail(data.user.email)) {
      await db.auth.signOut();
      if (!profile) await admin.auth.admin.deleteUser(data.user.id);
      return fail(LoginError.Domain);
    }
  }

  if (!profile || !profile.is_active) {
    await db.auth.signOut();
    if (!profile) await admin.auth.admin.deleteUser(data.user.id);
    return fail(LoginError.NoAccount);
  }

  if (provider === SsoProvider.Slack) {
    const slackId = (data.user.user_metadata?.provider_id ?? data.user.user_metadata?.sub) as string | undefined;
    if (slackId) {
      await admin.from("profiles").update({ slack_user_id: slackId }).eq("id", profile.id).is("slack_user_id", null);
    }
  }
  await logSystemAction(admin, {
    organizationId: profile.organization_id,
    action: auditActionFor(provider),
    summary: auditSummaryFor(provider),
    metadata: { profile_id: profile.id },
  });
  return NextResponse.redirect(new URL(target, url.origin));
}
