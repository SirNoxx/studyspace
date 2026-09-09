import { locateQuote } from "./anchors";
export function focusPassage(
  root: Element | null,
  quote: string,
  prefix = "",
  suffix = "",
) {
  if (!root || !quote.trim()) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    positions: { node: Node; offset: number }[] = [];
  let text = "",
    node: Node | null;
  while ((node = walker.nextNode())) {
    const content = node.textContent ?? "";
    for (let i = 0; i < content.length; i++) {
      const char = /\s/.test(content[i]) ? " " : content[i];
      if (char === " " && text.endsWith(" ")) continue;
      text += char;
      positions.push({ node, offset: i });
    }
  }
  const target = quote.replace(/\s+/g, " ").trim(),
    start = locateQuote(
      text,
      target,
      prefix.replace(/\s+/g, " "),
      suffix.replace(/\s+/g, " "),
    ).index;
  if (start < 0) return false;
  const first = positions[start],
    last = positions[start + target.length - 1],
    range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  first.node.parentElement?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
  return true;
}
