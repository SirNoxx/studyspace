import * as Y from "yjs";
import { emptyWorkspace, type Workspace } from "../model";
import type { SocialRow } from "../social";

export const sharedLists = [
  "containers",
  "notes",
  "definitions",
  "sources",
  "anchors",
  "attachments",
  "annotations",
  "review",
] as const;
export const localOrigin = Symbol("workspace edit");
export function patchText(text: Y.Text, value: string) {
  const previous = text.toString();
  if (previous === value) return;
  let from = 0,
    oldEnd = previous.length,
    newEnd = value.length;
  while (from < oldEnd && from < newEnd && previous[from] === value[from])
    from++;
  while (
    oldEnd > from &&
    newEnd > from &&
    previous[oldEnd - 1] === value[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  if (oldEnd > from) text.delete(from, oldEnd - from);
  if (newEnd > from) text.insert(from, value.slice(from, newEnd));
}
export function noteText(doc: Y.Doc, id: string) {
  return doc.getText("note:" + id);
}
export function writeWorkspace(
  doc: Y.Doc,
  next: Workspace,
  previous?: Workspace,
) {
  doc.transact(() => {
    for (const list of sharedLists) {
      const entities = doc.getMap<Y.Map<unknown>>(list);
      const before = new Map(
        (previous?.[list] ?? []).map((row) => [row.id, row]),
      );
      const ids = new Set(next[list].map((row) => row.id));
      for (const id of before.keys()) if (!ids.has(id)) entities.delete(id);
      for (const row of next[list]) {
        const old = before.get(row.id) as Record<string, unknown> | undefined;
        let entity = entities.get(row.id);
        if (!entity) {
          entity = new Y.Map();
          entities.set(row.id, entity);
        }
        for (const [key, value] of Object.entries(row)) {
          if (list === "notes" && key === "body") {
            if (!old || old.body !== value)
              patchText(noteText(doc, row.id), String(value));
          } else if (JSON.stringify(old?.[key]) !== JSON.stringify(value)) {
            if (value === undefined) entity.delete(key);
            else entity.set(key, structuredClone(value));
          }
        }
        for (const key of Object.keys(old ?? {}))
          if (!(key in row)) entity.delete(key);
      }
    }
  }, localOrigin);
}
export function readWorkspace(
  doc: Y.Doc,
  personal = emptyWorkspace(),
): Workspace {
  const result = { ...personal };
  for (const list of sharedLists) {
    (result[list] as unknown[]) = [
      ...doc.getMap<Y.Map<unknown>>(list).values(),
    ].map((entity) => entity.toJSON());
  }
  result.notes = result.notes.map((note) => ({
    ...note,
    body: noteText(doc, note.id).toString(),
  }));
  return result;
}
export function legacyWorkspace(data: SocialRow): Workspace {
  const workspace = emptyWorkspace(),
    root = workspace.containers[0];
  root.id = data.collection.id;
  root.title = data.collection.title;
  root.createdAt = data.collection.created_at ?? new Date(0).toISOString();
  root.updatedAt = root.createdAt;
  workspace.settings.onboardingComplete = true;
  for (const node of data.nodes ?? []) {
    const at = node.updated_at ?? new Date(0).toISOString();
    if (node.kind === "folder")
      workspace.containers.push({
        ...root,
        id: node.id,
        parentId: node.parent_id ?? root.id,
        kind: "folder",
        title: node.title,
        system: undefined,
        createdAt: at,
        updatedAt: at,
        trashed: node.deleted,
      });
    else
      workspace.notes.push({
        id: node.id,
        containerId: node.parent_id ?? root.id,
        title: node.title,
        body: node.body,
        kind: "note",
        revision: node.revision,
        createdAt: at,
        updatedAt: at,
        tags: [],
        history: [],
        trashed: node.deleted,
      });
  }
  workspace.attachments = (data.assets ?? []).map((asset: SocialRow) => ({
    id: asset.id,
    filename: asset.filename,
    mime: asset.mime,
    size: asset.size,
    key: "legacy-shared/" + asset.id,
    hash: asset.hash,
    createdAt: asset.created_at,
  }));
  for (const note of workspace.notes) {
    note.history = (data.versions ?? [])
      .filter((v: SocialRow) => v.node_id === note.id)
      .map((v: SocialRow) => ({
        revision: v.revision,
        title: v.snapshot.title,
        body: v.snapshot.body,
        at: v.created_at,
        reason: "Shared edit",
      }));
    // Older shared editors listed attachments outside Markdown. Make them visible in the note.
    for (const asset of data.assets ?? [])
      if (
        asset.node_id === note.id &&
        !note.body.includes("attachment:" + asset.id)
      )
        note.body += `\n[${asset.filename.replace(/[\[\]]/g, "_")}](attachment:${asset.id})\n`;
  }
  return workspace;
}
export function encode(doc: Y.Doc, vector?: Uint8Array) {
  return Y.encodeStateAsUpdate(doc, vector);
}
export function toBase64(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 16384)
    raw += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(raw);
}
export const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));

// Two individually valid folder moves can form a cycle when merged. Restore the
// conflicting location, retaining the folder, every note, and all text edits.
export function repairSharedHierarchy(doc: Y.Doc, previous: Workspace) {
  const current = readWorkspace(doc),
    root = current.containers.find((c) => c.system === "general");
  if (!root) return false;
  const containers = new Map(current.containers.map((c) => [c.id, c]));
  let repaired = false;
  const invalid = (id: string, parent: string | null) => {
    const seen = new Set([id]);
    let next = parent;
    while (next) {
      if (seen.has(next) || !containers.has(next)) return true;
      seen.add(next);
      next = containers.get(next)!.parentId;
    }
    return false;
  };
  for (const c of current.containers)
    if (invalid(c.id, c.parentId)) {
      const prior =
        previous.containers.find((p) => p.id === c.id)?.parentId ?? null;
      c.parentId = invalid(c.id, prior)
        ? c.id === root.id
          ? null
          : root.id
        : prior;
      doc
        .getMap<Y.Map<unknown>>("containers")
        .get(c.id)!
        .set("parentId", c.parentId);
      repaired = true;
    }
  for (const n of current.notes)
    if (!containers.has(n.containerId)) {
      doc
        .getMap<Y.Map<unknown>>("notes")
        .get(n.id)!
        .set("containerId", root.id);
      repaired = true;
    }
  return repaired;
}
