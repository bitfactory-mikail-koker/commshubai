import type { UserIdentity } from "@supabase/supabase-js";

export enum SsoProvider {
  Slack = "slack_oidc",
  Google = "google",
}

export enum LoginError {
  Slack = "slack",
  Google = "google",
  NoAccount = "geen-account",
  Domain = "domein",
}

export const GOOGLE_LOGIN_DOMAIN = "nobears.nl";

export function parseSsoProvider(value: string | null): SsoProvider {
  return Object.values(SsoProvider).find((provider) => provider === value) ?? SsoProvider.Slack;
}

export function failureFor(provider: SsoProvider): LoginError {
  return provider === SsoProvider.Google ? LoginError.Google : LoginError.Slack;
}

export function auditActionFor(provider: SsoProvider): string {
  return provider === SsoProvider.Google ? "auth.google_login" : "auth.slack_login";
}

export function auditSummaryFor(provider: SsoProvider): string {
  return provider === SsoProvider.Google ? "Ingelogd met Google." : "Ingelogd met Slack.";
}

export function isGoogleLoginEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${GOOGLE_LOGIN_DOMAIN}`);
}

export function signedInIdentity(identities: UserIdentity[] | undefined): UserIdentity | null {
  const stamp = (identity: UserIdentity) => Date.parse(identity.last_sign_in_at ?? identity.created_at ?? "") || 0;
  return [...(identities ?? [])].sort((a, b) => stamp(b) - stamp(a))[0] ?? null;
}

export function ssoProviderOf(identity: UserIdentity | null): SsoProvider | null {
  return Object.values(SsoProvider).find((provider) => provider === identity?.provider) ?? null;
}

export function googleIdentityAllowed(identity: UserIdentity): boolean {
  const data = identity.identity_data ?? {};
  return data.email_verified === true && isGoogleLoginEmail(typeof data.email === "string" ? data.email : null);
}
