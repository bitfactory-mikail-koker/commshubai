import { TextNode, type Node } from "node-html-parser";

export function textNodes(node: Node): TextNode[] {
  return node.childNodes.flatMap((child) => (child instanceof TextNode ? [child] : textNodes(child)));
}
