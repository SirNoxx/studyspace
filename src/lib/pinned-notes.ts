import { type Workspace, type NoteKind, general, ancestry, now } from "./model";
import { standaloneContainer } from "./quick-notes";
export function isPinnedNote(w: Workspace, id: string) {
  const n = w.notes.find((n) => n.id === id);
  return (
    !!n &&
    w.containers.some((c) => c.id === n.containerId && c.system === "pinned")
  );
}
export function pinNote(w: Workspace, id: string) {
  const n = w.notes.find((n) => n.id === id && !n.trashed);
  if (!n || isPinnedNote(w, id)) return;
  const destination = standaloneContainer(w, "pinned");
  n.metadata = {
    ...n.metadata,
    pinnedFrom: { containerId: n.containerId, kind: n.kind, order: n.order },
  };
  n.containerId = destination.id;
  if (n.kind === "quick") n.kind = "note";
  n.order =
    Math.max(
      -1,
      ...w.notes
        .filter(
          (other) => other.id !== id && other.containerId === destination.id,
        )
        .map((other) => other.order ?? 0),
    ) + 1;
  n.updatedAt = now();
}
export function unpinNote(w: Workspace, id: string) {
  const n = w.notes.find((n) => n.id === id);
  if (!n || !isPinnedNote(w, id)) return;
  const previous = n.metadata?.pinnedFrom as
    { containerId?: string; kind?: NoteKind; order?: number } | undefined;
  const destination =
    w.containers.find(
      (c) =>
        c.id === previous?.containerId &&
        c.system !== "pinned" &&
        ancestry(w, c.id).every((p) => !p.trashed && !p.archived),
    ) ?? general(w);
  n.containerId = destination.id;
  n.kind =
    destination.system === "quick"
      ? "quick"
      : previous?.kind && ["journal", "dream"].includes(previous.kind)
        ? previous.kind
        : "note";
  n.order = previous?.order;
  n.updatedAt = now();
  if (n.metadata) delete n.metadata.pinnedFrom;
}
