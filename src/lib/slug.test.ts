import { describe, expect, it } from "vitest";
import { toSlug } from "@/lib/slug";

describe("toSlug", () => {
  it("folds accents instead of cutting words apart", () => {
    expect(toSlug("Cliëntenportaal Mijn Veldhuis", { maxLength: 60 })).toBe("clientenportaal-mijn-veldhuis");
  });

  it("uses the separator, trims it and respects the length", () => {
    expect(toSlug("  Wat een Mooi / Nieuws!  ", { separator: "_", maxLength: 40 })).toBe("wat_een_mooi_nieuws");
    expect(toSlug("een twee drie vier", { maxLength: 8 })).toBe("een-twee");
  });

  it("falls back when nothing is left", () => {
    expect(toSlug("!!!", { maxLength: 40, fallback: "stuk" })).toBe("stuk");
    expect(toSlug("!!!", { maxLength: 40 })).toBe("");
  });
});
