import { type Workspace, type Container, general, now } from "./model";
export function moveToQuickNotes(w: Workspace, id: string) {
  const n = w.notes.find((n) => n.id === id && !n.trashed);
  if (!n) return;
  n.containerId = quickNotesContainer(w).id;
  n.kind = "quick";
  n.updatedAt = now();
  if (n.metadata) delete n.metadata.pinnedFrom;
}

// Derive a stable identity so local and hosted normalization agree before first save.
export function quickNotesContainer(w: Workspace): Container {
  return standaloneContainer(w, "quick");
}
export function standaloneContainer(
  w: Workspace,
  kind: "quick" | "pinned",
): Container {
  const existing = w.containers.find((c) => c.system === kind);
  if (existing) return existing;
  const base = general(w);
  let prefix =
    (parseInt(base.id.slice(0, 8), 16) ^
      (kind === "quick" ? 0x71551ace : 0x51aa902f)) >>>
    0;
  let id = prefix.toString(16).padStart(8, "0") + base.id.slice(8);
  while ([...w.containers, ...w.notes].some((x) => x.id === id)) {
    prefix = (prefix + 1) >>> 0;
    id = prefix.toString(16).padStart(8, "0") + base.id.slice(8);
  }
  const container: Container = {
    ...base,
    id,
    title: kind === "quick" ? "Quick notes" : "Pinned notes",
    system: kind,
    kind: "collection",
    parentId: null,
    description: "Unfiled thoughts",
    icon: "pen",
    dictionary: false,
    related: [],
    trashed: false,
    archived: false,
  };
  w.containers.push(container);
  return container;
}
export function separateQuickNotes(w: Workspace): Workspace {
  if (
    !w.notes.some(
      (n) =>
        n.kind === "quick" &&
        w.containers.find((c) => c.id === n.containerId)?.system !== "quick",
    )
  )
    return w;
  const next = { ...w, containers: [...w.containers], notes: [...w.notes] };
  const destination = quickNotesContainer(next);
  next.notes = next.notes.map((n) =>
    n.kind === "quick" ? { ...n, containerId: destination.id } : n,
  );
  return next;
}
