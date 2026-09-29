import { beforeAll, afterAll, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, asDatabaseRole } from "./helpers/database";
import { blankWorkbook } from "../src/lib/spreadsheets/model";
import { mergeWorkbook } from "../src/lib/spreadsheets/concurrency";
import {
  sharedWorkbookContent,
  workbookView,
} from "../src/lib/spreadsheets/shared-view";
let db: PGlite;
it("keeps collapsed groups personal while preserving manual hiding and cell data", () => {
  const snapshot = blankWorkbook(crypto.randomUUID()),
    sheet = snapshot.sheets["sheet-1"];
  sheet.rowData = {
    1: { hd: 0, custom: { studyspaceId: "r1" } },
    2: { hd: 1, custom: { studyspaceId: "r2", studyspaceManualHidden: true } },
  };
  sheet.cellData = { 1: { 0: { v: "Kept" } } };
  sheet.custom = {
    studyspace: {
      groups: [
        {
          id: "g1",
          name: "Group",
          axis: "row",
          members: ["r1", "r2"],
          collapsed: false,
        },
      ],
    },
  };
  const personal = workbookView(snapshot, { g1: true });
  expect(personal.sheets["sheet-1"].rowData[1].hd).toBe(1);
  const canonical = sharedWorkbookContent(personal);
  expect(canonical.sheets["sheet-1"].rowData[1].hd).toBe(0);
  expect(canonical.sheets["sheet-1"].rowData[2].hd).toBe(1);
  expect(canonical.sheets["sheet-1"].cellData[1][0].v).toBe("Kept");
});
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});
it("merges independent cell edits and preserves same-cell conflicts rather than choosing a winner", () => {
  const base = blankWorkbook(crypto.randomUUID()),
    a = structuredClone(base),
    b = structuredClone(base);
  a.sheets["sheet-1"].cellData = { 0: { 0: { v: "Alice" } } };
  b.sheets["sheet-1"].cellData = { 1: { 1: { v: "Bob" } } };
  const result = mergeWorkbook(base, a, b);
  expect(result.sheets["sheet-1"].cellData[0][0].v).toBe("Alice");
  expect(result.sheets["sheet-1"].cellData[1][1].v).toBe("Bob");
  b.sheets["sheet-1"].cellData = { 0: { 0: { v: "Different" } } };
  expect(() => mergeWorkbook(base, a, b)).toThrow("Concurrent changes");
  expect(b.sheets["sheet-1"].cellData[0][0].v).toBe("Different");
  a.sheets["sheet-1"].rowCount++;
  expect(() => mergeWorkbook(base, a, b)).toThrow("structure changed");
});
it("ignores cached formula result differences while merging source edits", () => {
  const base = blankWorkbook(crypto.randomUUID());
  base.sheets["sheet-1"].cellData = { 0: { 0: { f: "=SUM(B1:B2)", v: 3 } } };
  const a = structuredClone(base),
    b = structuredClone(base);
  a.sheets["sheet-1"].cellData[0][0].v = 4;
  b.sheets["sheet-1"].cellData[0][0].v = 5;
  expect(mergeWorkbook(base, a, b).sheets["sheet-1"].cellData[0][0].v).toBe(5);
});
it("enforces roles, private reads, idempotency, revision checks and revocation in SQL", async () => {
  const ids = Array.from({ length: 4 }, () => crypto.randomUUID()),
    [owner, editor, viewer, stranger] = ids,
    collection = crypto.randomUUID(),
    note = crypto.randomUUID(),
    id = crypto.randomUUID();
  for (const user of ids) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, `${user}@example.invalid`],
    );
    await db.query("insert into profiles(id,display_name) values($1,'Test')", [
      user,
    ]);
  }
  await db.query(
    "insert into shared_collections(id,owner_id,title) values($1,$2,'Workbook study')",
    [collection, owner],
  );
  await db.query(
    "insert into shared_members(collection_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')",
    [collection, editor, viewer],
  );
  await db.query(
    "insert into shared_workspaces(collection_id,state,snapshot) values($1,'AA==',$2)",
    [collection, JSON.stringify({ notes: [{ id: note, trashed: false }] })],
  );
  const snapshot = blankWorkbook(id);
  const commit = (
    actor: string,
    revision: number,
    request = crypto.randomUUID(),
  ) =>
    asDatabaseRole(db, "service_role", null, () =>
      db.query(
        "select shared_spreadsheet_commit($1,$2,$3,$4,$5,$6,$7) revision",
        [id, collection, note, actor, revision, request, snapshot],
      ),
    );
  await expect(commit(viewer, 0)).rejects.toThrow("ACCESS_DENIED");
  await expect(commit(stranger, 0)).rejects.toThrow("ACCESS_DENIED");
  const request = crypto.randomUUID();
  await commit(owner, 0, request);
  expect((await commit(owner, 0, request)).rows).toEqual([{ revision: 1 }]);
  await commit(editor, 1);
  await expect(commit(owner, 1)).rejects.toThrow("REVISION_CONFLICT");
  expect(
    (
      await asDatabaseRole(db, "authenticated", stranger, () =>
        db.query("select * from shared_spreadsheets"),
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await asDatabaseRole(db, "authenticated", viewer, () =>
        db.query("select * from shared_spreadsheets"),
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    asDatabaseRole(db, "authenticated", owner, () =>
      db.query("update shared_spreadsheets set revision=99"),
    ),
  ).rejects.toThrow("permission denied");
  await db.query(
    "delete from shared_members where collection_id=$1 and user_id=$2",
    [collection, editor],
  );
  await expect(commit(editor, 2)).rejects.toThrow("ACCESS_DENIED");
  expect(
    (
      await asDatabaseRole(db, "authenticated", editor, () =>
        db.query("select * from shared_spreadsheet_versions"),
      )
    ).rows,
  ).toEqual([]);
});
