import { type Workspace, general, ancestry, now } from "./model";
export function isPinnedNote(w: Workspace, id: string) {
  return w.notes.find((n) => n.id === id)?.metadata?.pinned === true;
}
export function pinNote(w: Workspace, id: string) {
  const note = w.notes.find((n) => n.id === id && !n.trashed);
  if (!note) return;
  note.metadata = { ...note.metadata, pinned: true };
  note.updatedAt = now();
}
export function unpinNote(w: Workspace, id: string) {
  const note = w.notes.find((n) => n.id === id);
  if (!note) return;
  note.metadata = { ...note.metadata, pinned: false };
  note.updatedAt = now();
}
// Restore legacy detached pins without losing notes whose parents were deleted.
export function restoreLegacyPins(w: Workspace) {
  for (const note of w.notes) {
    if (!w.containers.some((c) => c.id === note.containerId && c.system === "pinned")) continue;
    const previous = note.metadata?.pinnedFrom as {containerId?: string; kind?: string; order?: number} | undefined;
    const parent = w.containers.find((c) => c.id === previous?.containerId && c.system !== "pinned" && ancestry(w,c.id).every((p) => !p.trashed && !p.archived)) ?? general(w);
    note.containerId = parent.id;
    note.kind = parent.system === "quick" ? "quick" : previous?.kind === "journal" || previous?.kind === "dream" ? previous.kind : "note";
    note.order = previous?.order ?? note.order;
    note.metadata = {...note.metadata, pinned: true};
    delete note.metadata.pinnedFrom;
  }
  return w;
}
