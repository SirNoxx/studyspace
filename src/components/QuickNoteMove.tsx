"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, Library } from "lucide-react";
import { Modal } from "./ui";
import type { AppContext } from "./WorkspaceApp";
import { moveItems } from "@/lib/domain";
import { ancestry } from "@/lib/model";
export default function QuickNoteMove({
  ctx,
  noteId,
  onClose,
}: {
  ctx: AppContext;
  noteId: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const folders = ctx.w.containers.filter(
    (c) =>
      c.system !== "quick" && c.system !== "pinned" &&
      !c.trashed &&
      !c.archived &&
      ancestry(ctx.w, c.id).every((p) => !p.trashed && !p.archived),
  );
  const tree = (parent: string | null, depth = 0): React.ReactNode =>
    folders
      .filter((c) => c.parentId === parent)
      .sort((a, b) => a.order - b.order)
      .map((c) => (
        <div key={c.id}>
          <div className="quick-move-row" style={{ paddingLeft: depth * 20 }}>
            {folders.some((p) => p.parentId === c.id) ? (
              <button
                aria-label={
                  (expanded.includes(c.id) ? "Collapse " : "Expand ") + c.title
                }
                onClick={() =>
                  setExpanded((old) =>
                    old.includes(c.id)
                      ? old.filter((x) => x !== c.id)
                      : [...old, c.id],
                  )
                }
              >
                {expanded.includes(c.id) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            ) : (
              <span className="quick-move-spacer" />
            )}
            <button
              aria-label={"Move into " + c.title}
              onClick={() => {
                ctx.mutate(
                  (w) => moveItems(w, [noteId], c.id),
                  "Note moved to " + c.title + ".",
                );
                onClose();
              }}
            >
              {c.kind === "folder" ? (
                <Folder size={17} />
              ) : (
                <Library size={17} />
              )}
              <span>{c.title}</span>
              <small>Move here</small>
            </button>
          </div>
          {expanded.includes(c.id) && tree(c.id, depth + 1)}
        </div>
      ));
  return (
    <Modal
      title="Move quick note"
      description="Choose a collection, or expand it to choose a folder. Your note will leave Quick notes."
      onClose={onClose}
    >
      <div className="quick-move-tree">{tree(null)}</div>
    </Modal>
  );
}
