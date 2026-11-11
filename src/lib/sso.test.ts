import { describe, expect, it } from "vitest";
import { isGoogleLoginEmail, parseSsoProvider, SsoProvider } from "@/lib/sso";

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
