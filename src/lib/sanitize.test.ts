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

  it("removes style, iframe and comment content", () => {
    expect(sanitizeHtml("<p>a</p><style>p{color:red}</style><iframe src=x>hidden</iframe><!-- c -->")).toBe("<p>a</p>");
  });

  it("cannot be tricked into reassembling a script tag", () => {
    const inputs = ["<scr<script>ipt>alert(1)</scr</script>ipt>", "<scr<b>ipt>alert(1)", "<<script>script>alert(1)<</script>/script>"];
    for (const input of inputs) expect(sanitizeHtml(input)).not.toMatch(/<script/i);
  });

  it("drops every attribute except a checked link", () => {
    expect(sanitizeHtml('<p style="x" class="y" id="z" onmouseover="a()">t</p>')).toBe("<p>t</p>");
  });

  it("only keeps http(s) and mailto links", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="data:text/html,<script>1</script>">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="//evil.example/x">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="https://example.com/a?b=1">x</a>')).toBe(
      '<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
    expect(sanitizeHtml('<a href="mailto:a@b.nl" target="_self" rel="x">x</a>')).toBe(
      '<a href="mailto:a@b.nl" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });

  it("escapes stray angle brackets in text", () => {
    expect(sanitizeHtml("<p>1 < 2 > 0</p>")).toBe("<p>1 &lt; 2 &gt; 0</p>");
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml("")).toBe("");
  });
});
