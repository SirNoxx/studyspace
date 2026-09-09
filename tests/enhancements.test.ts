import { it, expect } from "vitest";
import { emptyWorkspace, uid, now, general } from "../src/lib/model";
import {
  createNote,
  createContainer,
  addReview,
  prepareSnapshot,
  moveItems,
} from "../src/lib/domain";
import {
  createCardGroup,
  removeCardGroup,
  calendarDays,
  shiftPeriod,
  scopedAttachments,
  stableNoteLink,
  normalizeWorkspace,
  publicationCounts,
} from "../src/lib/enhancements";
import { resolveLink } from "../src/lib/markdown";
import {
  exportWorkspace,
  prepareImport,
  commitImport,
} from "../src/lib/transfer";
import { instantiateSnapshot } from "../src/lib/study-copy";
import { unzipSync, strFromU8 } from "fflate";
it("upgrades old preferences without changing existing notes or theme", () => {
  const w = emptyWorkspace();
  createNote(w, undefined, { body: "ORIGINAL TEST CONTENT" });
  w.settings.theme = "paper";
  const next = normalizeWorkspace(w);
  expect(next.notes).toBe(w.notes);
  expect(next.settings.theme).toBe("paper");
  expect(next.settings.ribbonCompact).toBe(false);
  expect(w.settings.cardGroups).toBeUndefined();
});
it("deletes a grouping without deleting cards or their learning history", () => {
  const w = emptyWorkspace(),
    g = createCardGroup(w, "AI"),
    card = addReview(w, {
      front: "TEST Q",
      back: "TEST A",
      sourceType: "custom",
      groupId: g.id,
    });
  expect(() => createCardGroup(w, " ai ")).toThrow("already");
  removeCardGroup(w, g.id);
  expect(w.review[0].id).toBe(card.id);
  expect(w.review[0].schedule).toEqual(card.schedule);
  expect(w.review[0].groupId).toBeUndefined();
});
it("calendar weeks cross years and leap-year dots use stable date keys", () => {
  expect(calendarDays("2024-05-19", "year")).toHaveLength(366);
  expect(calendarDays("2025-05-19", "year")).toHaveLength(365);
  expect(calendarDays("2025-01-01", "week")).toEqual([
    "2024-12-30",
    "2024-12-31",
    "2025-01-01",
    "2025-01-02",
    "2025-01-03",
    "2025-01-04",
    "2025-01-05",
  ]);
  expect(calendarDays("2024-02-15", "month")).toContain("2024-02-29");
  expect(shiftPeriod("2025-01-31", "month", 1)).toBe("2025-02-01");
});
it("attachment scoping follows moved notes and deduplicates repeated references", () => {
  const w = emptyWorkspace(),
    root = createContainer(w, { title: "TEST ROOT" }),
    folder = createContainer(w, {
      title: "TEST CHILD",
      kind: "folder",
      parentId: root.id,
    }),
    other = createContainer(w, { title: "OTHER" }),
    asset = {
      id: uid(),
      filename: "image.png",
      key: "test",
      size: 1,
      hash: "test",
      mime: "image/png",
      createdAt: now(),
    };
  w.attachments.push(asset);
  const n = createNote(w, folder.id, {
    body: `![a](attachment:${asset.id})\n![b](attachment:${asset.id})`,
  });
  expect(scopedAttachments(w, root.id)).toHaveLength(1);
  expect(scopedAttachments(w, root.id)[0].notes).toHaveLength(1);
  moveItems(w, [n.id], other.id);
  expect(scopedAttachments(w, root.id)).toHaveLength(0);
  expect(scopedAttachments(w, other.id)[0].notes[0].id).toBe(n.id);
});
it("stable internal links survive rename and are excluded when the target is private", () => {
  const w = emptyWorkspace(),
    a = createNote(w),
    b = createNote(w, undefined, { title: "TEST target" });
  a.body = stableNoteLink(b.id, "Meaningful label");
  b.title = "Renamed";
  expect(resolveLink(b.id, "", w.notes)).toMatchObject({
    id: b.id,
    status: "resolved",
  });
  expect(prepareSnapshot(w, [a.id]).notes[0].body).not.toContain(b.id);
  const published = prepareSnapshot(w, [a.id, b.id]),
    copy = emptyWorkspace(),
    lineage = instantiateSnapshot(copy, published, uid());
  expect(
    copy.notes.find((n) => n.id === lineage.mapping[a.id])!.body,
  ).toContain("#note:" + lineage.mapping[b.id]);
});
it("exports stable links as portable paths and restores card group mappings", async () => {
  const w = emptyWorkspace(),
    a = createNote(w, undefined, { title: "TEST A" }),
    b = createNote(w, undefined, { title: "TEST A" }),
    group = createCardGroup(w, "AI");
  a.body = stableNoteLink(b.id, "Second");
  addReview(w, {
    front: "TEST Q",
    back: "TEST A",
    sourceType: "note",
    sourceId: a.id,
    groupId: group.id,
  });
  const progress: (number | undefined)[] = [];
  const bytes = await exportWorkspace(w, {
      full: true,
      onProgress: (n) => progress.push(n),
    }),
    files = unzipSync(bytes);
  expect(strFromU8(files["General/TEST A.md"])).toContain("TEST%20A%20(2).md");
  expect(progress).toContain(undefined);
  expect(progress.at(-1)).toBe(100);
  const plan = await prepareImport([
      new File([Uint8Array.from(bytes)], "test.zip"),
    ]),
    fresh = emptyWorkspace();
  commitImport(fresh, plan, general(fresh).id);
  expect(fresh.settings.cardGroups?.[0].title).toBe("AI");
  expect(fresh.review[0].groupId).toBe(fresh.settings.cardGroups![0].id);
  expect(fresh.notes[0].body).toContain(fresh.notes[1].id);
});
it("publication counts count real folders, unique identifiers, and selected author annotations", () => {
  const w = emptyWorkspace(),
    root = createContainer(w, { title: "Research" }),
    folder = createContainer(w, {
      title: "Nested",
      parentId: root.id,
      kind: "folder",
    }),
    a = createNote(w, folder.id),
    b = createNote(w, folder.id);
  const p = prepareSnapshot(w, [a.id, b.id], { category: "Science" });
  expect(publicationCounts(p)).toEqual({
    folders: 1,
    files: 2,
    sources: 0,
    annotations: 0,
  });
});

it("attachment browsing excludes filename prose, code samples, and ambiguous filenames", () => {
  const w = emptyWorkspace(),
    root = general(w),
    asset = {
      id: uid(),
      filename: "image.png",
      key: "test",
      size: 1,
      hash: "test",
      mime: "image/png",
      createdAt: now(),
    };
  w.attachments.push(asset);
  const n = createNote(w, root.id, {
    body: `A mention of image.png is not an attachment.\n\n\`![example](attachment:${asset.id})\`\n\n\`\`\`md\n![example](image.png)\n\`\`\``,
  });
  expect(scopedAttachments(w, root.id)).toHaveLength(0);
  n.body = "![real preview][figure]\n\n[figure]: image.png";
  expect(scopedAttachments(w, root.id)[0].notes[0].id).toBe(n.id);
  w.attachments.push({ ...asset, id: uid() });
  expect(scopedAttachments(w, root.id)).toHaveLength(0);
  n.body = `![[attachment:${asset.id}]]`;
  expect(scopedAttachments(w, root.id)).toHaveLength(1);
});
