import { it, expect } from "vitest";
import { emptyWorkspace, general } from "../src/lib/model";
import { createContainer, createNote } from "../src/lib/domain";
import { pinNote, unpinNote, restoreLegacyPins } from "../src/lib/pinned-notes";
import { treeItems } from "../src/lib/tree";

it("pinning sorts first within the original folder and unpinning restores order", () => {
  const w = emptyWorkspace(), folder = createContainer(w, { title: "Biology", kind: "folder", parentId: general(w).id });
  const first = createNote(w, folder.id), second = createNote(w, folder.id);
  first.order = 0; second.order = 1;
  pinNote(w, second.id);
  expect(second.containerId).toBe(folder.id);
  expect(treeItems(w, folder.id).map(n => n.id)).toEqual([second.id, first.id]);
  expect(treeItems(w, general(w).id).map(n => n.id)).not.toContain(second.id);
  unpinNote(w, second.id);
  expect(treeItems(w, folder.id).map(n => n.id)).toEqual([first.id, second.id]);
});

it("restores detached legacy pins and retains notes whose original parent is gone", () => {
  const w = emptyWorkspace(), folder = createContainer(w, { title: "Original folder" });
  const detached = createContainer(w, { title: "Legacy pins" }); detached.system = "pinned";
  const note = createNote(w, detached.id), orphan = createNote(w, detached.id);
  note.metadata = { pinnedFrom: { containerId: folder.id, order: 7, kind: "journal" } };
  orphan.metadata = { pinnedFrom: { containerId: "missing" } };
  restoreLegacyPins(w);
  expect(note).toMatchObject({ containerId: folder.id, kind: "journal", order: 7, metadata: { pinned: true } });
  expect(note.metadata).not.toHaveProperty("pinnedFrom");
  expect(orphan.containerId).toBe(general(w).id);
  restoreLegacyPins(w);
  expect(note.containerId).toBe(folder.id);
  expect(w.notes).toHaveLength(2);
});
