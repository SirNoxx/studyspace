import { it, expect } from "vitest";
import {
  learningCatalog,
  topicCategories,
  topicKey,
} from "../src/lib/learning-catalog";
import {
  startLearningPath,
  eligibleTopics,
  setPathLearned,
  learnedVault,
} from "../src/lib/learning";
import { emptyWorkspace, contextDefinitions } from "../src/lib/model";
import { treeItems } from "../src/lib/tree";
import {
  createNote,
  saveNote,
  createContainer,
  moveItems,
  trashItems,
  validateWorkspace,
} from "../src/lib/domain";
import {
  prepareImport,
  commitImport,
  exportWorkspace,
} from "../src/lib/transfer";
import { general } from "../src/lib/model";
import { moveToQuickNotes } from "../src/lib/quick-notes";
import { newModule, parseModule, moduleText } from "../src/lib/modules";
import { studyCodeBlocks, codeFence } from "../src/lib/code-blocks";
import { conceptMatches } from "../src/lib/markdown";
it("ships hundreds of unique topics with balanced categories", () => {
  expect(learningCatalog.length).toBeGreaterThanOrEqual(300);
  expect(new Set(learningCatalog.map((t) => t.id)).size).toBe(
    learningCatalog.length,
  );
  expect(new Set(learningCatalog.map((t) => topicKey(t.title))).size).toBe(
    learningCatalog.length,
  );
  for (const c of topicCategories)
    expect(
      learningCatalog.filter((t) => t.category === c).length,
    ).toBeGreaterThanOrEqual(75);
});
it("starts one separate path, excludes it from later spins, and keeps its files on completion", () => {
  const w = emptyWorkspace(),
    topic = learningCatalog[0],
    p = startLearningPath(w, topic),
    count = w.notes.length;
  expect(startLearningPath(w, { ...topic, id: "wiki:123" }).id).toBe(p.id);
  expect(w.notes).toHaveLength(count);
  expect(eligibleTopics([topic], w.settings.learningPaths!)).toHaveLength(0);
  expect(treeItems(w, null).map((c) => c.id)).not.toContain(p.rootId);
  setPathLearned(p, true);
  const copy = JSON.parse(JSON.stringify(w));
  expect(learnedVault(copy).find((e) => e.id === p.id)?.kind).toBe("Path");
  expect(copy.notes[0].containerId).toBe(p.rootId);
  setPathLearned(p, false);
  expect(p.concepts[0].learned).toBe(true);
  expect(w.notes).toHaveLength(count);
});
it("definition modules synchronize phrase entries, preserve focus-independent identity and support undo", () => {
  const w = emptyWorkspace(),
    n = createNote(w),
    block = studyCodeBlocks(newModule("definition"))[0],
    data = parseModule(block.code)!;
  if (data.kind !== "definition") throw Error("Wrong module");
  const body = codeFence({
    ...block,
    code: JSON.stringify({
      ...data,
      term: "version control",
      explanation: "Track changes over time",
      learned: true,
      learnedAt: new Date().toISOString(),
    }),
  });
  saveNote(w, n.id, n.revision, { body });
  const id = w.definitions[0].id;
  expect(contextDefinitions(w, n.containerId)[0].term).toBe("version control");
  const prose =
    "Version   control works. version\ncontrol helps. version controller differs. `version control` is code.";
  const matches = conceptMatches(prose, w.definitions);
  expect(matches.map((m) => prose.slice(m.from, m.to))).toEqual([
    "Version   control",
    "version\ncontrol",
  ]);
  expect(learnedVault(w)[0]).toMatchObject({
    title: "version control",
    noteId: n.id,
  });
  saveNote(w, n.id, n.revision, {
    body: body.replace("Track changes over time", "Keep a history"),
  });
  expect(w.definitions[0]).toMatchObject({ id, definition: "Keep a history" });
  saveNote(w, n.id, n.revision, { body: "" });
  expect(w.definitions[0].trashed).toBe(true);
  saveNote(w, n.id, n.revision, { body });
  expect(w.definitions[0]).toMatchObject({ id, trashed: false });
  expect(w.definitions).toHaveLength(1);
  expect(moduleText(studyCodeBlocks(body)[0].code)).toContain(
    "version control: Track changes",
  );
  const folder = createContainer(w, { title: "New subject" });
  moveItems(w, [n.id], folder.id);
  expect(w.definitions[0].subjectIds).toEqual([folder.id]);
  trashItems(w, [n.id]);
  expect(w.definitions[0].trashed).toBe(true);
  trashItems(w, [n.id], true);
  expect(w.definitions[0].trashed).toBe(false);
  moveToQuickNotes(w, n.id);
  expect(
    contextDefinitions(w, n.containerId).find((d) => d.id === id)?.term,
  ).toBe("version control");
});

it("restores learning paths, completion dates and linked module definitions from a full backup", async () => {
  const w = emptyWorkspace(),
    path = startLearningPath(w, learningCatalog[0]);
  const folder = createContainer(w, {
    title: "Examples",
    kind: "folder",
    parentId: path.rootId,
  });
  const block = studyCodeBlocks(newModule("definition"))[0];
  const body = codeFence({
    ...block,
    code: JSON.stringify({
      version: 1,
      kind: "definition",
      term: "primary source",
      explanation: "An original record",
      learned: true,
      learnedAt: new Date().toISOString(),
    }),
  });
  createNote(w, folder.id, { title: "Evidence", body });
  setPathLearned(path, true);
  const zip = await exportWorkspace(w, { full: true });
  const plan = await prepareImport([
    new File([Uint8Array.from(zip)], "learning.zip"),
  ]);
  const restored = emptyWorkspace();
  commitImport(restored, plan, general(restored).id);
  const restoredPath = restored.settings.learningPaths![0];
  expect(restoredPath).toMatchObject({
    topic: path.topic,
    learnedAt: path.learnedAt,
  });
  expect(restoredPath.rootId).not.toBe(path.rootId);
  expect(
    restored.containers.find((c) => c.id === restoredPath.rootId)?.parentId,
  ).toBeNull();
  expect(learnedVault(restored).map((e) => e.title)).toContain(
    "primary source",
  );
  expect(restored.definitions).toHaveLength(1);
  expect(restored.definitions[0].moduleBlockId).toBe(block.id);
  const restoredNote = restored.notes.find((n) => n.title === "Evidence")!;
  saveNote(restored, restoredNote.id, restoredNote.revision, {
    body: restoredNote.body.replace("original record", "firsthand record"),
  });
  expect(restored.definitions).toHaveLength(1);
  expect(restored.definitions[0].definition).toBe("An firsthand record");
  expect(() => validateWorkspace(restored)).not.toThrow();
});
