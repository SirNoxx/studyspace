import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import type { Definition } from "./model";
import { normalizeTaskLists } from "./task-lists";
import {pdfModuleSchema} from "./pdf-module";
import {studyCodeBlocks} from "./code-blocks";
import {publicSpreadsheetPreviews} from './spreadsheets/references';
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
/** Accept the compact task shorthand in reading views as well as the editor. */
export function compactTaskLists() {
  return (tree: any, file: { value: unknown }) => {
    const source = String(file.value);
    visit(tree, "listItem", (item: any) => {
      if (item.checked != null) return;
      const paragraph = item.children?.[0];
      const text = paragraph?.type === "paragraph" && paragraph.children?.[0];
      if (text?.type !== "text") return;
      const offset = text.position?.start.offset;
      const match = /^\[\](?:[\t ]+|$)/.exec(text.value);
      // Escaped markers and links must remain literal text / links.
      if (!match || offset == null || source.slice(offset, offset + 2) !== "[]") return;
      item.checked = false;
      text.value = text.value.slice(match[0].length);
    });
  };
}
export function proseRanges(markdown: string) {
  const ranges: { from: number; to: number; text: string }[] = [];
  const tree = parser.parse(markdown);
  const frontmatter =
    markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)?.[0].length ?? 0;
  visit(tree, (node: any, _index, parent: any) => {
    if (
      node.type === "text" &&
      node.position &&
      node.position.start.offset >= frontmatter &&
      !["link", "linkReference", "image", "definition"].includes(parent?.type)
    ) {
      ranges.push({
        from: node.position.start.offset,
        to: node.position.end.offset,
        text: node.value,
      });
    }
  });
  return ranges;
}
/** Parsed references only: prose and code examples must not claim attachment ownership. */
export function attachmentTargets(markdown: string): string[] {
  const tree = parser.parse(
    markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ""),
  );
  const found = new Set<string>();
  for(const block of studyCodeBlocks(markdown).filter(b=>b.language==="module")) {
    try {const pdf=pdfModuleSchema.safeParse(JSON.parse(block.code));if(pdf.success&&pdf.data.source)found.add(pdf.data.source);}catch{/* Invalid module remains source text. */}
  }
  const definitions = new Map<string, string>();
  visit(tree, (node: any) => {
    if (node.type === "definition") definitions.set(node.identifier, node.url);
  });
  visit(tree, (node: any) => {
    if (node.type === "link" || node.type === "image") found.add(node.url);
    if (node.type === "linkReference" || node.type === "imageReference") {
      const url = definitions.get(node.identifier);
      if (url) found.add(url);
    }
    if (node.type === "text")
      for (const match of node.value.matchAll(
        /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g,
      ))
        found.add(match[1]);
  });
  return [...found].filter(
    (target) => !/^(?:https?:|mailto:|data:|#)/i.test(target),
  );
}
export function captureLinks(markdown: string): string[] {
  const found = new Set<string>();
  const tree = parser.parse(
    markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ""),
  );
  visit(tree, (node: any) => {
    if (node.type === "link" && /^https?:\/\//i.test(node.url))
      found.add(node.url);
    if (node.type === "text") {
      for (const m of node.value.matchAll(
        /https?:\/\/[^\s<>\[\]"`]+|\b10\.\d{4,9}\/[^\s<>]+|\barXiv:\s*\d{4}\.\d{4,5}(?:v\d+)?|\bISBN(?:-1[03])?:?\s*[\dX][\dX -]{8,20}[\dX]/gi,
      ))
        found.add(m[0].replace(/[.,;)]+$/, ""));
    }
  });
  return [...found].filter((url) => {
    try {
      const u = new URL(url);
      return (
        !["localhost", "127.0.0.1"].includes(u.hostname) &&
        !u.pathname.startsWith("/api/")
      );
    } catch {
      return true;
    }
  });
}
export function validISBN(value: string) {
  const s = value.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s))
    return (
      [...s].reduce(
        (a, c, i) => a + (c === "X" ? 10 : Number(c)) * (10 - i),
        0,
      ) %
        11 ===
      0
    );
  if (/^97[89]\d{10}$/.test(s))
    return (
      [...s].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0
    );
  return false;
}
export function identifySource(
  input: string,
): { canonical: string; kind: "url" | "doi" | "arxiv" | "isbn" } | null {
  const value = input.trim().replace(/^ISBN(?:-1[03])?:?\s*/i, "");
  const doi = value.match(
    /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i,
  );
  if (doi)
    return {
      kind: "doi",
      canonical: "https://doi.org/" + doi[1].toLowerCase(),
    };
  const arxiv = value.match(
    /^(?:arxiv:\s*|https?:\/\/arxiv\.org\/(?:abs|pdf)\/)?((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)(?:\.pdf)?$/i,
  );
  if (arxiv)
    return { kind: "arxiv", canonical: "https://arxiv.org/abs/" + arxiv[1] };
  if (validISBN(value))
    return {
      kind: "isbn",
      canonical: "isbn:" + value.replace(/[\s-]/g, "").toUpperCase(),
    };
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol)) return null;
    u.hash = "";
    if (
      ![...u.searchParams.keys()].some((k) =>
        /signature|token|credential|x-amz/i.test(k),
      )
    )
      for (const key of [...u.searchParams.keys()])
        if (/^utm_|^fbclid$|^gclid$/i.test(key)) u.searchParams.delete(key);
    return { kind: "url", canonical: u.toString() };
  } catch {
    return null;
  }
}
export interface Match {
  from: number;
  to: number;
  entry: Definition;
}
interface Trie {
  children: Map<string, Trie>;
  entry?: Definition;
}
const matchers = new WeakMap<
  Definition[],
  (text: string, offset?: number) => Match[]
