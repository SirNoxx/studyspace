import { beforeAll, afterAll, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { emptyWorkspace, uid } from "../src/lib/model";
import { createNote } from "../src/lib/domain";
import {
  createTestDatabase,
  asDatabaseRole,
  applyMigrations,
} from "./helpers/database";

let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});

it("passes the same read-only verification used for hosted deployments", async () => {
  const sql = await readFile(
    new URL("../supabase/verify.sql", import.meta.url),
    "utf8",
  );
  await expect(db.exec(sql)).resolves.toBeDefined();
});

it("runs the hosted role smoke check without leaving synthetic accounts behind", async () => {
  const before = await db.query("select count(*)::int n from auth.users");
  const sql = await readFile(
    new URL("../supabase/checks/public-smoke.sql", import.meta.url),
    "utf8",
  );
  await expect(db.exec(sql)).resolves.toBeDefined();
  expect(
    (await db.query("select count(*)::int n from auth.users")).rows,
  ).toEqual(before.rows);
});

async function workspace() {
  const owner = uid(),
    state = emptyWorkspace();
  createNote(state, undefined, {
    title: "Private",
    body: "Owner's private text",
  });
  await db.query("insert into auth.users(id) values($1)", [owner]);
  await asDatabaseRole(db, "service_role", null, () =>
    db.query("select commit_workspace($1,0,$2)", [
      owner,
      JSON.stringify(state),
    ]),
  );
  return { owner, state };
}

async function publication(owner: string, allowQA = true) {
  const id = uid(),
    version = uid(),
    note = uid();
  const payload = {
    id: version,
    publicationId: id,
    version: 1,
    title: "Public",
    allowQA,
    notes: [{ id: note, body: "Selected public text" }],
  };
  await asDatabaseRole(db, "service_role", null, () =>
    db.query("select publish_snapshot($1,$2,null,$3,1)", [
      owner,
      id,
      JSON.stringify(payload),
    ]),
  );
  return { id, version, note, payload };
}

