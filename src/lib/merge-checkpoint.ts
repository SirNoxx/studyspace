import { type Workspace, type StudyCopy, ancestry, uid, now } from "./model";
import { createContainer, saveNote } from "./domain";
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const kinds = [
  "notes",
  "definitions",
  "sources",
  "anchors",
  "attachments",
] as const;
export function checkpointMerge(w: Workspace, c: StudyCopy) {
  const ids = new Set(Object.values(c.mapping));
  c.mergeCheckpoint = {
    at: now(),
    mapping: { ...c.mapping },
    accepted: clone(c.accepted),
    acceptedRecords: c.acceptedRecords ? clone(c.acceptedRecords) : undefined,
    baseline: clone(c.baseline),
    records: Object.fromEntries(
      kinds.map((kind) => [kind, clone(w[kind].filter((x) => ids.has(x.id)))]),
    ) as NonNullable<StudyCopy["mergeCheckpoint"]>["records"],
  };
}
export function undoMerge(w: Workspace, c: StudyCopy) {
  const point = c.mergeCheckpoint;
  if (!point) throw new Error("No merge checkpoint remains.");
  const ids = new Set(Object.values(c.mapping));
  for (const kind of kinds) {
    const records = point.records[kind],
      keep = new Set(records.map((x) => x.id));
    if (kind === "notes") {
      for (const n of w.notes.filter((n) => ids.has(n.id) && !keep.has(n.id)))
        n.trashed = true;
      for (const old of point.records.notes) {
        const current = w.notes.find((n) => n.id === old.id);
        if (current) {
          saveNote(
            w,
            current.id,
            current.revision,
            { title: old.title, body: old.body },
            "Undo upstream merge",
          );
          current.containerId = old.containerId;
          current.trashed = old.trashed;
        } else w.notes.push(clone(old));
      }
    } else
      (w as any)[kind] = [
        ...(w[kind] as { id: string }[]).filter(
          (x) => !ids.has(x.id) && !keep.has(x.id),
        ),
        ...clone(records),
      ];
  }
  c.mapping = { ...point.mapping };
  c.accepted = clone(point.accepted);
  c.acceptedRecords = point.acceptedRecords
    ? clone(point.acceptedRecords)
    : undefined;
  c.baseline = clone(point.baseline);
  c.mergeCheckpoint = undefined;
}
export function mappedReferences(body: string, map: Record<string, string>) {
  return body.replace(
    /(attachment:|#citation:)([0-9a-f-]{36})/gi,
    (all, prefix, id) => (map[id] ? prefix + map[id] : all),
  );
}
export function copyRelativePath(
  w: Workspace,
  c: StudyCopy,
  containerId: string,
  basePath: string,
) {
  const chain = ancestry(w, containerId),
    start = chain.findIndex((p) => p.id === c.containerId);
  return [basePath.split("/")[0], ...chain.slice(start + 1).map((p) => p.title)]
    .filter(Boolean)
    .join("/");
}
export function copyPath(w: Workspace, c: StudyCopy, path: string) {
  let parent = c.containerId;
  for (const title of path.split("/").slice(1)) {
    const exists = w.containers.find(
      (x) => x.parentId === parent && x.title === title && !x.trashed,
    );
    parent =
      exists?.id ??
      createContainer(w, {
        title,
        parentId: parent,
        kind: "folder",
        dictionary: false,
      }).id;
  }
  return parent;
}
