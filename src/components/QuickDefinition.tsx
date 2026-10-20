"use client";

import { useMemo, useState } from "react";
import type { AppContext } from "./WorkspaceApp";
import { Modal } from "./ui";
import DefinitionEditor from "./DefinitionEditor";
import { saveDictionaryDefinition } from "@/lib/definitions";
import DefinitionUsages from "./DefinitionUsages";

export type NestedDefinition = { term: string; id?: string };

export default function QuickDefinition({
  ctx,
  term,
  id,
  subjectIds,
  noteId,
  onClose,
  depth = 0,
}: {
  ctx: AppContext;
  term: string;
  id?: string;
  subjectIds: string[];
  noteId?: string;
  onClose: () => void;
  depth?: number;
}) {
  const existing = ctx.w.definitions.find(
    (entry) => entry.id === id && !entry.trashed,
  );
  const [body, setBody] = useState(existing?.definition ?? "");
  const [error, setError] = useState("");
  const [child, setChild] = useState<NestedDefinition | null>(null);
  const definitions = useMemo(
    () =>
      ctx.w.definitions.filter((entry) => !entry.trashed && entry.id !== id),
    [ctx.w.definitions, id],
  );
  function define(selected: string) {
    const match = definitions.find((entry) =>
      [entry.term, ...entry.aliases].some(
        (value) =>
          value.toLocaleLowerCase() === selected.trim().toLocaleLowerCase(),
      ),
    );
    setChild({ term: match?.term ?? selected.trim(), id: match?.id });
  }
  function save() {
    if (!body.trim()) {
      setError("Enter a definition before saving.");
      return;
    }
    if (ctx.collaboration?.readOnly) {
      setError("This collection is read-only.");
      return;
    }
    let saved = false;
    ctx.mutate((workspace) => {
      saveDictionaryDefinition(workspace, {
        id,
        term,
        definition: body,
        subjectIds: existing?.subjectIds ?? subjectIds,
        noteId,
      });
      saved = true;
    }, "Definition saved.");
    if (saved) onClose();
  }
  return (
    <>
      <Modal
        title="Define"
        description={`Define ${term}. Enter saves. Shift+Enter adds a line. Escape cancels.`}
        className={
          "quick-definition" + (depth ? " quick-definition-nested" : "")
        }
        descriptionHidden
        initialFocusSelector=".cm-content"
        onClose={onClose}
      >
        <DefinitionEditor
          value={body}
          onChange={setBody}
          definitions={definitions}
          autoFocus
          readOnly={!!ctx.collaboration?.readOnly}
          hint={`Define “${term}”…`}
          onSave={save}
          onDefine={define}
          onDefinition={(entryId) => {
            const entry = definitions.find((d) => d.id === entryId);
            if (entry) setChild({ term: entry.term, id: entry.id });
          }}
        />
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {existing && <DefinitionUsages ctx={ctx} definitionId={existing.id} />}
        {child && (
          <QuickDefinition
            key={child.id ?? child.term}
            ctx={ctx}
            {...child}
            subjectIds={existing?.subjectIds ?? subjectIds}
            noteId={noteId}
            depth={depth + 1}
            onClose={() => setChild(null)}
          />
        )}
      </Modal>
    </>
  );
}
