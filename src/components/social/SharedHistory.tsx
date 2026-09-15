"use client";
import { useEffect, useState } from "react";
import type { AppContext } from "../WorkspaceApp";
import type { Revision } from "@/lib/model";
import { saveNote } from "@/lib/domain";
import { Modal } from "../ui";
import Markdown from "../Markdown";
export default function SharedHistory({
  ctx,
  id,
  onClose,
}: {
  ctx: AppContext;
  id: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Revision[]>([]),
    [index, setIndex] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError("");
    fetch(
      `/api/shared/history?collection=${ctx.collaboration!.id}&note=${id}`,
      { cache: "no-store", signal: abort.signal },
    )
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw Error(value.error);
        return value.items as Revision[];
      })
      .then((value) => {
        const seen = new Set<string>();
        setItems(
          [
            ...value,
            ...(ctx.w.notes.find((n) => n.id === id)?.history ?? [])
              .slice()
              .reverse(),
          ].filter((r) => {
            const key = r.title + "\0" + r.body;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }),
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, ctx.collaboration, attempt]);
  const selected = items[index];
  return (
    <Modal
      title="Note history"
      description="Shared checkpoints preserve recent saved work. Restoring creates a new shared edit."
      onClose={onClose}
      wide
    >
      {loading && <p role="status">Loading history…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </p>
      )}
      {!loading && !error && !items.length && (
        <p>Your first saved changes will appear here.</p>
      )}
      <div className="history-layout">
        <div>
          {items.map((r, i) => (
            <button
              key={i}
              className={index === i ? "selected" : ""}
              onClick={() => setIndex(i)}
            >
              Revision {r.revision}
              <small>
                {new Date(r.at).toLocaleString()} · {r.reason}
              </small>
            </button>
          ))}
        </div>
        <div>
          {selected && (
            <>
              <Markdown body={selected.body} attachments={ctx.w.attachments} />
              <button
                className="primary"
                disabled={ctx.collaboration?.readOnly}
                onClick={() => {
                  ctx.mutate((w) => {
                    const note = w.notes.find((n) => n.id === id);
                    if (note)
                      saveNote(
                        w,
                        id,
                        note.revision,
                        { title: selected.title, body: selected.body },
                        "Restore shared checkpoint",
                      );
                  }, "Restored as a shared edit.");
                  onClose();
                }}
              >
                Restore this revision
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
