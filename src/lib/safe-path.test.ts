import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-path";

describe("safeNextPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeNextPath("/inbox", "/x")).toBe("/inbox");
    expect(safeNextPath("/search?q=klant&soort=article", "/x")).toBe("/search?q=klant&soort=article");
    expect(safeNextPath("/editorial/abc#comments", "/x")).toBe("/editorial/abc#comments");
  });

  it("rejects every way of leaving the site", () => {
    const attacks = [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "\\\\evil.com",
      "https://evil.com",
      "http://evil.com/x",
      "javascript:alert(1)",
      "evil.com",
      "/%5Cevil.com/../..//evil.com",
    ];
    for (const attack of attacks) {
      const result = safeNextPath(attack, "/fallback");
      expect(new URL(result, "https://app.example").origin, attack).toBe("https://app.example");
    }
    expect(safeNextPath("//evil.com", "/fallback")).toBe("/fallback");
    expect(safeNextPath("/\\evil.com", "/fallback")).toBe("/fallback");
    expect(safeNextPath("/\t/evil.com", "/fallback")).toBe("/fallback");
  });

  it("falls back for empty values", () => {
    expect(safeNextPath(null, "/fallback")).toBe("/fallback");
    expect(safeNextPath("", "/fallback")).toBe("/fallback");
    expect(safeNextPath(undefined, "/fallback")).toBe("/fallback");
  });
});
