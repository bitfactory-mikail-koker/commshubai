import { describe, expect, it } from "vitest";
import { escapeHtml, htmlBlocks, htmlTextLength, stripHtml, wordCount } from "@/lib/html-text";

describe("stripHtml", () => {
  it("puts blocks on their own lines without markup", () => {
    expect(stripHtml("<h2>Titel</h2><p>Eerste <strong>alinea</strong>.</p><p>Tweede.</p>")).toBe("Titel\nEerste alinea.\nTweede.");
  });

  it("decodes entities, including numeric and named ones", () => {
    expect(stripHtml("<p>a &amp; b &lt; c &eacute; &#169; &nbsp;d</p>")).toBe("a & b < c é ©  d");
  });

  it("does not shout headings and drops link targets", () => {
    expect(stripHtml('<h2>Mooi nieuws</h2><p><a href="https://example.com">lees</a></p>')).toBe("Mooi nieuws\nlees");
  });

  it("writes lists without bullets and keeps line breaks", () => {
    expect(stripHtml("<ul><li>een</li><li>twee</li></ul><ol><li>drie</li></ol><p>a<br>b</p>")).toBe("een\ntwee\ndrie\na\nb");
  });

  it("returns an empty string for empty input", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml("   ")).toBe("");
  });
});

describe("htmlBlocks", () => {
  it("returns one trimmed entry per block", () => {
    expect(htmlBlocks("<p> een </p><blockquote><p>twee</p></blockquote><p></p>")).toEqual(["een", "twee"]);
  });
});

describe("counting", () => {
  it("counts words and characters of the visible text", () => {
    expect(wordCount("<p>een twee</p><p>drie</p>")).toBe(3);
    expect(htmlTextLength("<p>abc</p>")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
