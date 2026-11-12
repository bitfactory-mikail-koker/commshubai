import { NextResponse, type NextRequest } from "next/server";
import { logSystemAction } from "@/lib/audit";
import { safeNextPath } from "@/lib/safe-path";
import {
  auditActionFor,
  auditSummaryFor,
  failureFor,
  googleIdentityAllowed,
  LoginError,
  parseSsoProvider,
  signedInIdentity,
  SsoProvider,
  ssoProviderOf,
} from "@/lib/sso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const target = safeNextPath(url.searchParams.get("next"), "/for-me");
  const requested = parseSsoProvider(url.searchParams.get("provider"));
  const fail = (reason: LoginError) => NextResponse.redirect(new URL(`/login?fout=${reason}`, url.origin));
  if (!code) return fail(failureFor(requested));

  const db = await createClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error || !data.user) return fail(failureFor(requested));

  const identity = signedInIdentity(data.user.identities);
  const provider = ssoProviderOf(identity);
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, organization_id, is_active").eq("id", data.user.id).maybeSingle();
  const createdByThisLogin = !profile && (data.user.identities?.length ?? 0) <= 1;
  const reject = async (reason: LoginError) => {
    await db.auth.signOut();
    if (createdByThisLogin) await admin.auth.admin.deleteUser(data.user.id);
    return fail(reason);
  };

  if (!identity || !provider) return reject(failureFor(requested));
  if (provider === SsoProvider.Google && !googleIdentityAllowed(identity)) return reject(LoginError.Domain);
  if (!profile || !profile.is_active) return reject(LoginError.NoAccount);

  if (provider === SsoProvider.Slack) {
    await admin.from("profiles").update({ slack_user_id: identity.id }).eq("id", profile.id).is("slack_user_id", null);
  }
  await logSystemAction(admin, {
    organizationId: profile.organization_id,
    action: auditActionFor(provider),
    summary: auditSummaryFor(provider),
    metadata: { profile_id: profile.id },
  });
  return NextResponse.redirect(new URL(target, url.origin));
}
