"use client";

import { useEffect, useState } from "react";

export default function Diagram({ code }: { code: string }) {
  const [result, setResult] = useState<{
    code: string;
    svg?: string;
    error?: boolean;
  }>();
  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          maxTextSize: 20000,
          flowchart: { htmlLabels: false },
          suppressErrorRendering: true,
        });
        const { svg } = await mermaid.render(
          "diagram-" + crypto.randomUUID().replace(/-/g, ""),
          code.replace(/^\s*%%\{[\s\S]*?\}%%/gm, ""),
        );
        if (!cancelled) setResult({ code, svg });
      } catch {
        if (!cancelled) setResult({ code, error: true });
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (result?.code !== code) return <p role="status">Rendering diagram…</p>;
  if (result.error)
    return (
      <div className="diagram-error">
        <p role="status">
          Diagram could not be rendered. Original text is preserved.
        </p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  return (
    <div
      className="diagram"
      role="img"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: result.svg ?? "" }}
    />
  );
}
