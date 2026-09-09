import { it, expect } from "vitest";
import { emptyWorkspace, uid, now, general } from "../src/lib/model";
import { conceptMatcher } from "../src/lib/markdown";
it("measures 10,000-note filtering and 3,000-term indexed lookup", () => {
  const w = emptyWorkspace(),
    at = now(),
    containerId = general(w).id;
  for (let i = 0; i < 10000; i++)
    w.notes.push({
      id: uid(),
      containerId,
      title: "Test research " + i,
      body: "A representative research note about algorithm " + i,
      kind: "note",
      revision: 1,
      createdAt: at,
      updatedAt: at,
      history: [],
      tags: [],
    });
  const defs = Array.from({ length: 3000 }, (_, i) => ({
    id: uid(),
    term: "Research term " + i,
    definition: "Definition " + i,
    aliases: [],
    subjectIds: [containerId],
    createdAt: at,
    updatedAt: at,
  }));
  const start = performance.now();
  const matcher = conceptMatcher(defs);
  const build = performance.now() - start;
  const t = performance.now();
  const found = matcher(
    "Use Research term 2999 and Research term 12 to connect ideas.",
  );
  const matching = performance.now() - t;
  const s = performance.now();
  const notes = w.notes.filter((n) =>
    (n.title + " " + n.body).includes("algorithm 999"),
  );
  const search = performance.now() - s;
  console.log(
    JSON.stringify({
      measurement: "local-node",
      notes: 10000,
      terms: 3000,
      trieBuildMs: build,
      lookupMs: matching,
      filterMs: search,
    }),
  );
  expect(found).toHaveLength(2);
  expect(notes.length).toBeGreaterThan(0);
  expect(matching).toBeLessThan(100);
  expect(search).toBeLessThan(500);
});
