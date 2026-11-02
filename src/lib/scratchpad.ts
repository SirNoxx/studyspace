import type { Note, Workspace } from "./model";
import { createNote } from "./domain";
import { quickNotesContainer } from "./quick-notes";
import { codeFence } from "./code-blocks";
import { emptyBoard } from "./whiteboard";

export const isScratchpad = (note?: Note) =>
  note?.metadata?.quickCapture === "scratchpad";

export function createScratchpad(w: Workspace) {
  const titles = new Set(w.notes.filter((n) => !n.trashed).map((n) => n.title));
  let title = "Scratchpad";
  for (let index = 2; titles.has(title); index++) title = `Scratchpad ${index}`;
  return createNote(w, quickNotesContainer(w).id, {
    title,
    kind: "quick",
    metadata: { quickCapture: "scratchpad" },
    body:
      codeFence({
        id: crypto.randomUUID(),
        language: "whiteboard",
        title: "Quick sketch",
        collapsed: false,
        code: JSON.stringify({ ...emptyBoard(), background: "blank" }),
      }) + "\n\n",
  });
}
