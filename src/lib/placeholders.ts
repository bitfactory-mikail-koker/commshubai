import { parse } from "node-html-parser";
import { textNodes } from "@/lib/html-nodes";

const PLACEHOLDER = /\[AANVULLEN[^\]]*\]/g;

export function markPlaceholders<T extends string>(html: T): T {
  if (!html.includes("[AANVULLEN")) return html;
  const root = parse(html);
  for (const node of textNodes(root)) {
    const marked = node.rawText.replace(PLACEHOLDER, (match) => `<mark class="placeholder-mark">${match}</mark>`);
    if (marked !== node.rawText) node.parentNode?.exchangeChild(node, parse(marked));
  }
  return root.toString() as T;
}
