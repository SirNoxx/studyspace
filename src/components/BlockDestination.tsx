"use client";
import { useState } from "react";
import type { AppContext } from "./WorkspaceApp";
import { Modal } from "./ui";
import { ancestry, uid } from "@/lib/model";
import { codeFence, type StudyCodeBlock } from "@/lib/code-blocks";
import { createNote, saveNote } from "@/lib/domain";

export default function BlockDestination({
  ctx,
  block,
  sourceNoteId,
  onClose,
}: {
  ctx: AppContext;
  block: StudyCodeBlock;
  sourceNoteId: string;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<"note" | "folder">("note"),
    [query, setQuery] = useState("");
  const path = (id: string) =>
    ancestry(ctx.w, id)
      .map((c) => c.title)
      .join(" / ");
  const add = (id: string) => {
    let destination = "";
    ctx.mutate((w) => {
      const body = codeFence({ ...block, id: uid() });
      if (target === "folder")
        destination = createNote(w, id, {
          title:
            block.title ||
            (block.language === "whiteboard" ? "Whiteboard" : "Code example"),
          body: body + "\n",
        }).id;
      else {
        const n = w.notes.find((n) => n.id === id && !n.trashed);
        if (!n) return;
        saveNote(w, n.id, n.revision, { body: n.body + "\n\n" + body + "\n" });
        destination = n.id;
      }
    }, "Copy added. The original block is still in its note.");
    if (destination) {
      onClose();
      ctx.openNote(destination);
    }
  };
  return (
    <Modal
      title="Add to folder / file"
      description="Copy this block into a file, or create a new file inside a folder or collection."
      onClose={onClose}
    >
      <div className="block-destination-tabs">
        <button
          className="secondary"
          aria-pressed={target === "note"}
          onClick={() => setTarget("note")}
        >
          Existing file
        </button>
        <button
          className="secondary"
          aria-pressed={target === "folder"}
          onClick={() => setTarget("folder")}
        >
          New file in folder
        </button>
      </div>
      <input
        aria-label="Find destination"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="block-destinations">
        {target === "note"
          ? ctx.w.notes
              .filter(
                (n) =>
                  !n.trashed &&
                  !n.archived &&
                  n.id !== sourceNoteId &&
                  ancestry(ctx.w, n.containerId).every(
                    (c) => !c.trashed && !c.archived,
                  ) &&
                  (n.title + path(n.containerId))
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((n) => (
                <button key={n.id} onClick={() => add(n.id)}>
                  <strong>{n.title || "Untitled"}</strong>
                  <small>{path(n.containerId)}</small>
                </button>
              ))
          : ctx.w.containers
              .filter(
                (c) =>
                  c.system !== "quick" && c.system !== "pinned" &&
                  !c.trashed &&
                  !c.archived &&
                  ancestry(ctx.w, c.id).every(
                    (p) => !p.trashed && !p.archived,
                  ) &&
                  path(c.id).toLowerCase().includes(query.toLowerCase()),
              )
              .map((c) => (
                <button key={c.id} onClick={() => add(c.id)}>
                  <strong>{c.title}</strong>
                  <small>{path(c.id)}</small>
                </button>
              ))}
      </div>
    </Modal>
  );
}
