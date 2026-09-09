import { type Workspace, uid, now } from "./model";
// Recovery is additive. A differing saved object is never silently replaced.
export function recoverWorkspace(saved: Workspace, draft: Workspace) {
  const w = structuredClone(saved),
    map: Record<string, string> = {};
  for (const c of draft.containers)
    if (!w.containers.some((x) => x.id === c.id)) {
      if (c.system) {
        map[c.id] = w.containers.find((x) => x.system === c.system)!.id;
        continue;
      }
      w.containers.push(structuredClone(c));
    }
  for (const c of w.containers)
    if (c.parentId && map[c.parentId]) c.parentId = map[c.parentId];
  for (const n of draft.notes) {
    const current = w.notes.find((x) => x.id === n.id);
    if (!current) {
      const copy = structuredClone(n);
      copy.containerId = map[copy.containerId] ?? copy.containerId;
      w.notes.push(copy);
      map[n.id] = n.id;
    } else if (current.body !== n.body || current.title !== n.title) {
      const id = uid();
      map[n.id] = id;
      w.notes.push({
        ...structuredClone(n),
        id,
        containerId: map[n.containerId] ?? n.containerId,
        title: n.title + " · recovered draft",
        revision: 1,
        history: [],
        updatedAt: now(),
        trashed: false,
      });
    } else map[n.id] = n.id;
  }
  for (const kind of [
    "attachments",
    "definitions",
    "sources",
    "anchors",
    "annotations",
    "review",
    "ai",
  ] as const) {
    for (const old of draft[kind]) {
      const list = w[kind] as { id: string }[];
      const prior = list.find((x) => x.id === old.id);
      if (prior && JSON.stringify(prior) === JSON.stringify(old)) continue;
      const item = structuredClone(old) as unknown as Record<string, any>;
      if (prior) {
        if (kind === "review") continue;
        item.id = uid();
        map[old.id] = item.id;
      }
      if (item.noteId) item.noteId = map[item.noteId] ?? item.noteId;
      if (item.sourceId) item.sourceId = map[item.sourceId] ?? item.sourceId;
      if (item.attachmentId)
        item.attachmentId = map[item.attachmentId] ?? item.attachmentId;
      if (item.noteIds)
        item.noteIds = item.noteIds.map((id: string) => map[id] ?? id);
      if (item.subjectIds)
        item.subjectIds = item.subjectIds.map((id: string) => map[id] ?? id);
      list.push(item as { id: string });
    }
  }
  for (const n of w.notes.filter(
    (n) =>
      Object.values(map).includes(n.id) &&
      !saved.notes.some((s) => s.id === n.id),
  )) {
    n.body = n.body.replace(
      /(attachment:|#citation:)([0-9a-f-]{36})/gi,
      (all, prefix, id) => (map[id] ? prefix + map[id] : all),
    );
    if (n.linkMap)
      n.linkMap = Object.fromEntries(
        Object.entries(n.linkMap).map(([key, id]) => [key, map[id] ?? id]),
      );
  }
  return w;
}
