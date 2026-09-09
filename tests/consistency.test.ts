import { it, expect } from "vitest";
import { produce } from "immer";
import { emptyWorkspace, uid, now } from "../src/lib/model";
import { createNote, prepareSnapshot } from "../src/lib/domain";
import { makePatch, applyPatch } from "../src/lib/workspace-patch";
import { recoverWorkspace } from "../src/lib/recovery";
import { instantiateSnapshot } from "../src/lib/study-copy";
import { recordChanges, applyRecordDecision } from "../src/lib/merge-records";
import { locateQuote } from "../src/lib/anchors";
import { jsonStream } from "../src/lib/server/stream";
it("sends only changed private records and applies removals without changing server-owned lineage", () => {
  const base = emptyWorkspace(),
    n = createNote(base, undefined, { body: "original" });
  const next = produce(base, (w) => {
    w.notes[0].body = "changed";
  });
  const patch = makePatch(next, base);
  expect(Object.keys(patch.arrays)).toEqual(["notes"]);
  expect(patch.arrays.notes?.upserts).toHaveLength(1);
  expect(applyPatch(base, patch).notes[0].body).toBe("changed");
  expect(
    applyPatch(base, { arrays: { notes: { upserts: [], remove: [n.id] } } })
      .notes,
  ).toHaveLength(0);
});
it("recovers a conflicting draft additively without overwriting the saved original", () => {
  const saved = emptyWorkspace();
  createNote(saved, undefined, {
    title: "TEST original",
    body: "Saved content",
  });
  const draft = structuredClone(saved);
  draft.notes[0].body = "Unsaved independent edit";
  const recovered = recoverWorkspace(saved, draft);
  expect(recovered.notes.map((n) => n.body)).toEqual([
    "Saved content",
    "Unsaved independent edit",
  ]);
  expect(saved.notes).toHaveLength(1);
  expect(recovered.notes[1].title).toContain("recovered draft");
});
it("tracks selected dictionary updates and keeps skipped metadata baselines", () => {
  const original = emptyWorkspace(),
    n = createNote(original);
  const def = {
    id: uid(),
    term: "TEST concept",
    definition: "Before",
    aliases: [],
    subjectIds: [n.containerId],
    createdAt: now(),
    updatedAt: now(),
  };
  original.definitions.push(def);
  const base = prepareSnapshot(original, [n.id]);
  const local = emptyWorkspace(),
    copy = instantiateSnapshot(local, base, uid());
  const next = structuredClone(base);
  next.definitions[0].definition = "After";
  const changes = recordChanges(local, copy, next);
  expect(changes).toHaveLength(1);
  expect(changes[0].status).toBe("safe");
  applyRecordDecision(local, copy, changes[0], "skip");
  expect(recordChanges(local, copy, next)).toHaveLength(1);
  applyRecordDecision(local, copy, changes[0], "upstream");
  expect(local.definitions[0].definition).toBe("After");
  expect(recordChanges(local, copy, next)).toHaveLength(0);
});
it("reanchors formatted Markdown quotes and refuses ambiguous repeated passages", () => {
  expect(
    locateQuote("A **clear phrase** matters.", "A clear phrase matters.").state,
  ).toBe("attached");
  expect(locateQuote("same\n\nsame", "same").state).toBe("changed");
  expect(locateQuote("changed", "missing").state).toBe("unresolved");
});
it("streams large UTF-8 JSON without corrupting split surrogate pairs", async () => {
  const input = { body: "研究🧠".repeat(30000) };
  expect(await jsonStream(input).json()).toEqual(input);
});
