import { describe, expect, it } from "vitest";
import { MAX_QUERY_LENGTH, MAX_TERMS, MIN_TERM_LENGTH, parseSearchQuery } from "@/lib/search/query";

describe("parseSearchQuery", () => {
  it("returns null for empty or punctuation-only input", () => {
    expect(parseSearchQuery(undefined)).toBeNull();
    expect(parseSearchQuery("   ")).toBeNull();
    expect(parseSearchQuery("&|!():*")).toBeNull();
  });

  it("ignores single letters, which match nearly everything", () => {
    expect(MIN_TERM_LENGTH).toBe(2);
    expect(parseSearchQuery("a")).toBeNull();
    expect(parseSearchQuery("a b")).toBeNull();
    expect(parseSearchQuery("een a klant")?.terms).toEqual(["een", "klant"]);
  });

  it("builds a prefix AND query from the words", () => {
    expect(parseSearchQuery("Veldhuis portaal")?.tsquery).toBe("veldhuis:* & portaal:*");
  });

  it("keeps accented letters", () => {
    expect(parseSearchQuery("Cliëntenportaal")?.terms).toEqual(["cliëntenportaal"]);
  });

  it("cannot inject tsquery operators", () => {
    const parsed = parseSearchQuery("a' | b & !c <-> d");
    expect(parsed).toBeNull();
    expect(parseSearchQuery("ab' | cd & !ef <-> gh")?.tsquery).toBe("ab:* & cd:* & ef:* & gh:*");
  });

  it("escapes LIKE wildcards in the substring pattern", () => {
    expect(parseSearchQuery("100%_a")?.like).toBe("%100\\%\\_a%");
  });

  it("caps the length and the number of terms", () => {
    const many = Array.from({ length: 30 }, (_, index) => `w${index}`).join(" ");
    expect(parseSearchQuery(many)?.terms).toHaveLength(MAX_TERMS);
    expect(parseSearchQuery("a".repeat(500))?.terms[0]).toHaveLength(MAX_QUERY_LENGTH);
  });
});