>();
export function conceptMatcher(entries: Definition[]) {
  const cached = matchers.get(entries);
  if (cached) return cached;
  const root: Trie = { children: new Map() };
  for (const entry of entries)
    for (const term of [entry.term, ...entry.aliases]) {
      let node = root;
      for (const c of term.trim().replace(/\s+/gu, " ").toLocaleLowerCase()) {
        if (!node.children.has(c))
          node.children.set(c, { children: new Map() });
        node = node.children.get(c)!;
      }
      if (!node.entry) node.entry = entry;
    }
  const match = (text: string, offset = 0): Match[] => {
    const result: Match[] = [];
    const word = (c: string) => /[\p{L}\p{N}_]/u.test(c);
    for (let i = 0; i < text.length; i++) {
      if (i > 0 && word(text[i - 1])) continue;
      let node = root,
        best: Match | undefined;
      for (let j = i; j < text.length; j++) {
        const whitespace = /\s/u.test(text[j]);
        const next = node.children.get(
          whitespace ? " " : text[j].toLocaleLowerCase(),
        );
        if (!next) break;
        if (whitespace)
          while (j + 1 < text.length && /\s/u.test(text[j + 1])) j++;
        node = next;
        if (node.entry && (j + 1 === text.length || !word(text[j + 1])))
          best = { from: i + offset, to: j + 1 + offset, entry: node.entry };
      }
      if (best) {
        result.push(best);
        i = best.to - offset - 1;
      }
    }
    return result;
  };
  matchers.set(entries, match);
  return match;
}
export function conceptMatches(markdown: string, entries: Definition[]) {
  const match = conceptMatcher(entries);
  return proseRanges(markdown)
    .flatMap((r) => match(markdown.slice(r.from, r.to), r.from))
    .filter(
      (m) => !markdown.slice(0, m.from).split("\n").at(-1)?.includes("$$"),
    );
}
export function publicMarkdown(
  body: string,
  titles: Set<string>,
  ids: Set<string>,
  assets: Set<string> = new Set(),
) {
    for(const block of studyCodeBlocks(body).filter(b=>b.language==="module").reverse()) {
      try {const pdf=pdfModuleSchema.safeParse(JSON.parse(block.code));if(pdf.success&&(!pdf.data.source.startsWith("attachment:")||!assets.has(pdf.data.source.slice(11))))body=body.slice(0,block.from)+"[PDF attachment not included in this publication]"+body.slice(block.to);}catch{/* Invalid modules are preserved. */}
    }
    let safe = publicSpreadsheetPreviews(body)
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  safe = safe.replace(/!?\[\[([^\]]+)\]\]/g, (_all, raw: string) => {
    const [target, alias] = raw.split("|");
    const name = target.split("#")[0].replace(/\.md$/i, "");
    return titles.has(name)
      ? `[[${target}${alias ? "|" + alias : ""}]]`
      : "[Unpublished reference]";
  });
  safe = safe.replace(
    /!?\[([^\]]*)\]\(([^)]+)\)/g,
    (all, label: string, url: string) => {
      if (url.startsWith("#note:"))
        return ids.has(url.slice(6)) ? all : "[Unpublished reference]";
      const target = url.replace(/^\/?(?:w\/note|note)\//, "");
      if (url.startsWith("attachment:") && assets.has(url.slice(11)))
        return all;
      if (ids.has(target) || /^https?:\/\//i.test(url) || url.startsWith("#"))
        return all.startsWith("!") ? "[Image excluded]" : all;
      return "[Private reference excluded]";
    },
  );
  return safe.replace(/<[^>]*>/g, "");
}
export function readingMarkdown(body: string) {
  return normalizeTaskLists(body
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/^>\s*\[!(\w+)\]([^\n]*)/gm, "> **$1$2**")
    .replace(/==([^=\n]+)==/g, "**$1**"));
}
export function resolveLink(
  target: string,
  fromPath: string,
  notes: {
    id: string;
    title: string;
    originalPath?: string;
    metadata?: Record<string, unknown>;
  }[],
) {
  const stable = target.replace(/^#note:/, "");
  if (/^[0-9a-f-]{36}$/i.test(stable))
    return notes.some((n) => n.id === stable)
      ? { status: "resolved", id: stable }
      : { status: "missing", candidates: [] };
  const raw = decodeURIComponent(target.split("|")[0].split("#")[0]).replace(
    /\.md$/i,
    "",
  );
  const normalize = (p: string) => {
    const out: string[] = [];
    for (const part of p.replace(/\\/g, "/").split("/")) {
      if (part === "..") out.pop();
      else if (part !== "." && part) out.push(part);
    }
    return out.join("/").normalize("NFC");
  };
  const relative = normalize(
    fromPath.split("/").slice(0, -1).join("/") + "/" + raw,
  );
  const exact = notes.filter(
    (n) =>
      normalize((n.originalPath ?? n.title).replace(/\.md$/i, "")) === relative,
  );
  if (exact.length === 1) return { status: "resolved", id: exact[0].id };
  const absolute = notes.filter(
    (n) =>
      normalize((n.originalPath ?? n.title).replace(/\.md$/i, "")) ===
      normalize(raw),
  );
  if (absolute.length === 1) return { status: "resolved", id: absolute[0].id };
  const candidates = notes.filter(
    (n) =>
      n.title === raw ||
      n.originalPath?.split("/").at(-1)?.replace(/\.md$/i, "") === raw ||
      (Array.isArray(n.metadata?.aliases) && n.metadata.aliases.includes(raw)),
  );
  return candidates.length === 1
    ? { status: "resolved", id: candidates[0].id }
    : {
        status: candidates.length ? "ambiguous" : "missing",
        candidates: candidates.map((n) => n.id),
      };
}

/** Explicit occurrence links are independent of dictionary terms and aliases. */
export function definitionLinks(body: string) {
  const links: {
    id: string;
    from: number;
    to: number;
    labelFrom: number;
    labelTo: number;
  }[] = [];
  visit(parser.parse(body), "link", (node: any) => {
    if (!node.url?.startsWith("#definition:") || !node.position) return;
    const from = node.position.start.offset,
      to = node.position.end.offset;
    const split = body.slice(from, to).lastIndexOf("](");
    if (split < 1) return;
    try {
      const id = decodeURIComponent(node.url.slice(12));
      if (id)
        links.push({
          id,
          from,
          to,
          labelFrom: from + 1,
          labelTo: from + split,
        });
    } catch {}
  });
  return links;
}
export function definitionLink(text: string, id: string) {
  if (!text.trim() || /\n\s*\n/.test(text))
    throw Error("Select text within one paragraph to attach a definition.");
  return `[${text.replace(/([\\`*_[\]<>!])/g, "\\$1")}](#definition:${encodeURIComponent(id)})`;
}
export function includeLinkedDefinitions(
  body: string,
  scoped: Definition[],
  all: Definition[],
) {
  const ids = new Set(definitionLinks(body).map((link) => link.id));
  return [
    ...scoped,
    ...all.filter(
      (entry) =>
        !entry.trashed &&
        ids.has(entry.id) &&
        !scoped.some((d) => d.id === entry.id),
    ),
  ];
}

/** Never create nested links or modify code examples when attaching a concept. */
export function definitionAttachmentRange(
  body: string,
  from: number,
  to: number,
) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to > body.length ||
    from >= to
  )
    throw Error("Highlight the text you want to link again.");
  const existing = definitionLinks(body).find(
    (link) =>
      (link.labelFrom === from && link.labelTo === to) ||
      (link.from === from && link.to === to),
  );
  if (existing) return { from: existing.from, to: existing.to };
  visit(parser.parse(body), (node: any) => {
    if (
      ![
        "link",
        "linkReference",
        "image",
        "imageReference",
        "inlineCode",
        "code",
        "html",
      ].includes(node.type) ||
      !node.position
    )
      return;
    if (node.position.start.offset < to && node.position.end.offset > from)
      throw Error(
        "Select plain text outside an existing link or code block to attach a definition.",
      );
  });
  return { from, to };
}
