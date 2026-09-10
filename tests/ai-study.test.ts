import { afterEach, expect, it, vi } from "vitest";
import { emptyWorkspace, general } from "../src/lib/model";
import { createContainer, createNote } from "../src/lib/domain";
import {
  buildAIContext,
  studyBatches,
  studyInstructions,
  type AIInput,
} from "../src/lib/server/ai";
import { streamStudyResponse } from "../src/lib/server/ai-response";
afterEach(() => vi.unstubAllGlobals());

it("includes every nested note beyond the old 30-note cutoff, excludes other folders and journals", () => {
  const w = emptyWorkspace(),
    folder = createContainer(w, {
      title: "Folder",
      kind: "folder",
      parentId: general(w).id,
    });
  const child = createContainer(w, {
    title: "Child",
    kind: "folder",
    parentId: folder.id,
  });
  for (let i = 0; i < 35; i++)
    createNote(w, i % 2 ? folder.id : child.id, { body: `Concept ${i}` });
  createNote(w, undefined, { body: "Outside" });
  createNote(w, folder.id, { body: "Private journal", kind: "journal" });
  const hidden = createContainer(w, {
    title: "Archived",
    parentId: folder.id,
    archived: true,
  });
  createNote(w, hidden.id, { body: "Hidden" });
  const context = buildAIContext(w, {
    action: "cards",
    scope: "folder",
    containerId: folder.id,
    noteId: w.notes[0].id,
    expectedRevision: 1,
  });
  expect(context.noteCount).toBe(35);
  expect(context.passages.map((p) => p.text)).toEqual(
    Array.from({ length: 35 }, (_, i) => `Concept ${i}`),
  );
});

it("splits long paragraphs without losing text and rejects oversized or stale context explicitly", () => {
  const w = emptyWorkspace(),
    n = createNote(w, undefined, { body: "X".repeat(60000) });
  const input: AIInput = {
    action: "cards",
    scope: "note",
    noteId: n.id,
    expectedRevision: 1,
  };
  const context = buildAIContext(w, input),
    batches = studyBatches(context);
  expect(batches).toHaveLength(3);
  expect(
    batches
      .flat()
      .map((p) => p.text)
      .join(""),
  ).toBe(n.body);
  expect(new Set(batches.flat().map((p) => p.id)).size).toBe(5);
  expect(() => buildAIContext(w, { ...input, expectedRevision: 2 })).toThrow(
    "changed",
  );
  n.body = "X".repeat(200001);
  expect(() => buildAIContext(w, input)).toThrow("smaller folder");
});

it("generates cards for every section with hard reasoning instructions and persists only complete output", async () => {
  const w = emptyWorkspace(),
    n = createNote(w, undefined, { body: "X".repeat(50000) });
  const input: AIInput = {
    action: "cards",
    scope: "note",
    noteId: n.id,
    expectedRevision: 1,
    difficulty: "hard",
    personality: "Use encouraging language and ask reflective questions.",
  };
  const context = buildAIContext(w, input),
    requests: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      const data = JSON.parse(body.input),
        id = data.passages[0].id;
      const output = JSON.stringify({
        questions: [
          {
            question: `Infer the mechanism in scenario ${requests.length}.`,
            answer: `Reasoning [ref:${id}]`,
          },
        ],
      });
      return new Response(
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: output })}\n\ndata: {"type":"response.completed"}\n\n`,
      );
    }),
  );
  const text = await new Response(
    streamStudyResponse(input, context, new AbortController().signal),
  ).text();
  const events = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(requests).toHaveLength(3);
  expect(
    requests.every(
      (r) =>
        JSON.parse(r.input).learnerPreferences === input.personality &&
        r.store === false &&
        r.text.format.strict &&
        r.instructions.includes("multi-step reasoning"),
    ),
  ).toBe(true);
  const completed = events.at(-1);
  expect(completed.type).toBe("complete");
  expect(completed.coverage).toEqual({ notes: 1, sections: 3 });
  expect(JSON.parse(completed.text).questions).toHaveLength(3);
  expect(completed.text).toContain("#ai-ref:");
  expect(studyInstructions({ ...input, difficulty: "easy" })).toContain(
    "direct recall",
  );
  expect(studyInstructions({ ...input, difficulty: "medium" })).toContain(
    "comparison and application",
  );
});

it("does not mark partial provider output as complete", async () => {
  const w = emptyWorkspace(),
    n = createNote(w, undefined, { body: "Some notes" });
  const input: AIInput = {
    action: "summarize",
    scope: "note",
    noteId: n.id,
    expectedRevision: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          'data: {"type":"response.output_text.delta","delta":"Partial"}\n\n',
        ),
    ),
  );
  const text = await new Response(
    streamStudyResponse(
      input,
      buildAIContext(w, input),
      new AbortController().signal,
    ),
  ).text();
  expect(text).toContain('"type":"error"');
  expect(text).not.toContain('"type":"complete"');
});
