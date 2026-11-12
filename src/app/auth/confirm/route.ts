import { NextResponse, type NextRequest } from "next/server";
import { logSystemAction } from "@/lib/audit";
import { safeNextPath } from "@/lib/safe-path";
import { LoginError } from "@/lib/sso";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const target = safeNextPath(url.searchParams.get("next"), "/for-me");
  const fail = (reason: LoginError) => NextResponse.redirect(new URL(`/login?fout=${reason}`, url.origin));
  if (!tokenHash || url.searchParams.get("type") !== "signup") return fail(LoginError.Confirmation);

  const db = await createClient();
  const { data, error } = await db.auth.verifyOtp({ type: "signup", token_hash: tokenHash });
  if (error || !data.user) return fail(LoginError.Confirmation);

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id, organization_id, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await db.auth.signOut();
    return fail(LoginError.NoAccount);
  }

  await logSystemAction(admin, {
    organizationId: profile.organization_id,
    action: "auth.email_confirmed",
    summary: "E-mailadres bevestigd.",
    metadata: { profile_id: profile.id },
  });
  return NextResponse.redirect(new URL(target, url.origin));
}
