import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

/** Task syntax at the start of a prose line, including rich-paste escaped brackets. */
export function taskPrefix(text: string, repairEscapedCompact = false) {
  const match = /^((?:[-+*][\t ]*|\d+[.)][\t ]+)?)(?:\[([ xX]?)\]|\\\[([ xX]?)\\?\])(?=[\t ]|$)/.exec(text);
  if (!match) return null;
  if (match[3] === "" && !repairEscapedCompact) return null;
  const bullet = match[1];
  const checked = /x/i.test(match[2] ?? match[3]);
  return {
    marker: match[0],
    checked,
    canonical: (bullet ? bullet.replace(/[\t ]*$/, " ") : "- ") + (checked ? "[x]" : "[ ]"),
    bullet,
  };
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Normalize only prose task prefixes. Code, links, modules and frontmatter stay intact. */
export function normalizeTaskLists(markdown: string, repairEscapedCompact = false) {
  if (!markdown.includes("[")) return markdown;
  const tree = parser.parse(markdown);
  const protectedRanges: { from: number; to: number }[] = [];
  visit(tree, (node) => {
    if (["code", "inlineCode", "html", "link", "linkReference", "definition"].includes(node.type) && node.position)
      protectedRanges.push({from: node.position.start.offset!, to: node.position.end.offset!});
  });
  const frontmatter = markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length ?? 0;
  const changes = new Map<number, {to: number; insert: string}>();
  visit(tree, "paragraph", (node) => {
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if (start == null || end == null) return;
    let lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
    while (lineStart < end) {
      const next = markdown.indexOf("\n", lineStart);
      const lineEnd = next < 0 ? markdown.length : next;
      const line = markdown.slice(lineStart, lineEnd).replace(/\r$/, "");
      const indent = /^[\t ]*(?:>[\t ]*)*/.exec(line)![0].length;
      const from = lineStart + indent;
      const prefix = taskPrefix(line.slice(indent), repairEscapedCompact);
      if (prefix && from >= frontmatter && from + prefix.marker.length > start &&
          !protectedRanges.some(r => r.from < from + prefix.marker.length && r.to > from) &&
          prefix.marker !== prefix.canonical)
        changes.set(from, {to: from + prefix.marker.length, insert: prefix.canonical});
      if (next < 0) break;
      lineStart = next + 1;
    }
  });
  for (const [from, change] of [...changes].sort((a,b) => b[0] - a[0]))
    markdown = markdown.slice(0, from) + change.insert + markdown.slice(change.to);
  return markdown;
}
