import { describe, it, expect } from "vitest";
import { emptyWorkspace, general } from "../src/lib/model";
import { createContainer, createNote } from "../src/lib/domain";
import { dropTreeItem, treeDestination, treeItems } from "../src/lib/tree";

describe("tree drag and drop", () => {
  it("persists mixed folder and file order independently of record retrieval order", () => {
    const w = emptyWorkspace(),
      root = general(w).id;
    const folder = createContainer(w, {
      title: "Folder",
      kind: "folder",
      parentId: root,
    });
    const first = createNote(w, root, { title: "First" });
    const second = createNote(w, root, { title: "Second" });
    dropTreeItem(w, second.id, folder.id, "before");
    dropTreeItem(w, first.id, folder.id, "after");
    const reopened = JSON.parse(JSON.stringify(w));
    reopened.notes.reverse();
    expect(treeItems(reopened, root).map((x) => x.id)).toEqual([
      second.id,
      folder.id,
      first.id,
    ]);
  });
  it("reorders collections, nests folders, and can move them out again", () => {
    const w = emptyWorkspace();
    const a = createContainer(w, { title: "A" }),
      b = createContainer(w, { title: "B" });
    dropTreeItem(w, b.id, a.id, "before");
    expect(treeItems(w, null).map((x) => x.title)).toEqual([
      "General",
      "B",
      "A",
    ]);
    const f = createContainer(w, {
      title: "Folder",
      kind: "folder",
      parentId: a.id,
    });
    const g = createContainer(w, {
      title: "Nested",
      kind: "folder",
      parentId: a.id,
    });
    dropTreeItem(w, g.id, f.id, "inside");
    expect(g.parentId).toBe(f.id);
    const before = JSON.stringify(w);
    expect(() => dropTreeItem(w, f.id, g.id, "inside")).toThrow();
    expect(JSON.stringify(w)).toBe(before);
    dropTreeItem(w, g.id, f.id, "after");
    expect(g.parentId).toBe(a.id);
    expect(treeItems(w, a.id).map((x) => x.id)).toEqual([f.id, g.id]);
  });
  it("rejects self drops, loose root files, and nesting General without changing data", () => {
    const w = emptyWorkspace(),
      root = general(w).id;
    const a = createContainer(w, { title: "A" }),
      note = createNote(w);
    for (const [source, target, position] of [
      [a.id, a.id, "inside"],
      [note.id, a.id, "before"],
      [root, a.id, "inside"],
    ] as const) {
      const before = JSON.stringify(w);
      expect(() => treeDestination(w, source, target, position)).toThrow();
      expect(JSON.stringify(w)).toBe(before);
    }
  });
});
