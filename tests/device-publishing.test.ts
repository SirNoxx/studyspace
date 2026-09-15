import { it, expect } from "vitest";
import { emptyWorkspace, uid, now } from "../src/lib/model";
import { createNote, prepareSnapshot } from "../src/lib/domain";
import { DeviceSnapshot } from "../src/lib/public-snapshot-schema";

it("accepts reviewed local snapshots while stripping account-only fields", () => {
  const w = emptyWorkspace();
  const note = createNote(w, undefined, { title: "Reviewed note", body: "Publish this." });
  createNote(w, undefined, { title: "Private note", body: "Keep this private." });
  const snapshot = prepareSnapshot(w, [note.id]);
  const parsed = DeviceSnapshot.parse({ ...snapshot, privateWorkspace: w });
  expect(parsed.notes.map(n => n.id)).toEqual([note.id]);
  expect(parsed).not.toHaveProperty("privateWorkspace");
  expect(JSON.stringify(parsed)).not.toContain("Keep this private.");
});

it("rejects private annotations and references outside the reviewed selection", () => {
  const w = emptyWorkspace(), note = createNote(w);
  const snapshot = prepareSnapshot(w, [note.id]);
  const annotation = { id: uid(), noteId: note.id, revision: 1, quote: "quote", prefix: "", suffix: "", body: "comment", kind: "author", createdAt: now(), state: "attached" };
  expect(DeviceSnapshot.safeParse({ ...snapshot, annotations: [annotation] }).success).toBe(true);
  for (const patch of [{ kind: "private" }, { noteId: uid() }, { prefix: "private surrounding text" }])
    expect(DeviceSnapshot.safeParse({ ...snapshot, annotations: [{ ...annotation, ...patch }] }).success).toBe(false);
  expect(DeviceSnapshot.safeParse({ ...snapshot, notes: [...snapshot.notes, ...snapshot.notes] }).success).toBe(false);
});

it("requires attachment integrity metadata and forbids private storage paths", () => {
  const w = emptyWorkspace(), note = createNote(w), snapshot = prepareSnapshot(w, [note.id]);
  const asset = { id: uid(), filename: "paper.pdf", mime: "application/pdf", size: 100, hash: "a".repeat(64), key: "", createdAt: now() };
  expect(DeviceSnapshot.safeParse({ ...snapshot, attachments: [asset] }).success).toBe(true);
  for (const patch of [{ key: "private-owner/original-file" }, { hash: "unverified" }, { size: 51 * 1024 * 1024 }])
    expect(DeviceSnapshot.safeParse({ ...snapshot, attachments: [{ ...asset, ...patch }] }).success).toBe(false);
});
