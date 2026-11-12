import type { UserIdentity } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { googleIdentityAllowed, isGoogleLoginEmail, parseSsoProvider, signedInIdentity, SsoProvider, ssoProviderOf } from "@/lib/sso";

const identity = (provider: string, lastSignIn: string, data: Record<string, unknown> = {}): UserIdentity => ({
  id: `${provider}-id`,
  user_id: "u1",
  identity_id: `${provider}-identity`,
  provider,
  last_sign_in_at: lastSignIn,
  identity_data: data,
});

describe("isGoogleLoginEmail", () => {
  it("accepts nobears.nl addresses in any case", () => {
    expect(isGoogleLoginEmail("sadra@nobears.nl")).toBe(true);
    expect(isGoogleLoginEmail("Sadra@NoBears.NL")).toBe(true);
  });

  it("rejects other domains and look-alikes", () => {
    expect(isGoogleLoginEmail("sadra@gmail.com")).toBe(false);
    expect(isGoogleLoginEmail("sadra@evilnobears.nl")).toBe(false);
    expect(isGoogleLoginEmail("sadra@nobears.nl.evil.com")).toBe(false);
    expect(isGoogleLoginEmail("sadra@sub.nobears.nl")).toBe(false);
  });

  it("rejects a missing address", () => {
    expect(isGoogleLoginEmail(undefined)).toBe(false);
    expect(isGoogleLoginEmail(null)).toBe(false);
    expect(isGoogleLoginEmail("")).toBe(false);
  });
});

describe("parseSsoProvider", () => {
  it("reads the provider and defaults to Slack", () => {
    expect(parseSsoProvider("google")).toBe(SsoProvider.Google);
    expect(parseSsoProvider("slack_oidc")).toBe(SsoProvider.Slack);
    expect(parseSsoProvider(null)).toBe(SsoProvider.Slack);
    expect(parseSsoProvider("github")).toBe(SsoProvider.Slack);
  });
});

describe("the identity used for this sign-in", () => {
  it("is the one signed in most recently, not the account's first provider", () => {
    const picked = signedInIdentity([
      identity("email", "2026-01-01T10:00:00Z"),
      identity("slack_oidc", "2026-02-01T10:00:00Z"),
      identity("google", "2026-11-11T10:00:00Z"),
    ]);
    expect(picked?.provider).toBe("google");
    expect(ssoProviderOf(picked)).toBe(SsoProvider.Google);
  });

  it("is not an SSO identity for a password sign-in", () => {
    const picked = signedInIdentity([identity("email", "2026-11-11T10:00:00Z"), identity("google", "2026-01-01T10:00:00Z")]);
    expect(ssoProviderOf(picked)).toBeNull();
  });

  it("is null without identities", () => {
    expect(signedInIdentity(undefined)).toBeNull();
    expect(ssoProviderOf(null)).toBeNull();
  });
});

describe("googleIdentityAllowed", () => {
  it("needs a verified nobears.nl email in the Google identity itself", () => {
    expect(googleIdentityAllowed(identity("google", "x", { email: "a@nobears.nl", email_verified: true }))).toBe(true);
    expect(googleIdentityAllowed(identity("google", "x", { email: "a@nobears.nl", email_verified: false }))).toBe(false);
    expect(googleIdentityAllowed(identity("google", "x", { email: "a@gmail.com", email_verified: true }))).toBe(false);
    expect(googleIdentityAllowed(identity("google", "x", {}))).toBe(false);
  });
});
