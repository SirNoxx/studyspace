import { expect, it } from "vitest";
import { emptyWorkspace, general } from "../src/lib/model";
import {
  createNote,
  createContainer,
  moveItems,
  validateWorkspace,
} from "../src/lib/domain";
import {
  quickNotesContainer,
  separateQuickNotes,
  moveToQuickNotes,
} from "../src/lib/quick-notes";
import { pinNote, isPinnedNote } from "../src/lib/pinned-notes";
import { treeItems } from "../src/lib/tree";
import {
  moduleTemplates,
  newModule,
  parseModule,
  createModuleData,
} from "../src/lib/modules";
import { studyCodeBlocks } from "../src/lib/code-blocks";
import { noteStudyText } from "../src/lib/transcripts";
it("preserves every module through Markdown and rejects malformed imported data", () => {
  for (const t of moduleTemplates) {
    const b = studyCodeBlocks(newModule(t.id))[0];
    expect(parseModule(b.code)).toEqual(createModuleData(t.id));
  }
  expect(
    parseModule(
      JSON.stringify({
        version: 1,
        kind: "chart",
        style: "bar",
        rows: [{ label: "bad", value: 1e100 }],
      }),
    ),
  ).toBeNull();
  expect(
    parseModule(
      JSON.stringify({
        version: 1,
        kind: "table",
        headers: ["A"],
        rows: [["B", "C"]],
      }),
    ),
  ).toBeNull();
});
it("turns module content into study material without losing editable Markdown", () => {
  const body = newModule("cornell").replace(
    '"notes":""',
    '"notes":"Mitochondria produce ATP."',
  );
  expect(noteStudyText({ body })).toContain("Mitochondria produce ATP.");
  expect(noteStudyText({ body })).not.toContain('"version":1');
  expect(studyCodeBlocks(body)[0].language).toBe("module");
});
it("separates old quick notes deterministically without altering ordinary notes or original state", () => {
  const w = emptyWorkspace(),
    folder = createContainer(w, { title: "Old folder" });
  const quick = createNote(w, folder.id, {
      kind: "quick",
      body: "Unfiled thought",
    }),
    note = createNote(w, folder.id, { body: "Filed note" });
  const one = separateQuickNotes(w),
    two = separateQuickNotes(w);
  expect(one).toEqual(two);
  expect(quick.containerId).toBe(folder.id);
  expect(one.notes.find((n) => n.id === note.id)?.containerId).toBe(folder.id);
  const holder = one.containers.find((c) => c.system === "quick")!;
  expect(one.notes.find((n) => n.id === quick.id)?.containerId).toBe(holder.id);
  expect(treeItems(one, null).map((c) => c.id)).not.toContain(holder.id);
  expect(treeItems(one, holder.id)).toEqual([]);
  expect(separateQuickNotes(one)).toBe(one);
  validateWorkspace(one);
});
it("moving a quick note files it without changing its content, identity or attachments", () => {
  const w = emptyWorkspace(),
    n = createNote(w, quickNotesContainer(w).id, {
      kind: "quick",
      body: "Keep this",
      metadata: { test: "value" },
    });
  moveItems(w, [n.id], general(w).id);
  expect(n.kind).toBe("note");
  expect(n.body).toBe("Keep this");
  expect(n.metadata).toEqual({ test: "value" });
  expect(treeItems(w, general(w).id).map((x) => x.id)).toContain(n.id);
  validateWorkspace(w);
});
it("moves regular and pinned notes to Quick notes without replacing their content or identity", () => {
  const w = emptyWorkspace();
  const folder = createContainer(w, { title: "Research" });
  const n = createNote(w, folder.id, {
    title: "Keep my research",
    body: "# Research\n![diagram](attachment:diagram)\n[[another-note]]",
    metadata: { custom: "Keep this too" },
    tags: ["biology"],
  });
  const original = structuredClone(n);
  moveToQuickNotes(w, n.id);
  expect(n).toMatchObject({
    ...original,
    kind: "quick",
    containerId: quickNotesContainer(w).id,
    updatedAt: n.updatedAt,
  });
  expect(treeItems(w, folder.id)).toEqual([]);
  pinNote(w, n.id);
  expect(isPinnedNote(w, n.id)).toBe(true);
  moveToQuickNotes(w, n.id);
  expect(isPinnedNote(w, n.id)).toBe(false);
  expect(n.metadata).toEqual(original.metadata);
  expect(n.body).toBe(original.body);
  expect(n.history).toEqual(original.history);
  expect(n.containerId).toBe(quickNotesContainer(w).id);
  moveItems(w, [n.id], folder.id);
  expect(n.kind).toBe("note");
  expect(n.body).toBe(original.body);
  validateWorkspace(w);
});
