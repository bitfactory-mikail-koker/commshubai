/**
 * Minimal allow-list HTML sanitizer for editorial content.
 *
 * Content reaches the database from the rich-text editor and from the AI
 * provider; both are treated as untrusted. Only a small set of formatting
 * tags survives, every attribute is dropped (links keep a checked href), and
 * any other "<" or ">" is escaped so removed fragments cannot recombine into
 * markup.
 */
const ALLOWED = new Set(["p", "h2", "h3", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "u", "s", "br", "a", "hr"]);
const VOID = new Set(["br", "hr"]);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

function safeHref(attributes: string): string | null {
  const match = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  if (!href) return null;
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return null;
  return href.replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E");
}

const escapeText = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  const html = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "");

  let out = "";
  let cursor = 0;
  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(html)) !== null) {
    out += escapeText(html.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    if (closing) {
      if (!VOID.has(tag)) out += `</${tag}>`;
    } else if (tag === "a") {
      const href = safeHref(match[3]);
      out += href ? `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">` : "<a>";
    } else {
      out += `<${tag}>`;
    }
  }
  out += escapeText(html.slice(cursor));
  return out;
}
