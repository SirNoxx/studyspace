"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Module prose keeps Markdown formatting and links when reading or printing. */
export default function ModuleText({ text }: { text: string }) {
  return (
    <div className="module-text module-rich-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ alt }) => <span>{alt || "Image"}</span>,
        }}
      >
        {text || "—"}
      </ReactMarkdown>
    </div>
  );
}
