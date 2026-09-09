import { it, expect } from "vitest";
import { emptyWorkspace, general, uid, now } from "../src/lib/model";
import {
  createContainer,
  createNote,
  prepareSnapshot,
  addReview,
  duplicateItem,
} from "../src/lib/domain";
import {
  prepareImport,
  commitImport,
  exportWorkspace,
  sha256,
} from "../src/lib/transfer";
import { instantiateSnapshot } from "../src/lib/study-copy";
import { parseQuiz } from "../src/lib/quiz";
import { produce } from "immer";
import { unzipSync, strFromU8 } from "fflate";
it("round-trips typed backup content, metadata, source relations, and actual asset checksums", async () => {
  const w = emptyWorkspace(),
    c = createContainer(w, { title: "TEST College" }),
    n = createNote(w, c.id, {
      title: "Café 保留",
      kind: "journal",
      journalDate: "2026-03-08",
      body: "---\nunknown: preserve\n---\nContent",
    }),
    bytes = new TextEncoder().encode("OBVIOUS TEST ATTACHMENT"),
    a = {
      id: uid(),
      filename: "Evidence.txt",
      mime: "text/plain",
      hash: await sha256(bytes),
      size: bytes.length,
      key: "test/path",
      createdAt: now(),
    };
  w.attachments.push(a);
  n.body += "\n[Evidence](attachment:" + a.id + ")";
  w.definitions.push({
    id: uid(),
    term: "Tool calling",
    definition: "TEST definition",
    aliases: ["Function calling"],
    subjectIds: [c.id],
    createdAt: now(),
    updatedAt: now(),
  });
  const source = {
    id: uid(),
    input: "TEST evidence",
    canonical: "attachment:" + a.id,
    title: "TEST evidence",
    kind: "pdf" as const,
    authors: [],
    subjectIds: [c.id],
    noteIds: [n.id],
    attachmentId: a.id,
    manual: true,
    overrides: ["title"],
    status: "ready" as const,
    createdAt: now(),
  };
  w.sources.push(source);
  addReview(w, {
    front: "TEST Q",
    back: "TEST A",
    sourceType: "note",
    sourceId: n.id,
  });
  const zip = await exportWorkspace(w, {
      full: true,
      loadAsset: async () => bytes,
    }),
    files = unzipSync(zip);
  expect(strFromU8(files["TEST College/Café 保留.md"])).toContain("../assets/");
  const plan = await prepareImport([
    new File([Uint8Array.from(zip)], "backup.zip"),
  ]);
  const fresh = emptyWorkspace();
  fresh.attachments.push({ ...a, id: uid(), key: "fresh/path" });
  expect(commitImport(fresh, plan, general(fresh).id).imported).toBe(1);
  expect(fresh.notes[0]).toMatchObject({
    title: n.title,
    kind: "journal",
    journalDate: n.journalDate,
  });
  expect(fresh.notes[0].body).toContain(
    "attachment:" + fresh.attachments[0].id,
  );
  expect(fresh.sources[0].attachmentId).toBe(fresh.attachments[0].id);
  expect(fresh.sources[0].noteIds).toEqual([fresh.notes[0].id]);
  expect(fresh.definitions[0].aliases).toEqual(["Function calling"]);
  expect(fresh.review[0].sourceId).toBe(fresh.notes[0].id);
  expect(commitImport(fresh, plan, general(fresh).id).skipped).toBe(1);
});
it("publishes only opted-in bytes and author annotations and creates independent mapped copies", () => {
  const w = emptyWorkspace(),
    n = createNote(w, undefined, { title: "TEST public", body: "Public text" }),
    asset = {
      id: uid(),
      filename: "test.pdf",
      key: "PRIVATE_OWNER/path",
      hash: "testhash",
      mime: "application/pdf",
      size: 20,
      createdAt: now(),
    };
  w.attachments.push(asset);
  n.body += "\n[Evidence](attachment:" + asset.id + ")";
  w.annotations.push(
    {
      id: uid(),
      noteId: n.id,
      revision: 1,
      body: "PRIVATE RESPONSE",
      kind: "private",
      quote: "Public text",
      prefix: "",
      suffix: "",
      state: "attached",
      createdAt: now(),
    },
    {
      id: uid(),
      noteId: n.id,
      revision: 1,
      body: "AUTHOR CONTEXT",
      kind: "author",
      quote: "Public text",
      prefix: "",
      suffix: "",
      state: "attached",
      createdAt: now(),
    },
  );
  const snapshot = prepareSnapshot(
    w,
    [n.id],
    { allowCopies: true },
    {
      attachmentIds: [asset.id],
      annotationIds: w.annotations.map((a) => a.id),
    },
  );
  expect(JSON.stringify(snapshot)).not.toMatch(
    /PRIVATE_OWNER|PRIVATE RESPONSE/,
  );
  expect(snapshot.annotations).toHaveLength(1);
  expect(snapshot.notes[0].body).toContain("attachment:" + asset.id);
  const fresh = emptyWorkspace(),
    newAsset = { ...asset, id: uid(), key: "SECOND_OWNER/path" };
  const copy = instantiateSnapshot(fresh, snapshot, uid(), [newAsset]);
  expect(fresh.notes[0].body).toContain(newAsset.id);
  fresh.notes[0].body = "Independent";
  expect(snapshot.notes[0].body).not.toBe("Independent");
  expect(copy.lineage).toHaveLength(1);
});
it("duplicates notes safely inside immutable editor transactions", () => {
  const w = emptyWorkspace();
  const n = createNote(w, undefined, { body: "Preserve" });
  const next = produce(w, (d) => {
    duplicateItem(d, n.id);
  });
  expect(next.notes).toHaveLength(2);
  expect(w.notes).toHaveLength(1);
});
it("parses structured quizzes and rejects incomplete or malformed output", () => {
  expect(
    parseQuiz('{"questions":[{"question":"TEST Q","answer":"TEST A"}]}'),
  ).toHaveLength(1);
  expect(() => parseQuiz('{"questions":[')).toThrow();
  expect(() => parseQuiz('{"questions":[{"question":"Q"}]}')).toThrow();
});
it("preserves trashed file bytes and trash state through a full backup", async () => {
  const w = emptyWorkspace(),
    bytes = new TextEncoder().encode("TRASHED TEST BYTES"),
    asset = {
      id: uid(),
      filename: "old.txt",
      key: "test/old",
      mime: "text/plain",
      size: bytes.length,
      hash: await sha256(bytes),
      createdAt: now(),
      trashed: true,
    };
  w.attachments.push(asset);
  const note = createNote(w, undefined, {
    body: "[Old](attachment:" + asset.id + ")",
  });
  note.trashed = true;
  const zip = await exportWorkspace(w, {
    full: true,
    loadAsset: async () => bytes,
  });
  const plan = await prepareImport([
    new File([Uint8Array.from(zip)], "backup.zip"),
  ]);
  expect(
    plan.files.some((f) => f.kind === "asset" && f.hash === asset.hash),
  ).toBe(true);
  const fresh = emptyWorkspace();
  fresh.attachments.push({
    ...asset,
    id: uid(),
    key: "new/old",
    trashed: false,
  });
  commitImport(fresh, plan, general(fresh).id);
  expect(fresh.attachments[0].trashed).toBe(true);
  expect(fresh.notes[0].trashed).toBe(true);
});
