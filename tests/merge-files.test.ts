import { it, expect } from "vitest";
import { emptyWorkspace, uid, now } from "../src/lib/model";
import { createNote, prepareSnapshot } from "../src/lib/domain";
import { instantiateSnapshot } from "../src/lib/study-copy";
import { recordChanges, applyRecordDecision } from "../src/lib/merge-records";
import {
  checkpointMerge,
  undoMerge,
  copyPath,
} from "../src/lib/merge-checkpoint";
it("adopts a chosen file version independently and undoes bytes/metadata/reference changes from a checkpoint", () => {
  const source = emptyWorkspace(),
    n = createNote(source),
    file = {
      id: uid(),
      key: "source/a",
      filename: "TEST.pdf",
      mime: "application/pdf",
      hash: "first",
      size: 12,
      createdAt: now(),
    };
  source.attachments.push(file);
  n.body = "[file](attachment:" + file.id + ")";
  const baseline = prepareSnapshot(
      source,
      [n.id],
      { allowCopies: true },
      { attachmentIds: [file.id] },
    ),
    w = emptyWorkspace(),
    localFile = { ...file, id: uid(), key: "owner/old" },
    copy = instantiateSnapshot(w, baseline, uid(), [localFile]);
  const next = structuredClone(baseline);
  next.attachments![0].hash = "second";
  const change = recordChanges(w, copy, next).find(
    (c) => c.kind === "attachments",
  )!;
  expect(change.status).toBe("safe");
  checkpointMerge(w, copy);
  const updatedFile = { ...file, id: uid(), hash: "second", key: "owner/new" };
  applyRecordDecision(w, copy, change, "upstream", updatedFile);
  expect(w.notes[0].body).toContain(updatedFile.id);
  expect(w.attachments.find((a) => a.id === localFile.id)?.hash).toBe("first");
  undoMerge(w, copy);
  expect(w.attachments.filter((a) => a.id === localFile.id)).toHaveLength(1);
  expect(w.notes[0].body).toContain(localFile.id);
  expect(w.attachments.some((a) => a.id === updatedFile.id)).toBe(false);
  expect(w.notes[0].history.some((h) => h.body.includes(updatedFile.id))).toBe(
    true,
  );
});
it("recreates an accepted nested upstream path inside the independent copy", () => {
  const source = emptyWorkspace(),
    n = createNote(source),
    snapshot = prepareSnapshot(source, [n.id]),
    w = emptyWorkspace(),
    copy = instantiateSnapshot(w, snapshot, uid());
  const id = copyPath(w, copy, "Original root/New folder/Nested");
  expect(w.containers.find((c) => c.id === id)?.title).toBe("Nested");
  expect(copyPath(w, copy, "Original root/New folder/Nested")).toBe(id);
});
