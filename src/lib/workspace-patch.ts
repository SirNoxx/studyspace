import type { Workspace } from "./model";
export const patchArrays = [
  "containers",
  "notes",
  "definitions",
  "sources",
  "anchors",
  "attachments",
  "annotations",
  "review",
  "notifications",
  "ai",
] as const;
export interface WorkspacePatch {
  arrays: Partial<
    Record<
      (typeof patchArrays)[number],
      { upserts: { id: string }[]; remove: string[] }
    >
  >;
  settings?: Workspace["settings"];
  bookmarks?: string[];
  progress?: Workspace["progress"];
}
export function makePatch(next: Workspace, base: Workspace): WorkspacePatch {
  const patch: WorkspacePatch = { arrays: {} };
  for (const key of patchArrays) {
    if (next[key] === base[key]) continue;
    const old = new Map((base[key] as { id: string }[]).map((x) => [x.id, x]));
    const present = new Set(next[key].map((x) => x.id));
    const upserts = (next[key] as { id: string }[]).filter(
      (x) => old.get(x.id) !== x,
    );
    const remove = base[key].filter((x) => !present.has(x.id)).map((x) => x.id);
    if (upserts.length || remove.length)
      patch.arrays[key] = { upserts, remove };
  }
  for (const key of ["settings", "bookmarks", "progress"] as const)
    if (next[key] !== base[key]) (patch as any)[key] = next[key];
  return patch;
}
export function applyPatch(base: Workspace, patch: WorkspacePatch) {
  const next = { ...base };
  for (const key of patchArrays) {
    const change = patch.arrays[key];
    if (!change) continue;
    const updates = new Map(change.upserts.map((x) => [x.id, x])),
      removed = new Set(change.remove);
    const values = (base[key] as { id: string }[])
      .filter((x) => !removed.has(x.id))
      .map((x) => {
        const updated = updates.get(x.id);
        updates.delete(x.id);
        return updated ?? x;
      });
    (next as any)[key] = [...values, ...updates.values()];
  }
  for (const key of ["settings", "bookmarks", "progress"] as const)
    if (patch[key] !== undefined) (next as any)[key] = patch[key];
  return next;
}
