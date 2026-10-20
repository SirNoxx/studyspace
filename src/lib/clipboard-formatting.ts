import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Table, RootContent } from "mdast";
import Turndown from "turndown";
import { gfm } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";
import { moduleSchema } from "./modules";
import { codeFence } from "./code-blocks";
import { normalizeTaskLists } from "./task-lists";

const parser = unified().use(remarkParse).use(remarkGfm);

/** Recover a known clipboard failure only when every missing header is accounted for. */
function recoverHeaders(headers: string[]) {
  if (headers.length < 2 || !headers[0] || headers.slice(1).some(Boolean))
    return headers;
  const bold = /^\*\*(.+)\*\*$/.exec(headers[0]);
  const labels = (bold?.[1] ?? headers[0]).split(/(?<=[a-z])(?=[A-Z])/);
  return labels.length === headers.length
    ? labels.map((label) => (bold ? `**${label}**` : label))
    : headers;
}

function tableData(table: Table, markdown: string) {
  const rows = table.children.map((row) =>
    row.children.map((cell) => {
      const first = cell.children[0]?.position?.start.offset;
      const last = cell.children.at(-1)?.position?.end.offset;
      return first == null || last == null
        ? ""
        : markdown.slice(first, last).replace(/\\\|/g, "|");
    }),
  );
  const headers = recoverHeaders(rows.shift() ?? []);
  // Never truncate an oversized table or discard additional cells.
  if (rows.some((row) => row.length > headers.length)) return null;
  const parsed = moduleSchema.safeParse({
    version: 1,
    kind: "table",
    headers,
    rows: rows.map((row) => [
      ...row,
      ...Array(headers.length - row.length).fill(""),
    ]),
  });
  return parsed.success ? parsed.data : null;
}

/** Only top-level tables and Mermaid fences become blocks; quoted examples stay literal. */
export function formatPastedMarkdown(markdown: string) {
  markdown = normalizeTaskLists(markdown);
  if (
    markdown.length > 1_000_000 ||
    (!markdown.includes("|") && !/(?:`{3,}|~{3,})mermaid\b/i.test(markdown))
  )
    return markdown;
  const tree = parser.parse(markdown);
  const changes: { from: number; to: number; text: string }[] = [];
  tree.children.forEach((node: RootContent, index) => {
    if (
      node.type === "code" &&
      node.lang?.toLowerCase() === "mermaid" &&
      !node.meta
    ) {
      const from = node.position?.start.offset,
        to = node.position?.end.offset;
      if (from == null || to == null) return;
      const source = markdown.slice(from, to);
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(source)?.[1];
      // An unfinished fence is still being authored; do not swallow following prose.
      if (
        !fence ||
        !new RegExp(
          "\\n {0,3}" + fence[0] + "{" + fence.length + ",}[ \\t]*$",
        ).test(source)
      )
        return;
      changes.push({
        from,
        to,
        text: codeFence({
          id: crypto.randomUUID(),
          language: "mermaid",
          collapsed: false,
          code: node.value,
        }),
      });
      return;
    }
    if (node.type !== "table") return;
    const data = tableData(node, markdown);
    if (
      !data ||
      node.position?.start.offset == null ||
      node.position.end.offset == null
    )
      return;
    changes.push({
      from: node.position.start.offset,
      to: node.position.end.offset,
      text: codeFence({
        id: crypto.randomUUID(),
        language: "module",
        collapsed: false,
        title: "Table",
        code: JSON.stringify(data),
      }),
    });
    // Plain-text clips lose heading metadata. Recognize a short table caption,
    // but leave sentences, multiline paragraphs and other block types alone.
    const previous = tree.children[index - 1];
    if (
      previous?.type === "paragraph" &&
      previous.position?.start.offset != null &&
      previous.position.end.offset != null
    ) {
      const caption = markdown.slice(
        previous.position.start.offset,
        previous.position.end.offset,
      );
      if (
        /^[\p{L}\p{N}][\p{L}\p{N} \t&()/–—-]{0,79}$/u.test(caption) &&
        /^\s*\n\s*\n\s*$/.test(
          markdown.slice(
            previous.position.end.offset,
            node.position.start.offset,
          ),
        )
      ) {
        changes.push({
          from: previous.position.start.offset,
          to: previous.position.start.offset,
          text: "## ",
        });
      }
    }
  });
  for (const change of changes.sort((a, b) => b.from - a.from))
    markdown =
      markdown.slice(0, change.from) + change.text + markdown.slice(change.to);
  return markdown;
}

/** Local-only rich clipboard conversion; never execute or retain source page scripts. */
export function formatClipboard(plain: string, html: string) {
  // A chat/code editor may supply styled HTML that loses the Mermaid language.
  // Keep the complete Markdown when it already contains a top-level diagram.
  if (
    plain.length <= 1_000_000 &&
    /(?:`{3,}|~{3,})mermaid\b/i.test(plain) &&
    parser
      .parse(plain)
      .children.some(
        (node) =>
          node.type === "code" && node.lang?.toLowerCase() === "mermaid",
      )
  )
    return formatPastedMarkdown(plain);
  let markdown = plain;
  if (html && html.length <= 1_000_000) {
    const clean = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: [
        "style",
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
      ],
    });
    const container = document.createElement("div");
    container.innerHTML = clean;
    // Code editors also write HTML spans. Prefer their original plain Markdown.
    if (
      container.querySelector(
        "h1,h2,h3,h4,h5,h6,table,strong,b,em,i,ul,ol,blockquote,pre,a",
      )
    ) {
      const converter = new Turndown({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
        emDelimiter: "*",
      });
      converter.use(gfm);
      converter.addRule("studyspace-mermaid", {
        filter: (node) =>
          node.nodeName === "PRE" &&
          !!mermaidClipboardCode(node as HTMLElement),
        replacement: (_content, node) =>
          "\n\n" +
          codeFence({
            id: crypto.randomUUID(),
            language: "mermaid",
            collapsed: false,
            code: mermaidClipboardCode(node as HTMLElement)!,
          }) +
          "\n\n",
      });
      // Browser/Word/chat clipboard cells often wrap their contents in <p> or
      // <div>. Converting the entire table through GFM would insert blank lines
      // into a Markdown row and eject the remaining cells as ordinary prose.
      // Convert each DOM cell independently, keeping its row/column boundaries.
      converter.addRule("studyspace-table", {
        filter: (node) =>
          node.nodeName === "TABLE" &&
          !!clipboardTable(node as HTMLTableElement, converter),
        replacement: (_content, node) => {
          const data = clipboardTable(node as HTMLTableElement, converter)!;
          return (
            "\n\n" +
            codeFence({
              id: crypto.randomUUID(),
              language: "module",
              collapsed: false,
              title: "Table",
              code: JSON.stringify(data),
            }) +
            "\n\n"
          );
        },
      });
      const converted = converter.turndown(container);
      // These escapes were introduced by HTML conversion, not by the author.
      if (converted.trim()) markdown = normalizeTaskLists(converted, true);
    }
  }
  return formatPastedMarkdown(markdown);
}

