import { describe, expect, it } from "vitest";
import { markPlaceholders } from "@/lib/placeholders";

describe("markPlaceholders", () => {
  it("wraps a placeholder in running text", () => {
    expect(markPlaceholders("<p>Hallo [AANVULLEN: naam] tot ziens</p>")).toBe(
      '<p>Hallo <mark class="placeholder-mark">[AANVULLEN: naam]</mark> tot ziens</p>',
    );
  });

  it("never changes attributes, so a link keeps working", () => {
    const html = '<p><a href="http://a.com/[AANVULLEN x]">tekst</a></p>';
    expect(markPlaceholders(html)).toBe(html);
  });

  it("marks a placeholder inside a link text", () => {
    expect(markPlaceholders('<a href="https://a.nl">[AANVULLEN: x]</a>')).toBe(
      '<a href="https://a.nl"><mark class="placeholder-mark">[AANVULLEN: x]</mark></a>',
    );
  });

  it("leaves text without a placeholder untouched", () => {
    expect(markPlaceholders("<p>niets te doen</p>")).toBe("<p>niets te doen</p>");
  });

  it("keeps entities escaped", () => {
    expect(markPlaceholders("<p>a &amp; b [AANVULLEN: &lt;x&gt;]</p>")).toBe(
      '<p>a &amp; b <mark class="placeholder-mark">[AANVULLEN: &lt;x&gt;]</mark></p>',
    );
  });
});
