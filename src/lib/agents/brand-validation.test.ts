import { describe, expect, it } from "vitest";
import { validateBrand } from "@/lib/agents/brand-validation";

const base = {
  wordsToAvoid: ["innovatief", "uniek"],
  terminology: [{ term: "klant", instead_of: "opdrachtgever" }],
  classification: "external" as const,
};

describe("validateBrand", () => {
  it("passes text whose numbers and quotes come from the sources", () => {
    const result = validateBrand({
      ...base,
      html: "<p>„In de eerste week kwamen er 32% minder telefoontjes binnen”, zegt Tim.</p>",
      sourceTexts: ["In de eerste week kwamen er 32% minder telefoontjes binnen. Het team is trots."],
    });
    expect(result.issues).toEqual([]);
    expect(result.score).toBe(100);
  });

  it("flags numbers that are not in the source material", () => {
    const result = validateBrand({ ...base, html: "<p>De omzet steeg met 45%.</p>", sourceTexts: ["De omzet steeg."] });
    expect(result.issues.map((i) => i.type)).toContain("unverified_number");
    expect(result.issues.find((i) => i.type === "unverified_number")?.severity).toBe("error");
  });

  it("does not confuse 32% with 132%", () => {
    const result = validateBrand({ ...base, html: "<p>Een stijging van 32%.</p>", sourceTexts: ["Een stijging van 132%."] });
    expect(result.issues.some((i) => i.type === "unverified_number")).toBe(true);
  });

  it("flags quotes that nobody said", () => {
    const result = validateBrand({
      ...base,
      html: "<p>„Dit is het beste project dat we ooit hebben gedaan”, zegt Tim.</p>",
      sourceTexts: ["Het project is afgerond."],
    });
    expect(result.issues.map((i) => i.type)).toContain("unverified_quote");
  });

  it("flags words to avoid including inflected forms, and preferred terminology", () => {
    const result = validateBrand({
      ...base,
      html: "<p>Onze innovatieve aanpak helpt elke opdrachtgever.</p>",
      sourceTexts: [],
    });
    const types = result.issues.map((i) => i.type);
    expect(types).toContain("word_to_avoid");
    expect(types).toContain("terminology");
  });

  it("does not flag a word to avoid inside another word", () => {
    const result = validateBrand({ ...base, wordsToAvoid: ["uniek"], html: "<p>Een communiekje.</p>", sourceTexts: [] });
    expect(result.issues).toEqual([]);
  });

  it("reports open placeholders left by an agent", () => {
    const result = validateBrand({ ...base, html: "<p>[AANVULLEN: quote van de klant]</p>", sourceTexts: [] });
    expect(result.issues.map((i) => i.type)).toEqual(["open_placeholder"]);
  });

  it("warns about internal references in external content only", () => {
    const html = "<p>Zie ticket WEB-123 in #project-x.</p>";
    const external = validateBrand({ ...base, html, sourceTexts: ["WEB-123"] });
    const internal = validateBrand({ ...base, classification: "internal", html, sourceTexts: ["WEB-123"] });
    expect(external.issues.some((i) => i.type === "confidential")).toBe(true);
    expect(internal.issues.some((i) => i.type === "confidential")).toBe(false);
  });

  it("does not count a quoted sentence followed by a heading as one long sentence", () => {
    const result = validateBrand({
      ...base,
      html: "<p>„Zij weten precies waar het misgaat.”</p><h2>Het resultaat</h2><p>Een korte zin.</p>",
      sourceTexts: ["Zij weten precies waar het misgaat."],
    });
    expect(result.issues.some((i) => i.type === "long_sentence")).toBe(false);
  });
});
