import { describe, expect, it } from "vitest";
import { SNIPPET_END, SNIPPET_START } from "@/lib/search/markers";
import { highlightTerms, splitSnippet } from "@/lib/search/snippet";

describe("highlightTerms", () => {
  it("marks every case-insensitive occurrence, inside words too", () => {
    expect(highlightTerms("Klantcase voor klanten", ["lant"])).toEqual([
      { text: "K", match: false },
      { text: "lant", match: true },
      { text: "case voor k", match: false },
      { text: "lant", match: true },
      { text: "en", match: false },
    ]);
  });

  it("treats regex characters in terms literally", () => {
    expect(highlightTerms("a+b", ["a+b"])).toEqual([{ text: "a+b", match: true }]);
  });

  it("returns the text unchanged without terms", () => {
    expect(highlightTerms("tekst", [])).toEqual([{ text: "tekst", match: false }]);
  });
});

describe("splitSnippet", () => {
  it("uses the database markers", () => {
    expect(splitSnippet(`een ${SNIPPET_START}klant${SNIPPET_END} case`)).toEqual([
      { text: "een ", match: false },
      { text: "klant", match: true },
      { text: " case", match: false },
    ]);
  });

  it("highlights typed terms in the unmarked text", () => {
    const parts = splitSnippet("alleen klantgegevens", ["lant"]);
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual(["lant"]);
  });

  it("survives an unclosed marker", () => {
    expect(splitSnippet(`a ${SNIPPET_START}b`)).toEqual([
      { text: "a ", match: false },
      { text: "b", match: false },
    ]);
  });
});
