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
