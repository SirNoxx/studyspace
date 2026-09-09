import {
  type Workspace,
  type Snapshot,
  type Attachment,
  uid,
  now,
} from "./model";
import { createContainer, createNote } from "./domain";
export function instantiateSnapshot(
  w: Workspace,
  p: Snapshot,
  key: string,
  assetCopies: Attachment[] = [],
) {
  const previous = w.copies.find((c) => c.id === key);
  if (previous) return previous;
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const root = createContainer(w, {
    title: p.title + " · study copy",
    description: p.description,
    color: "#9189b0",
  });
  const mapping: Record<string, string> = {};
  for (const list of [
    p.notes,
    p.definitions,
    p.sources,
    p.anchors,
    p.annotations,
    p.attachments ?? [],
  ])
    for (const item of list) mapping[item.id] = uid();
  for (const a of p.attachments ?? []) {
    const copied = assetCopies.find((x) => x.hash === a.hash);
    if (!copied)
      throw new Error(
        "A permitted attachment is unavailable. The study copy was not committed.",
      );
    mapping[a.id] = copied.id;
    w.attachments.push(copied);
  }
  const folders = new Map<string, string>([["", root.id]]);
  for (const n of p.notes) {
    let parent = root.id,
      path = "";
    for (const part of n.path.split("/").slice(1)) {
      path += "/" + part;
      if (!folders.has(path))
        folders.set(
          path,
          createContainer(w, {
            title: part,
            parentId: parent,
            kind: "folder",
            dictionary: false,
          }).id,
        );
      parent = folders.get(path)!;
    }
    createNote(w, parent, {
      id: mapping[n.id],
      title: n.title,
      body: n.body.replace(
        /(attachment:|#citation:|#note:)([0-9a-f-]{36})/gi,
        (all, prefix, id) => (mapping[id] ? prefix + mapping[id] : all),
      ),
      linkMap: Object.fromEntries(
        p.notes.flatMap((x) => [
          [x.title, mapping[x.id]],
          [x.path + "/" + x.title, mapping[x.id]],
        ]),
      ),
    });
  }
  for (const d of p.definitions)
    w.definitions.push({
      ...clone(d),
      id: mapping[d.id],
      noteId: d.noteId ? mapping[d.noteId] : undefined,
      subjectIds: [root.id],
      createdAt: now(),
    });
  for (const s of p.sources)
    w.sources.push({
      ...clone(s),
      id: mapping[s.id],
      noteIds: s.noteIds.map((id) => mapping[id]).filter(Boolean),
      subjectIds: [root.id],
      attachmentId: s.attachmentId ? mapping[s.attachmentId] : undefined,
      canonical: s.attachmentId
        ? "attachment:" + mapping[s.attachmentId]
        : s.canonical,
    });
  for (const a of p.anchors)
    if (mapping[a.sourceId])
      w.anchors.push({
        ...clone(a),
        id: mapping[a.id],
        sourceId: mapping[a.sourceId],
        noteId: a.noteId ? mapping[a.noteId] : undefined,
      });
  for (const a of p.annotations)
    if (mapping[a.noteId])
      w.annotations.push({
        ...clone(a),
        id: mapping[a.id],
        noteId: mapping[a.noteId],
      });
  const lineage = [
    ...clone(p.lineage),
    {
      publicationId: p.publicationId,
      version: p.version,
      title: p.title,
      author: p.author,
    },
  ];
  const copy = {
    id: key,
    containerId: root.id,
    publicationId: p.publicationId,
    baseline: clone(p),
    mapping,
    accepted: Object.fromEntries(p.notes.map((n) => [n.id, clone(n)])),
    lineage,
  };
  w.copies.push(copy);
  return copy;
}
