import { expect, it } from "vitest";
import { emptyWorkspace, general } from "../src/lib/model";
import {
  addReview,
  createContainer,
  createNote,
  saveNote,
} from "../src/lib/domain";
import { saveDictionaryDefinition } from "../src/lib/definitions";
import { definitionUsages } from "../src/lib/definition-usage";
import { codeFence, studyCodeBlocks } from "../src/lib/code-blocks";

it("saves nested definitions in the inherited collection and preserves aliases/review links on edit", () => {
  const w = emptyWorkspace(),
    subjectIds = [general(w).id];
  const id = saveDictionaryDefinition(w, {
    term: "Star",
    definition: "A luminous sphere",
    subjectIds,
    aliases: ["Stellar body"],
  });
  const review = addReview(w, {
    front: "Star",
    back: "A luminous sphere",
    sourceType: "definition",
    sourceId: id,
  });
  saveDictionaryDefinition(w, {
    id,
    term: "Star",
    definition: "A sphere of plasma",
    subjectIds,
  });
  expect(w.definitions).toHaveLength(1);
  expect(w.definitions[0].aliases).toEqual(["Stellar body"]);
  expect(review.contentChanged).toBe(true);
  expect(() =>
    saveDictionaryDefinition(w, { term: "Empty", definition: "", subjectIds }),
  ).toThrow();
  expect(() =>
    saveDictionaryDefinition(w, {
      term: "No collection",
      definition: "text",
      subjectIds: [],
    }),
  ).toThrow();
});

it("updates an existing definition module through the nested editor without duplicating it", () => {
  const w = emptyWorkspace(),
    note = createNote(w);
  saveNote(w, note.id, note.revision, {
    body: codeFence({
      id: "nested-module",
      language: "module",
      collapsed: false,
      code: JSON.stringify({
        version: 1,
        kind: "definition",
        term: "Star",
        explanation: "Old meaning",
        learned: false,
      }),
    }),
  });
  const entry = w.definitions[0];
  saveDictionaryDefinition(w, {
    id: entry.id,
    term: "Star",
    definition: "New meaning",
    subjectIds: entry.subjectIds,
  });
  expect(w.definitions).toHaveLength(1);
  expect(JSON.parse(studyCodeBlocks(note.body)[0].code).explanation).toBe(
    "New meaning",
  );
});

it("finds exact separate occurrences, aliases and explicit links with safe source offsets", () => {
  const w = emptyWorkspace(),
    subjectIds = [general(w).id];
  const id = saveDictionaryDefinition(w, {
    term: "Star",
    definition: "Light",
    aliases: ["Stellar body"],
    subjectIds,
  });
  const note = createNote(w, general(w).id, {
    title: "Astronomy",
    body: "Star above.\n\nAnother Star and a stellar body.\n\n`Star` and Starship.\n\n```text\nStar\n```",
  });
  const elsewhere = createContainer(w, { title: "Other" });
  const linked = createNote(w, elsewhere.id, {
    title: "Explicit link",
    body: `[this object](#definition:${id})`,
  });
  const usages = definitionUsages(w, id);
  expect(
    usages.filter((u) => u.noteId === note.id).map((u) => [u.quote, u.line]),
  ).toEqual([
    ["Star", 1],
    ["Star", 3],
    ["stellar body", 3],
  ]);
  expect(usages.find((u) => u.noteId === linked.id)?.quote).toBe("this object");
  for (const usage of usages)
    expect(
      w.notes
        .find((n) => n.id === usage.noteId)!
        .body.slice(usage.from, usage.to),
    ).toBe(usage.quote);
});

it("does not offer trashed/archived notes, other meanings or code-only mentions", () => {
  const w = emptyWorkspace(),
    subjectIds = [general(w).id];
  const id = saveDictionaryDefinition(w, {
    term: "Cell",
    definition: "Unit of life",
    subjectIds,
  });
  const other = createContainer(w, { title: "Prisons" });
  saveDictionaryDefinition(w, {
    term: "Cell",
    definition: "A room",
    subjectIds: [other.id],
  });
  createNote(w, other.id, { body: "Cell" });
  createNote(w, general(w).id, { body: "Cell", trashed: true });
  createNote(w, general(w).id, { body: "Cell", archived: true });
  createNote(w, general(w).id, { body: "`Cell`" });
  expect(definitionUsages(w, id)).toEqual([]);
});
