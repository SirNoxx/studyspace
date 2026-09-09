import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
export function visibleText(markdown: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const text = (node: any): string =>
    node.type === "text" || node.type === "inlineCode" || node.type === "code"
      ? node.value
      : node.type === "image"
        ? (node.alt ?? "")
        : (node.children ?? [])
            .map(text)
            .join(
              ["root", "list", "blockquote"].includes(node.type) ? "\n\n" : "",
            );
  return text(tree);
}
export function locateQuote(
  markdown: string,
  quote: string,
  prefix = "",
  suffix = "",
) {
  if (!quote) return { state: "attached" as const, index: 0, text: markdown };
  const body = markdown.includes(quote) ? markdown : visibleText(markdown);
  const matches = [
    ...body.matchAll(
      new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    ),
  ].map((m) => m.index!);
  const precise = matches.filter(
    (i) =>
      (!prefix || body.slice(Math.max(0, i - prefix.length), i) === prefix) &&
      (!suffix ||
        body.slice(i + quote.length, i + quote.length + suffix.length) ===
          suffix),
  );
  return {
    state:
      precise.length === 1 || matches.length === 1
        ? ("attached" as const)
        : matches.length
          ? ("changed" as const)
          : ("unresolved" as const),
    index:
      precise.length === 1
        ? precise[0]
        : matches.length === 1
          ? matches[0]
          : -1,
    text: body,
  };
}
