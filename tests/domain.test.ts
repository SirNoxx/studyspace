import { describe, it, expect } from "vitest";
import {
  emptyWorkspace,
  general,
  uid,
  now,
  localDate,
  contextDefinitions,
  type PublicNote,
} from "../src/lib/model";
import {
  createContainer,
  createNote,
  saveNote,
  moveItems,
  trashItems,
  captureJournal,
  gradeReview,
  addReview,
  prepareSnapshot,
  diffNote,
  nextSchedule,
  newSchedule,
} from "../src/lib/domain";
import {
  conceptMatches,
  identifySource,
  captureLinks,
  validISBN,
  publicMarkdown,
  resolveLink,
} from "../src/lib/markdown";
import {
  safePath,
  prepareImport,
  commitImport,
  exportWorkspace,
} from "../src/lib/transfer";
import { zipSync, strToU8, unzipSync } from "fflate";
import { buildAIContext, validateAIReferences } from "../src/lib/server/ai";
import { publicAddress } from "../src/lib/server/fetch";
import {
  crossrefMetadata,
  arxivMetadata,
  bookMetadata,
} from "../src/lib/server/metadata";
describe("organization and saves", () => {
  it("creates one protected General and preserves stable IDs across moves", () => {
    const w = emptyWorkspace();
    expect(w.containers).toHaveLength(1);
    const n = createNote(w);
    const c = createContainer(w, { title: "Coding" });
    moveItems(w, [n.id], c.id);
    expect(w.notes[0].id).toBe(n.id);
    expect(() => trashItems(w, [general(w).id])).toThrow("General");
  });
  it("rejects cycles without accepting descendant moves", () => {
    const w = emptyWorkspace();
    const c = createContainer(w, { title: "College" });
    const a = createContainer(w, { title: "Algebra", parentId: c.id });
    expect(() => moveItems(w, [c.id], a.id)).toThrow("descendants");
    expect(c.parentId).toBe(null);
  });
  it("rejects stale writes and keeps meaningful history", () => {
    const w = emptyWorkspace();
    const n = createNote(w, undefined, { body: "old" });
    saveNote(w, n.id, 1, { title: "New", body: "new" });
    expect(() => saveNote(w, n.id, 1, { body: "lost" })).toThrow(
      "another session",
    );
    expect(n.body).toBe("new");
    expect(n.history[0].body).toBe("old");
  });
  it("deduplicates daily journal and keeps extra entries and dreams independent", () => {
    const w = emptyWorkspace();
    const a = captureJournal(w, "journal", "2026-03-08");
    expect(captureJournal(w, "journal", "2026-03-08").id).toBe(a.id);
    expect(captureJournal(w, "journal", "2026-03-08", true).id).not.toBe(a.id);
    expect(captureJournal(w, "dream", "2026-03-08").id).not.toBe(
      captureJournal(w, "dream", "2026-03-08").id,
    );
    expect(
      localDate("America/Los_Angeles", new Date("2026-03-08T07:59:00Z")),
    ).toBe("2026-03-07");
  });
});
describe("dictionary and sources", () => {
  const definition = (term: string) => ({
    id: uid(),
    term,
    definition: "Test",
    aliases: [],
    subjectIds: [],
    createdAt: now(),
    updatedAt: now(),
  });
  it("matches longest exact phrases, with Unicode boundaries and code exclusion", () => {
    const defs = [
      definition("Tool"),
      definition("Tool calling"),
      definition("café"),
    ];
    const body =
      "Tool calling and Toolkits. café cafés.\n\n`Tool calling`\n\n```js\nTool calling\n```\n\n[Tool calling](https://example.com)";
    const hits = conceptMatches(body, defs);
    expect(hits.map((h) => body.slice(h.from, h.to))).toEqual([
      "Tool calling",
      "café",
    ]);
  });
  it("uses nearest subject meaning before parent", () => {
    const w = emptyWorkspace(),
      root = createContainer(w, { title: "Root" }),
      child = createContainer(w, { title: "Child", parentId: root.id });
    w.definitions.push(
      { ...definition("Term"), subjectIds: [root.id], definition: "Parent" },
      { ...definition("Term"), subjectIds: [child.id], definition: "Child" },
    );
    expect(contextDefinitions(w, child.id)[0].definition).toBe("Child");
  });
  it("captures prose links while excluding code, images and infrastructure", () => {
    expect(
      captureLinks(
        "https://example.com\n`https://hidden.test`\n![x](https://image.test/a.png)\n[x](https://source.test)",
      ),
    ).toEqual(["https://example.com", "https://source.test"]);
  });
  it("normalizes bibliographic identity without dropping signed parameters", () => {
    expect(identifySource("DOI:10.1000/ABC")?.canonical).toBe(
      "https://doi.org/10.1000/abc",
    );
    expect(
      identifySource("https://arxiv.org/abs/2303.08774v2")?.canonical,
    ).toContain("v2");
    expect(
      identifySource("https://example.com/a?utm_source=x&q=y#part")?.canonical,
    ).toBe("https://example.com/a?q=y");
    expect(
      identifySource("https://example.com/a?token=x&utm_source=y")?.canonical,
    ).toContain("utm_source");
  });
  it("validates ISBN checksum and provider missing fields", () => {
    expect(validISBN("978-0-306-40615-7")).toBe(true);
    expect(validISBN("9780306406158")).toBe(false);
    expect(
      crossrefMetadata({
        message: { title: ["A"], author: [{ given: "A", family: "B" }] },
      }),
    ).toMatchObject({ title: "A", authors: ["A B"] });
    expect(
      crossrefMetadata({ message: { title: ["A"] } }).description,
    ).toBeUndefined();
    expect(bookMetadata({}, "ISBN:1").status).toBe("partial");
    expect(
      arxivMetadata(
        "<feed><entry><title> Test title </title><author><name>Researcher</name></author><id>https://arxiv.org/abs/1v2</id><summary>Summary</summary></entry></feed>",
      ),
    ).toMatchObject({ title: "Test title", authors: ["Researcher"] });
  });
});
describe("privacy and source boundaries", () => {
  it("strips private frontmatter, comments, attachments, and excluded links from public payload", () => {
    const raw =
      '---\npassword: SECRET\n---\nVisible\n%%HIDDEN%%\n[[Private|leaking title]]\n![secret](attachment:123)\n<a onclick="evil()">tag</a>';
    const safe = publicMarkdown(raw, new Set(), new Set());
    expect(safe).not.toMatch(/SECRET|HIDDEN|leaking title|onclick|attachment:/);
    expect(safe).toContain("Visible");
  });
  it("snapshots are independent of later draft edits", () => {
    const w = emptyWorkspace(),
      n = createNote(w, undefined, { body: "first", title: "A" });
    const snapshot = prepareSnapshot(w, [n.id]);
    saveNote(w, n.id, n.revision, { body: "second" });
    expect(snapshot.notes[0].body).toBe("first");
    expect(snapshot.allowCopies).toBe(false);
  });
  it("blocks private, loopback, link-local, multicast and mapped IP destinations", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.0.2",
      "172.16.1.1",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
      "224.0.0.1",
    ])
      expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress("1.1.1.1")).toBe(true);
  });
  it("scopes AI context and excludes journal even when related to the same collection", () => {
    const w = emptyWorkspace(),
      n = createNote(w, undefined, { body: "Authorized evidence" });
    captureJournal(w, "journal");
    const context = buildAIContext(w, {
      action: "summarize",
      scope: "subject",
      noteId: n.id,
      expectedRevision: 1,
    });
    expect(context.passages).toHaveLength(1);
    expect(() =>
      buildAIContext(w, {
        action: "summarize",
        scope: "note",
        noteId: uid(),
        expectedRevision: 1,
      }),
    ).toThrow("unavailable");
    expect(
      validateAIReferences("[ref:invented]", context.allowedIds),
    ).toContain("unavailable");
  });
});
describe("review and merges", () => {
  it("grades exactly once for a retried event and permits undo", () => {
    const w = emptyWorkspace(),
      r = addReview(w, { front: "Q", back: "A", sourceType: "custom" }),
      id = uid();
    gradeReview(w, r.id, "good", id, "2026-01-01T00:00:00Z");
    gradeReview(w, r.id, "easy", id, "2026-01-01T00:00:00Z");
    expect(r.schedule.repetitions).toBe(1);
    expect(r.schedule.due).toBe("2026-01-04T00:00:00.000Z");
    expect(r.events[0].before.state).toBe("new");
  });
  it("uses deterministic Again, Hard, Good, Easy intervals", () => {
    const s = newSchedule("2026-01-01T00:00:00Z");
    expect(nextSchedule(s, "again", "2026-01-01T00:00:00Z").due).toBe(
      "2026-01-01T00:10:00.000Z",
    );
    expect(
      ["hard", "good", "easy"].map(
        (g) => nextSchedule(s, g as any, "2026-01-01T00:00:00Z").interval,
      ),
    ).toEqual([1, 3, 7]);
  });
  const n = (body: string): PublicNote => ({
    id: "test",
    title: "Test",
    body,
    path: "Test",
    revision: 1,
  });
  it("merges disjoint edits and refuses overlapping conflicts", () => {
    const base = n("one\ntwo\nthree\nfour\n");
    expect(
      diffNote(
        base,
        n("ONE\ntwo\nthree\nfour\n"),
        n("one\ntwo\nthree\nFOUR\n"),
      ),
    ).toMatchObject({
      status: "safe",
      result: { body: "ONE\ntwo\nthree\nFOUR\n" },
    });
    expect(diffNote(base, n("mine\n"), n("theirs\n")).status).toBe("conflict");
    expect(diffNote(base, n("local edit"), null).status).toBe("conflict");
  });
});
describe("portable import and export", () => {
  it("rejects traversal and encrypted/unsafe archives", async () => {
    expect(() => safePath("../../secret")).toThrow("Unsafe");
    expect(() => safePath("C:\\secret")).toThrow("Unsafe");
    const zip = zipSync({ "../bad.md": strToU8("bad") });
    await expect(
      prepareImport([new File([Uint8Array.from(zip)], "bad.zip")]),
    ).rejects.toThrow("Unsafe");
  });
  it("imports Unicode markdown and skips exact reimports without touching syntax", async () => {
    const body =
      "---\naliases: [保留]\n---\n# Café\n\n```dataviewjs\nalert(1)\n```";
    const plan = await prepareImport([new File([body], "Café.md")]);
    const w = emptyWorkspace();
    expect(commitImport(w, plan, general(w).id).imported).toBe(1);
    expect(commitImport(w, plan, general(w).id).skipped).toBe(1);
    expect(w.notes[0].body).toBe(body);
    const zip = await exportWorkspace(w, { full: true });
    const unpacked = unzipSync(zip);
    expect(new TextDecoder().decode(unpacked["General/Café.md"])).toBe(body);
    expect(unpacked["studyspace-manifest.json"]).toBeDefined();
  });
  it("does not guess ambiguous duplicate basenames", () => {
    const notes = [
      { id: "a", title: "Introduction", originalPath: "One/Introduction.md" },
      { id: "b", title: "Introduction", originalPath: "Two/Introduction.md" },
    ];
    expect(resolveLink("Introduction", "Root.md", notes).status).toBe(
      "ambiguous",
    );
    expect(resolveLink("One/Introduction", "Root.md", notes).id).toBe("a");
  });
});
