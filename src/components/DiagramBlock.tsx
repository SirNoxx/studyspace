"use client";

import { useState } from "react";
import type { StudyCodeBlock } from "@/lib/code-blocks";
import Diagram from "./Diagram";

export default function DiagramBlock({
  block,
  onChange,
  onDelete,
  readOnly,
}: {
  block: StudyCodeBlock;
  onChange: (patch: Partial<StudyCodeBlock>) => void;
  onDelete: () => void;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <section className="diagram-block" aria-label="Mermaid diagram block">
      <header className="diagram-toolbar">
        <strong>{block.title || "Mermaid diagram"}</strong>
        {!readOnly && draft === null && (
          <>
            <button type="button" onClick={() => setDraft(block.code)}>
              Edit diagram
            </button>
            <button type="button" onClick={onDelete}>
              Delete diagram
            </button>
          </>
        )}
      </header>
      {draft !== null && !readOnly ? (
        <div className="diagram-source">
          <textarea
            aria-label="Mermaid source"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            rows={10}
          />
          <div className="diagram-toolbar">
            <button
              type="button"
              onClick={() => {
                onChange({ code: draft });
                setDraft(null);
              }}
            >
              Apply diagram
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <Diagram code={block.code} />
      )}
    </section>
  );
}
