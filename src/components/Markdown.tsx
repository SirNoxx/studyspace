"use client";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  useEffect,
  useRef,
  useState,
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import {
  readingMarkdown,
  conceptMatcher,
  proseRanges,
  resolveLink,
} from "@/lib/markdown";
import type { Definition, Attachment, Note } from "@/lib/model";
import AttachmentMedia, { findAttachment } from "./AttachmentMedia";
function Diagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("mermaid").then(async ({ default: m }) => {
      m.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        maxTextSize: 20000,
        flowchart: { htmlLabels: false },
        suppressErrorRendering: true,
      });
      try {
        const { svg } = await m.render(
          "diagram-" + crypto.randomUUID().replace(/-/g, ""),
          code.replace(/^\s*%%\{[\s\S]*?\}%%/gm, ""),
        );
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code]);
  return error ? (
    <pre>
      <code>{code}</code>
      <small>Diagram could not be rendered. Original text is preserved.</small>
    </pre>
  ) : (
    <div ref={ref} className="diagram" />
  );
}
export default function Markdown({
  body,
  definitions = [],
  onDefinition,
  onLink,
  remoteImages = false,
  onCitation,
  attachments = [],
  demo = false,
  fromPath = "",
  onAttachment,
  density = "paragraph",
  onAIReference,
  publicAssetBase,
  notes = [],
}: {
  body: string;
  definitions?: Definition[];
  onDefinition?: (id: string) => void;
  onLink?: (target: string) => void;
  remoteImages?: boolean;
  onCitation?: (id: string) => void;
  attachments?: Attachment[];
  demo?: boolean;
  fromPath?: string;
  onAttachment?: (id: string) => void;
  density?: "all" | "paragraph" | "note";
  onAIReference?: (id: string) => void;
  publicAssetBase?: string;
  notes?: Pick<Note, "id" | "title" | "body" | "originalPath" | "metadata">[];
}) {
  const match = conceptMatcher(definitions);
  const noteTerms = new Set<string>();
  function textNodes(children: ReactNode): ReactNode {
    return Children.map(children, (c) => {
      if (typeof c !== "string") return c;
      const seen = density === "note" ? noteTerms : new Set<string>();
      const hits = match(c).filter((h) => {
        if (density === "all") return true;
        if (seen.has(h.entry.id)) return false;
        seen.add(h.entry.id);
        return true;
      });
      if (!hits.length) return c;
      const result: ReactNode[] = [];
      let pos = 0;
      for (const h of hits) {
        result.push(
          c.slice(pos, h.from),
          <button
            key={h.from}
            className="concept"
            title={h.entry.definition}
            onClick={() => onDefinition?.(h.entry.id)}
          >
            {c.slice(h.from, h.to)}
          </button>,
        );
        pos = h.to;
      }
      result.push(c.slice(pos));
      return result;
    });
  }
  const original = readingMarkdown(body),
    ranges = proseRanges(original);
  let transformed = original;
  for (const hit of [...original.matchAll(/(!?)\[\[([^\]]+)\]\]/g)].reverse()) {
    if (
      !ranges.some(
        (r) => r.from <= hit.index! && r.to >= hit.index! + hit[0].length,
      )
    )
      continue;
    const replacement = ((embed: string, raw: string) => {
      const [target, alias] = raw.split("|");
      const asset = findAttachment(attachments, target, fromPath);
      if (asset)
        return `${embed && asset.mime.startsWith("image/") ? "!" : ""}[${alias ?? asset.filename}](attachment:${asset.id})`;
      if (embed) {
        const resolved = resolveLink(target, fromPath, notes),
          note = notes.find((n) => n.id === resolved.id);
        if (note) {
          let content = readingMarkdown(note.body);
          const anchor = target.split("#")[1];
          if (anchor) {
            if (anchor.startsWith("^"))
              content =
                content.split(/\n\s*\n/).find((p) => p.includes(anchor)) ??
                "Block unavailable.";
            else {
              const lines = content.split("\n"),
                start = lines.findIndex(
                  (l) =>
                    l.replace(/^#+\s+/, "").toLowerCase() ===
                    anchor.toLowerCase(),
                );
              content =
                start >= 0
                  ? lines.slice(start).join("\n")
                  : "Heading unavailable.";
            }
          }
          return (
            "\n\n> **Embedded · " +
            note.title +
            "**\n> " +
            content.split("\n").join("\n> ") +
            "\n\n"
          );
        }
      }
      return `[${embed ? "↗ " : ""}${alias ?? target}](#note:${encodeURIComponent(target)})`;
    })(hit[1], hit[2]);
    transformed =
      transformed.slice(0, hit.index!) +
      replacement +
      transformed.slice(hit.index! + hit[0].length);
  }
  return (
    <div className="markdown" dir="auto">
      <ReactMarkdown
        urlTransform={(url) =>
          url.startsWith("attachment:") ? url : defaultUrlTransform(url)
        }
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          input: ({ checked }) => (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              disabled
              aria-label={checked ? "Completed task" : "Incomplete task"}
            />
          ),
          p: ({ children }) => {
            const all = Children.toArray(children),
              last = all.at(-1),
              block =
                typeof last === "string"
                  ? last.match(/\s\^([\w-]+)\s*$/)
                  : null;
            const content = block
              ? all.map((c, i) =>
                  i === all.length - 1 && typeof c === "string"
                    ? c.replace(/\s\^[\w-]+\s*$/, "")
                    : c,
                )
              : children;
            return <p id={block?.[1]}>{textNodes(content)}</p>;
          },
          li: ({ children }) => <li>{textNodes(children)}</li>,
          h1: ({ children }) => (
            <h1 id={String(children).toLowerCase().replace(/\s+/g, "-")}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 id={String(children).toLowerCase().replace(/\s+/g, "-")}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 id={String(children).toLowerCase().replace(/\s+/g, "-")}>
              {children}
            </h3>
          ),
          a: ({ href, children }) => {
            const asset = href
              ? findAttachment(attachments, href, fromPath)
              : undefined;
            if (asset)
              return (
                <AttachmentMedia
                  asset={asset}
                  demo={demo}
                  onOpen={onAttachment}
                  publicBase={publicAssetBase}
                >
                  {children}
                </AttachmentMedia>
              );
            if (href?.startsWith("#ai-ref:"))
              return (
                <button
                  className="internal-link"
                  onClick={() =>
                    onAIReference?.(decodeURIComponent(href.slice(8)))
                  }
                >
                  {children}
                </button>
              );
            if (
              href &&
              onLink &&
              !/^[a-z][a-z0-9+.-]*:/i.test(href) &&
              /\.md(?:#|$)/i.test(href)
            )
              return (
                <button className="internal-link" onClick={() => onLink(href)}>
                  {children}
                </button>
              );
            if (
              href?.startsWith("#note:") &&
              /^[0-9a-f-]{36}$/i.test(href.slice(6)) &&
              !notes.some((n) => n.id === href.slice(6))
            )
              return (
                <span
                  className="link-unavailable"
                  title="Linked note unavailable"
                >
                  {children} (unavailable)
                </span>
              );
            return href?.startsWith("#note:") ? (
              <button
                className="internal-link"
                onClick={() => onLink?.(decodeURIComponent(href.slice(6)))}
              >
                {children}
              </button>
            ) : href?.startsWith("#citation:") ? (
              <button
                className="internal-link"
                onClick={() => onCitation?.(href.slice(10))}
              >
                {children}
              </button>
            ) : (
              <a
                href={href}
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const asset =
              typeof src === "string"
                ? findAttachment(attachments, src, fromPath)
                : undefined;
            if (asset)
              return (
                <AttachmentMedia
                  asset={asset}
                  demo={demo}
                  publicBase={publicAssetBase}
                  image
                >
                  {alt}
                </AttachmentMedia>
              );
            return typeof src === "string" &&
              (src.startsWith("blob:") ||
                src.startsWith("/api/attachments/") ||
                remoteImages) ? (
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="image-placeholder">
                Image: {alt || "attachment"} ·{" "}
                {typeof src === "string" && src.startsWith("http")
                  ? "Remote images are disabled in Privacy settings."
                  : "Open from Attachments."}
              </span>
            );
          },
          pre: ({ children }) => {
            const child = Children.toArray(children)[0];
            if (
              isValidElement<{ className?: string; children?: ReactNode }>(
                child,
              ) &&
              child.props.className === "language-mermaid"
            )
              return <Diagram code={String(child.props.children)} />;
            return <pre>{children}</pre>;
          },
          code: ({ className, children }) => (
            <code className={className}>
              {children}
              {className &&
                /dataview|dataviewjs|javascript-run/.test(className) && (
                  <small className="compatibility-notice">
                    Imported plugin code is preserved as text.
                  </small>
                )}
            </code>
          ),
        }}
      >
        {transformed}
      </ReactMarkdown>
    </div>
  );
}