it("denies destructive default grants, including TRUNCATE outside RLS", async () => {
  for (const role of ["anon", "authenticated"] as const) {
    await asDatabaseRole(db, role, uid(), async () => {
      await expect(
        db.exec("truncate public.journal_templates"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.exec("create table public.forged(id int)"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.exec("select nextval('public.note_revisions_id_seq')"),
      ).rejects.toThrow("permission denied");
    });
  }
  const { rows } = await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and (
      not c.relrowsecurity or has_table_privilege('anon',c.oid,'TRUNCATE')
      or has_table_privilege('authenticated',c.oid,'TRUNCATE')
      or has_table_privilege('authenticated',c.oid,'INSERT')
      or has_table_privilege('authenticated',c.oid,'UPDATE'))
  `);
  expect(rows).toEqual([]);
});

it("makes future tables and functions opt-in rather than inheriting browser access", async () => {
  await db.exec(
    "create table public.future_private(id int); create function public.future_private_rpc() returns int language sql as $$select 1$$;",
  );
  try {
    for (const role of ["anon", "authenticated"] as const) {
      await asDatabaseRole(db, role, null, async () => {
        await expect(
          db.exec("select * from public.future_private"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.exec("select public.future_private_rpc()"),
        ).rejects.toThrow("permission denied");
      });
    }
  } finally {
    await db.exec(
      "drop function public.future_private_rpc(); drop table public.future_private;",
    );
  }
});

it("permits only explicitly checked community commands and RLS helpers, and blocks core bypasses", async () => {
  for (const role of ["anon", "authenticated"] as const) {
    const { rows } = await db.query<{ proname: string }>(
      `
      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and has_function_privilege($1,p.oid,'EXECUTE')
      order by p.proname
    `,
      [role],
    );
    expect(rows.map((r) => r.proname)).toEqual([
      "community_blocked",
      ...(role === "authenticated" ? ["community_command"] : []),
      "community_live",
      ...(role === "authenticated"
        ? ["community_moderator", "community_participant"]
        : []),
      "community_post_visible",
      "community_query",
      "community_visible",
      "is_moderator",
      "public_available",
      ...(role === "authenticated" ? ["shared_access"] : []),
    ]);
  }
  const { owner, state } = await workspace();
  await asDatabaseRole(db, "service_role", null, async () => {
    await expect(
      db.query("select commit_workspace_core($1,1,$2)", [
        owner,
        JSON.stringify(state),
      ]),
    ).rejects.toThrow("permission denied");
  });
});

it("does not expose moderator/suspension flags or unrelated private profiles", async () => {
  const a = await workspace(),
    b = await workspace();
  await asDatabaseRole(db, "authenticated", b.owner, async () => {
    expect(
      (await db.query("select id from profiles where id=$1", [a.owner])).rows,
    ).toEqual([]);
    await expect(
      db.query("select moderator,suspended from profiles where id=$1", [
        b.owner,
      ]),
    ).rejects.toThrow("permission denied");
  });
});

it("rejects null revisions and cross-owner attachment keys without changing saved data", async () => {
  const { owner, state } = await workspace();
  await expect(
    db.query("select commit_workspace($1,null,$2)", [
      owner,
      JSON.stringify(state),
    ]),
  ).rejects.toThrow("INVALID_WORKSPACE");
  const invalid = {
    ...state,
    attachments: [{ id: uid(), key: uid() + "/private.txt" }],
  };
  await expect(
    db.query("select commit_workspace($1,1,$2)", [
      owner,
      JSON.stringify(invalid),
    ]),
  ).rejects.toThrow("ASSET_OWNERSHIP");
  expect(
    (
      await db.query("select revision from workspaces where owner_id=$1", [
        owner,
      ])
    ).rows,
  ).toEqual([{ revision: 1 }]);
});

it("rejects malformed snapshots and publishing another account's container", async () => {
  const a = await workspace(),
    b = await workspace();
  const payload = { id: uid(), publicationId: uid(), version: 1, notes: [] };
  await expect(
    db.query("select publish_snapshot($1,$2,null,$3,null)", [
      a.owner,
      payload.publicationId,
      JSON.stringify(payload),
    ]),
  ).rejects.toThrow("INVALID_SNAPSHOT");
  await expect(
    db.query("select publish_snapshot($1,$2,$3,$4,1)", [
      a.owner,
      payload.publicationId,
      b.state.containers[0].id,
      JSON.stringify(payload),
    ]),
  ).rejects.toThrow("OWNERSHIP");
  await expect(
    db.query("select publish_snapshot($1,$2,null,$3,1)", [
      a.owner,
      payload.publicationId,
      JSON.stringify({ ...payload, publicationId: null }),
    ]),
  ).rejects.toThrow("INVALID_SNAPSHOT");
});

it("keeps published versions immutable and enforces thread/version ownership", async () => {
  const { owner } = await workspace();
  const a = await publication(owner),
    b = await publication(owner);
  await asDatabaseRole(db, "service_role", null, async () => {
    await expect(
      db.query(
        'update publication_versions set payload=payload||\'{"title":"Changed"}\' where id=$1',
        [a.version],
      ),
    ).rejects.toThrow("IMMUTABLE_VERSION");
    await expect(
      db.query(
        "insert into public_threads(publication_id,version_id,owner_id,note_id,anchor,body) values($1,$2,$3,$4,'{}','Question')",
        [a.id, b.version, owner, a.note],
      ),
    ).rejects.toThrow("thread_version_publication_fk");
  });
  await db.query("select publish_snapshot($1,$2,null,$3,1)", [
    owner,
    a.id,
    JSON.stringify(a.payload),
  ]);
  expect(
    (
      await db.query(
        "select count(*)::int n from publication_versions where publication_id=$1",
        [a.id],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
});

it("hides discussions and replies through REST roles when Q&A or publication visibility is disabled", async () => {
  const { owner } = await workspace(),
    p = await publication(owner),
    thread = uid();
  await db.query(
    "insert into public_threads(id,publication_id,version_id,owner_id,note_id,anchor,body) values($1,$2,$3,$4,$5,'{}','Question')",
    [thread, p.id, p.version, owner, p.note],
  );
  await db.query(
    "insert into thread_replies(thread_id,owner_id,body) values($1,$2,'Answer')",
    [thread, owner],
  );
  const visibleCount = () =>
    asDatabaseRole(db, "anon", null, async () => ({
      threads: (
        await db.query("select id from public_threads where id=$1", [thread])
      ).rows.length,
      replies: (
        await db.query("select id from thread_replies where thread_id=$1", [
          thread,
        ])
      ).rows.length,
    }));
  expect(await visibleCount()).toEqual({ threads: 1, replies: 1 });
  const second = { ...p.payload, id: uid(), version: 2, allowQA: false };
  await db.query("select publish_snapshot($1,$2,null,$3,1)", [
    owner,
    p.id,
    JSON.stringify(second),
  ]);
  expect(await visibleCount()).toEqual({ threads: 0, replies: 0 });
  await db.query("update publications set status='unpublished' where id=$1", [
    p.id,
  ]);
  expect(await visibleCount()).toEqual({ threads: 0, replies: 0 });
});

it("prevents suspended accounts from publishing templates or snapshots through server writes", async () => {
  const { owner } = await workspace();
  await db.query("update profiles set suspended=true where id=$1", [owner]);
  await asDatabaseRole(db, "service_role", null, async () => {
    await expect(
      db.query(
        "insert into journal_templates(owner_id,title,body,kind,author) values($1,'Template','Body','journal','Author')",
        [owner],
      ),
    ).rejects.toThrow("POSTING_SUSPENDED");
  });
  await expect(publication(owner)).rejects.toThrow("POSTING_SUSPENDED");
});

it("caps quota counters, isolates owners and buckets, and uses a consistent UTC day", async () => {
  const a = await workspace(),
    b = await workspace();
  const consume = (owner: string, bucket: string, limit: number | null) =>
    db.query<{ allowed: boolean }>("select consume_quota($1,$2,$3) allowed", [
      owner,
      bucket,
      limit,
    ]);
  await db.exec("set timezone='America/Los_Angeles'");
  try {
    for (let i = 0; i < 5; i++)
      expect((await consume(a.owner, "ai", 2)).rows[0].allowed).toBe(i < 2);
    expect((await consume(b.owner, "ai", 2)).rows[0].allowed).toBe(true);
    expect((await consume(a.owner, "metadata", 2)).rows[0].allowed).toBe(true);
    expect((await consume(a.owner, "ai", null)).rows[0].allowed).toBe(false);
    expect((await consume(a.owner, "invalid", 0)).rows[0].allowed).toBe(false);
    expect(
      (
        await db.query(
          "select used, window_start = (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') utc from rate_limits where owner_id=$1 and bucket='ai'",
          [a.owner],
        )
      ).rows,
    ).toEqual([{ used: 2, utc: true }]);
  } finally {
    await db.exec("set timezone='UTC'");
  }
});

it("finishes expired cancelled jobs without reclaiming a live lease", async () => {
  const { owner } = await workspace(),
    expired = uid(),
    live = uid();
  await db.query(
    "insert into jobs(id,owner_id,kind,payload,idempotency_key,status,worker_id,cancel_requested,lease_until) values($1::uuid,$3,'export','{}',($1::uuid)::text,'running','old',true,now()-interval '1 minute'),($2::uuid,$3,'export','{}',($2::uuid)::text,'running','live',true,now()+interval '1 hour')",
    [expired, live, owner],
  );
  await asDatabaseRole(db, "service_role", null, async () => {
    expect((await db.query("select * from claim_job('new')")).rows).toEqual([]);
  });
  expect(
    (await db.query("select status,worker_id from jobs where id=$1", [expired]))
      .rows,
  ).toEqual([{ status: "cancelled", worker_id: null }]);
  expect(
    (await db.query("select status,worker_id from jobs where id=$1", [live]))
      .rows,
  ).toEqual([{ status: "running", worker_id: "live" }]);
});

it("keeps publication asset bytes private even when a publication is public", async () => {
  const { owner } = await workspace(),
    p = await publication(owner);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('publication-assets',$1)",
    [p.id + "/" + p.version + "/file.pdf"],
  );
  for (const role of ["anon", "authenticated"] as const) {
    await asDatabaseRole(db, role, owner, async () => {
      expect(
        (
          await db.query(
            "select * from storage.objects where bucket_id='publication-assets'",
          )
        ).rows,
      ).toEqual([]);
    });
  }
});

it("upgrades an existing database without erasing notes or exposing templates", async () => {
  const cutoff = "202609090010_journal_templates.sql",
    old = await createTestDatabase(cutoff);
  try {
    const owner = uid(),
      state = emptyWorkspace();
    createNote(state, undefined, { body: "Preserve this existing note" });
    await old.query("insert into auth.users(id) values($1)", [owner]);
    await old.query("select commit_workspace($1,0,$2)", [
      owner,
      JSON.stringify(state),
    ]);
    expect(
      (
        await old.query(
          "select has_table_privilege('anon','public.journal_templates','TRUNCATE') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: true }]);
    await applyMigrations(old, cutoff);
    expect((await old.query("select body from notes")).rows).toEqual([
      { body: "Preserve this existing note" },
    ]);
    expect(
      (
        await old.query(
          "select has_table_privilege('anon','public.journal_templates','TRUNCATE') allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  } finally {
    await old.close();
  }
});
