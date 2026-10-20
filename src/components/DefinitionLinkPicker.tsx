"use client";
import { useState } from "react";
import { BookA, Search } from "lucide-react";
import type { AppContext, DialogState } from "./WorkspaceApp";
import { definitionLink, definitionAttachmentRange } from "@/lib/markdown";
import { saveNote } from "@/lib/domain";
export default function DefinitionLinkPicker({
  ctx,
  dialog,
  onClose,
}: {
  ctx: AppContext;
  dialog: NonNullable<DialogState>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const entries = ctx.w.definitions
    .filter(
      (d) =>
        !d.trashed &&
        words.every((word) =>
          [d.term, ...d.aliases, d.definition]
            .join(" ")
            .toLocaleLowerCase()
            .includes(word),
        ),
    )
    .sort((a, b) => a.term.localeCompare(b.term));
  return (
    <section aria-label="Choose a definition">
      <p className="muted">
        Choose a study definition to attach to your selected text.
      </p>
      <p className="definition-selection-preview">
        Selected text: <strong>{dialog.value}</strong>
      </p>
      <label className="definition-link-search">
        <Search size={16} />
        <input
          autoFocus
          aria-label="Search existing definitions"
          placeholder="Search terms, aliases, or meanings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div
        className="definition-link-results"
        role="list"
        aria-label="Existing definitions"
      >
        {entries.map((entry) => (
          <div role="listitem" key={entry.id}>
            <button
              type="button"
              aria-label={"Attach " + entry.term}
              onClick={() => {
                if (ctx.collaboration?.readOnly) {
                  setError(
                    "You need editing permission to attach a definition.",
                  );
                  return;
                }
                if (typeof dialog.moduleReplace === "function") {
                  if (!dialog.moduleReplace(definitionLink(String(dialog.value ?? ""), entry.id))) {
                    setError("The module text changed. Select it again.");
                    return;
                  }
                  ctx.toast("Attached “" + entry.term + "”.");
                  onClose();
                  return;
                }
                const note = ctx.w.notes.find((n) => n.id === dialog.sourceId),
                  from = Number(dialog.from),
                  to = Number(dialog.to);
                if (
                  !note ||
                  note.body !== dialog.body ||
                  !Number.isInteger(from) ||
                  !Number.isInteger(to)
                ) {
                  setError(
                    "The note changed. Close this dialog and highlight the text again.",
                  );
                  return;
                }
                try {
                  const range = definitionAttachmentRange(note.body, from, to);
                  const link = definitionLink(
                    String(dialog.value ?? ""),
                    entry.id,
                  );
                  const target = ctx.editor.current;
                  if (
                    !dialog.reading &&
                    ctx.active?.id === note.id &&
                    target?.replaceRange
                  ) {
                    if (
                      !target.replaceRange(
                        range.from,
                        range.to,
                        note.body.slice(range.from, range.to),
                        link,
                      )
                    ) {
                      setError(
                        "The selection changed. Highlight the text again.",
                      );
                      return;
                    }
                  } else
                    ctx.mutate((w) => {
                      const current = w.notes.find((n) => n.id === note.id)!;
                      if (current.body !== dialog.body)
                        throw Error("The note changed. Select the text again.");
                      saveNote(
                        w,
                        current.id,
                        current.revision,
                        {
                          body:
                            current.body.slice(0, range.from) +
                            link +
                            current.body.slice(range.to),
                        },
                        "Attach definition",
                      );
                    });
                  ctx.toast("Attached “" + entry.term + "”.");
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <BookA size={18} />
              <span>
                <strong>{entry.term}</strong>
                <small>{entry.definition}</small>
              </span>
            </button>
          </div>
        ))}
      </div>
      {!entries.length && (
        <p className="muted">
          {ctx.w.definitions.some((d) => !d.trashed)
            ? "No definitions match. Try another search."
            : "Create a dictionary definition first, then attach it to your selected text."}
        </p>
      )}
    </section>
  );
}
