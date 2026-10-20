"use client";
import { useMemo } from "react";
import { definitionUsages } from "@/lib/definition-usage";
import type { AppContext } from "./WorkspaceApp";

export default function DefinitionUsages({
  ctx,
  definitionId,
}: {
  ctx: AppContext;
  definitionId: string;
}) {
  const usages = useMemo(
    () => definitionUsages(ctx.w, definitionId),
    [ctx.w, definitionId],
  );
  return (
    <section className="definition-usages" aria-label="View in notes">
      <h3>View in notes</h3>
      {usages.length ? (
        <div className="definition-usage-list">
          {usages.map((usage) => (
            <button
              type="button"
              key={usage.noteId + ":" + usage.from}
              onClick={() =>
                ctx.openNoteAt(usage.noteId, usage.from, usage.to, usage.quote)
              }
            >
              <span>
                <strong>{usage.title || "Untitled"}</strong>
                <small>Line {usage.line}</small>
              </span>
              <span className="definition-usage-snippet">
                {usage.before}
                <mark>{usage.quote}</mark>
                {usage.after}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">This definition isn’t used in any notes yet.</p>
      )}
    </section>
  );
}
