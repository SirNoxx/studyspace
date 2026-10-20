import { expect, it } from "vitest";
import { emptyWorkspace, general } from "../src/lib/model";
import {
  createContainer,
  createNote,
  saveNote,
  moveItems,
} from "../src/lib/domain";
import {
  definitionCollection,
  definitionCollections,
} from "../src/lib/definition-collections";
import { quickNotesContainer } from "../src/lib/quick-notes";
import { codeFence } from "../src/lib/code-blocks";
import { uid, now } from "../src/lib/model";

it("offers collections, including nested collections, and maps folders to their collection", () => {
  const w = emptyWorkspace();
  const collection = createContainer(w, { title: "Science" });
  const folder = createContainer(w, {
    title: "Research",
    kind: "folder",
    parentId: collection.id,
  });
  const nested = createContainer(w, { title: "Biology", parentId: folder.id });
  const archived = createContainer(w, { title: "Old", archived: true });
  const hidden = createContainer(w, { title: "Hidden", parentId: archived.id });
  const quick = quickNotesContainer(w);
  expect(definitionCollections(w).map((c) => c.id)).toEqual([
    general(w).id,
    collection.id,
    nested.id,
  ]);
  expect(definitionCollection(w, folder.id)?.id).toBe(collection.id);
  expect(definitionCollection(w, quick.id)?.id).toBe(general(w).id);
  expect(definitionCollections(w).some((c) => c.id === hidden.id)).toBe(false);
});

it("keeps additional collections on module edits and moves without duplicating the definition", () => {
  const w = emptyWorkspace();
  const shared = createContainer(w, { title: "Shared terms" });
  const destination = createContainer(w, { title: "Biology" });
  const note = createNote(w);
  const body = codeFence({
    id: "multi-definition",
    language: "module",
    collapsed: false,
    code: JSON.stringify({
      version: 1,
      kind: "definition",
      term: "Cell",
      explanation: "A unit of life",
      learned: false,
    }),
  });
  saveNote(w, note.id, note.revision, { body });
  w.definitions[0].subjectIds.push(shared.id);
  saveNote(w, note.id, note.revision, {
    body: body.replace("A unit", "The basic unit"),
  });
  expect(w.definitions[0].subjectIds).toEqual([general(w).id, shared.id]);
  moveItems(w, [note.id], destination.id);
  expect(w.definitions[0].subjectIds).toEqual([destination.id, shared.id]);
  expect(w.definitions).toHaveLength(1);
});

it("attached definition modules keep the original dictionary entry instead of duplicating it", () => {
  const w = emptyWorkspace(),
    note = createNote(w),
    id = uid();
  w.definitions.push({
    id,
    term: "Git",
    definition: "Version control",
    aliases: [],
    subjectIds: [general(w).id],
    createdAt: now(),
    updatedAt: now(),
  });
  const body = codeFence({
    id: "attached",
    language: "module",
    title: "Git definition",
    collapsed: false,
    code: JSON.stringify({
      version: 1,
      kind: "definition",
      term: "Git",
      explanation: "Version control",
      definitionId: id,
      learned: false,
    }),
  });
  saveNote(w, note.id, note.revision, { body });
  saveNote(w, note.id, note.revision, {
    body: body.replace("Version control", "My expanded explanation"),
  });
  expect(w.definitions).toHaveLength(1);
  expect(w.definitions[0].definition).toBe("Version control");
  saveNote(w, note.id, note.revision, { body: "" });
  expect(w.definitions[0].trashed).not.toBe(true);
});
