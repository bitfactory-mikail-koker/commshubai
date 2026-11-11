import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("keeps editorial formatting", () => {
    const html = "<h2>Titel</h2><p><strong>Vet</strong> en <em>cursief</em></p><ul><li>punt</li></ul><blockquote>quote</blockquote>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("removes scripts, handlers and unknown tags", () => {
    expect(sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><img src=x onerror=alert(1)>')).toBe("<p>a</p>");
  });

  it("cannot be tricked into reassembling a script tag", () => {
    expect(sanitizeHtml("<scr<script>ipt>alert(1)</scr</script>ipt>")).not.toMatch(/<script/i);
    // Fragments around a removed tag are escaped instead of joining up.
    expect(sanitizeHtml("<scr<b>ipt>alert(1)")).toBe("ipt&gt;alert(1)");
    expect(sanitizeHtml("a < b <i>c</i> > d")).toBe("a &lt; b <i>c</i> &gt; d");
  });

  it("only keeps http(s) and mailto links", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="https://example.com/a?b=1">x</a>')).toBe(
      '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });

  it("escapes stray angle brackets in text", () => {
    expect(sanitizeHtml("<p>1 < 2 > 0</p>")).toBe("<p>1 &lt; 2 &gt; 0</p>");
  });
});
