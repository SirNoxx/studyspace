import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, asDatabaseRole } from "./helpers/database";
import * as Y from "yjs";
import {
  legacyWorkspace,
  writeWorkspace,
  readWorkspace,
  noteText,
  encode,
  patchText,
  repairSharedHierarchy,
  toBase64,
} from "../src/lib/shared/document";
let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});
async function user() {
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
    [id, id + "@example.invalid"],
  );
  await db.query("insert into profiles(id,display_name) values($1,'Tester')", [
    id,
  ]);
  return id;
}
it("merges concurrent typing, nested objects and replays without duplicate text", () => {
  const state = legacyWorkspace({
    collection: { id: randomUUID(), title: "Shared", created_at: "2026-01-01" },
    nodes: [
      {
        id: randomUUID(),
        kind: "note",
        title: "Note",
        body: "Start end",
        revision: 1,
      },
    ],
  });
  const seed = new Y.Doc();
  writeWorkspace(seed, state);
  const a = new Y.Doc(),
    b = new Y.Doc();
  Y.applyUpdate(a, encode(seed));
  Y.applyUpdate(b, encode(seed));
  noteText(a, state.notes[0].id).insert(6, "Alice ");
  noteText(b, state.notes[0].id).insert(6, "Bob ");
  const ua = encode(a),
    ub = encode(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
  Y.applyUpdate(b, ua);
  expect(readWorkspace(a).notes[0].body).toBe(readWorkspace(b).notes[0].body);
  expect(readWorkspace(a).notes[0].body).toContain("Alice ");
  expect(readWorkspace(a).notes[0].body).toContain("Bob ");
  const next = structuredClone(state);
  next.settings.bio = "Private biography";
  next.ai.push({ prompt: "private" } as never);
  writeWorkspace(a, next, state);
  expect(JSON.stringify(a.toJSON())).not.toContain("Private biography");
  expect(JSON.stringify(a.toJSON())).not.toContain("private");
  for (const doc of [seed, a, b]) doc.destroy();
});
it("seeds an existing shared collection identically on independent readers", () => {
  const data = { collection: { id: randomUUID(), title: "Shared" }, nodes: [] };
  const a = new Y.Doc(),
    b = new Y.Doc();
  a.clientID = b.clientID = 1;
  writeWorkspace(a, legacyWorkspace(data));
  writeWorkspace(b, legacyWorkspace(data));
  expect(toBase64(encode(a))).toBe(toBase64(encode(b)));
  a.destroy();
  b.destroy();
});
it("enforces membership, write roles, CAS, revocation, asset reads and legacy protection", async () => {
  const owner = await user(),
    editor = await user(),
    viewer = await user(),
    stranger = await user(),
    id = randomUUID();
  await db.query(
    "insert into shared_collections(id,owner_id,title) values($1,$2,'Shared')",
    [id, owner],
  );
  await db.query(
    "insert into shared_members(collection_id,user_id,role) values($1,$2,'editor'),($1,$3,'viewer')",
    [id, editor, viewer],
  );
  const commit = (actor: string, revision: number) =>
    asDatabaseRole(db, "service_role", null, () =>
      db.query("select shared_workspace_commit($1,$2,$3,'AA==','{}')", [
        id,
        actor,
        revision,
      ]),
    );
  await expect(
    asDatabaseRole(db, "authenticated", stranger, () =>
      db.query("select shared_workspace_read($1)", [id]),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    asDatabaseRole(db, "authenticated", owner, () =>
      db.query("select shared_workspace_commit($1,$2,0,'AA==','{}')", [
        id,
        owner,
      ]),
    ),
  ).rejects.toThrow("permission denied");
  await expect(commit(viewer, 0)).rejects.toThrow("ACCESS_DENIED");
  await commit(owner, 0);
  await commit(editor, 1);
  await expect(commit(owner, 1)).rejects.toThrow("REVISION_CONFLICT");
  await asDatabaseRole(db, "authenticated", viewer, async () => {
    expect(
      (await db.query("select * from shared_workspaces")).rows,
    ).toHaveLength(1);
    await expect(db.query("delete from shared_workspaces")).rejects.toThrow(
      "permission denied",
    );
  });
  await db.query("delete from shared_members where user_id=$1", [editor]);
  await expect(commit(editor, 2)).rejects.toThrow("ACCESS_DENIED");
  await expect(
    db.query(
      "insert into shared_nodes(id,collection_id,kind,title) values($1,$2,'note','Old client')",
      [randomUUID(), id],
    ),
  ).rejects.toThrow("updated shared workspace");
  await db.query(
    "insert into shared_workspace_assets(id,collection_id,filename,mime,key,size,hash) values($1,$2,'test.txt','text/plain','test',4,'hash')",
    [randomUUID(), id],
  );
  await asDatabaseRole(db, "authenticated", stranger, async () =>
    expect(
      (await db.query("select * from shared_workspace_assets")).rows,
    ).toHaveLength(0),
  );
  await asDatabaseRole(db, "authenticated", viewer, async () =>
    expect(
      (await db.query("select * from shared_workspace_assets")).rows,
    ).toHaveLength(1),
  );
  await db.query("delete from auth.users where id=$1", [owner]);
  expect(
    (
      await db.query("select * from shared_workspaces where collection_id=$1", [
        id,
      ])
    ).rows,
  ).toHaveLength(0);
});

it("initialization rejects stale seeds and checkpoint history stays permission-scoped", async () => {
  const owner = await user(),
    viewer = await user(),
    outsider = await user(),
    id = randomUUID(),
    note = randomUUID();
  await db.query(
    "insert into shared_collections(id,owner_id,title) values($1,$2,'Original')",
    [id, owner],
  );
  await db.query(
    "insert into shared_members(collection_id,user_id,role) values($1,$2,'viewer')",
    [id, viewer],
  );
  await db.query(
    "insert into shared_nodes(id,collection_id,kind,title,body) values($1,$2,'note','Note','Original body')",
    [note, id],
  );
  const read = await asDatabaseRole(db, "authenticated", viewer, () =>
    db.query<{ value: any }>("select shared_workspace_read($1) value", [id]),
  );
  expect(read.rows[0].value.legacy.nodes[0].body).toBe("Original body");
  const old = read.rows[0].value.collection.revision;
  await db.query(
    "update shared_collections set revision=revision+1 where id=$1",
    [id],
  );
  const initialize = (revision: number) =>
    asDatabaseRole(db, "service_role", null, () =>
      db.query<{ ok: boolean }>(
        "select shared_workspace_initialize($1,$2,$3,'AA==',$4) ok",
        [
          id,
          viewer,
          revision,
          { notes: [{ id: note, title: "Note", body: "Updated body" }] },
        ],
      ),
    );
  expect((await initialize(old)).rows[0].ok).toBe(false);
  expect((await initialize(old + 1)).rows[0].ok).toBe(true);
  expect((await initialize(old + 1)).rows[0].ok).toBe(false);
  await expect(
    asDatabaseRole(db, "authenticated", viewer, () =>
      db.query("select shared_workspace_initialize($1,$2,$3,'AA==','{}')", [
        id,
        viewer,
        old,
      ]),
    ),
  ).rejects.toThrow("permission denied");
  await asDatabaseRole(db, "service_role", null, () =>
    db.query("select shared_workspace_commit($1,$2,1,'AA==','{}')", [
      id,
      owner,
    ]),
  );
  const history = await asDatabaseRole(db, "authenticated", viewer, () =>
    db.query<{ items: any[] }>("select shared_workspace_history($1,$2) items", [
      id,
      note,
    ]),
  );
  expect(history.rows[0].items[0].body).toBe("Updated body");
  await expect(
    asDatabaseRole(db, "authenticated", outsider, () =>
      db.query("select shared_workspace_history($1,$2)", [id, note]),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
});

it("merges opposing folder moves without dropping files or creating a cycle", () => {
  const id = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    note = randomUUID();
  const before = legacyWorkspace({
    collection: { id, title: "Shared" },
    nodes: [
      { id: a, kind: "folder", title: "A" },
      { id: b, kind: "folder", title: "B" },
      {
        id: note,
        kind: "note",
        title: "Note",
        body: "Keep all text",
        parent_id: a,
      },
    ],
  });
  const doc = new Y.Doc();
  writeWorkspace(doc, before);
  doc.getMap<Y.Map<unknown>>("containers").get(a)!.set("parentId", b);
  doc.getMap<Y.Map<unknown>>("containers").get(b)!.set("parentId", a);
  expect(repairSharedHierarchy(doc, before)).toBe(true);
  const merged = readWorkspace(doc);
  expect(merged.notes[0].body).toBe("Keep all text");
  expect(
    merged.containers.find((c) => c.id === a)!.parentId === b &&
      merged.containers.find((c) => c.id === b)!.parentId === a,
  ).toBe(false);
  doc.destroy();
});