function mermaidClipboardCode(pre: HTMLElement) {
  const code = pre.querySelector("code");
  const language =
    code?.getAttribute("data-language") ?? pre.getAttribute("data-language");
  return language?.toLowerCase() === "mermaid" ||
    /(?:^|\s)language-mermaid(?:\s|$)/i.test(code?.className ?? pre.className)
    ? (code ?? pre).textContent?.replace(/\n$/, "") || null
    : null;
}

function clipboardTable(table: HTMLTableElement, converter: Turndown) {
  if (table.querySelector("table")) return null;
  const rows: string[][] = [];
  const sourceRows = Array.from(table.rows);
  if (!sourceRows.length || sourceRows.length > 101) return null;
  for (let r = 0; r < sourceRows.length; r++) {
    rows[r] ??= [];
    let c = 0;
    for (const cell of Array.from(sourceRows[r].cells)) {
      while (rows[r][c] !== undefined) c++;
      const width = cell.colSpan || 1,
        height = cell.rowSpan || sourceRows.length - r;
      if (c + width > 12 || r + height > 101) return null;
      for (let down = 0; down < height; down++) {
        rows[r + down] ??= [];
        for (let right = 0; right < width; right++)
          rows[r + down][c + right] = "";
      }
      rows[r][c] = converter.turndown(cell.innerHTML).trim();
      c += width;
    }
  }
  const width = Math.max(...rows.map((row) => row.length));
  const headerRow =
    Array.from(sourceRows[0].cells).some((cell) => cell.tagName === "TH") ||
    sourceRows[0].parentElement?.tagName === "THEAD";
  const rectangular = rows.map((row) =>
    Array.from({ length: width }, (_, c) => row[c] ?? ""),
  );
  const headers = headerRow
    ? recoverHeaders(rectangular.shift()!)
    : Array.from({ length: width }, (_, c) => `Column ${c + 1}`);
  const parsed = moduleSchema.safeParse({
    version: 1,
    kind: "table",
    headers,
    rows: rectangular,
  });
  return parsed.success ? parsed.data : null;
}
