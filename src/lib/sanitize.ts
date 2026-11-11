import "server-only";
import sanitize from "sanitize-html";
import type { SafeHtml } from "@/lib/safe-html";

const ALLOWED_TAGS = ["p", "h2", "h3", "ul", "ol", "li", "blockquote", "strong", "em", "b", "i", "u", "s", "br", "a", "hr"];
const REMOVED_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "textarea", "option"];

const OPTIONS: sanitize.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  nonTextTags: REMOVED_WITH_CONTENT,
  transformTags: {
    a: (tagName, attribs): sanitize.Tag => {
      const href = safeHref(attribs.href);
      const safe: Record<string, string> = href ? { href, target: "_blank", rel: "noopener noreferrer nofollow" } : {};
      return { tagName, attribs: safe };
    },
  },
};

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function safeHref(href: string | undefined): string | null {
  if (!href || !URL.canParse(href)) return null;
  return SAFE_PROTOCOLS.has(new URL(href).protocol) ? href : null;
}

export function sanitizeHtml(input: string | null | undefined): SafeHtml {
  if (!input) return "" as SafeHtml;
  return sanitize(input, OPTIONS) as SafeHtml;
}
