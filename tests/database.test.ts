import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./helpers/database";
import { emptyWorkspace, uid } from "../src/lib/model";
import { createNote } from "../src/lib/domain";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  M = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
  await db.query("insert into auth.users(id) values($1),($2),($3),($4)", [
    A,
    B,
    C,
    M,
  ]);
});
afterAll(async () => {
  await db?.close();
});
async function asUser(id: string | null, fn: () => Promise<void>) {
  await db.exec("set role " + (id ? "authenticated" : "anon"));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  try {
    await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
describe("PostgreSQL migrations, transactions and direct RLS", () => {
  it("exposes only visible journal templates and reserves removal for their owner", async () => {
    const visible = uid(),
      hidden = uid();
    await db.query(
      "insert into journal_templates(id,owner_id,title,body,kind,author,hidden) values($1,$3,'Reflection','## Prompts','journal','Author',false),($2,$3,'Hidden','Private moderation','journal','Author',true)",
      [visible, hidden, A],
    );
    await asUser(null, async () => {
      expect(
        (await db.query("select title from journal_templates")).rows,
      ).toEqual([{ title: "Reflection" }]);
      await expect(
        db.query(
          "insert into journal_templates(owner_id,title,body,kind,author) values($1,'Bypass','Body','journal','Fake')",
          [B],
        ),
      ).rejects.toThrow("permission denied");
    });
    await asUser(B, async () => {
      await db.query("delete from journal_templates where id=$1", [visible]);
      expect((await db.query("select id from journal_templates")).rows).toEqual(
        [{ id: visible }],
      );
    });
    await asUser(A, async () => {
      expect(
        (await db.query("select id from journal_templates")).rows,
      ).toHaveLength(2);
      await db.query("delete from journal_templates where id=$1", [visible]);
    });
    expect(
      (
        await db.query("select id from journal_templates where id=$1", [
          visible,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("commits a workspace and rejects stale concurrency and duplicate General", async () => {
    const w = emptyWorkspace();
    createNote(w, undefined, {
      title: "PRIVATE TEST A",
      body: "SECRET TEST BODY",
    });
    await db.query("select commit_workspace($1,0,$2)", [A, JSON.stringify(w)]);
    await expect(
      db.query("select commit_workspace($1,0,$2)", [A, JSON.stringify(w)]),
    ).rejects.toThrow("REVISION_CONFLICT");
    const generalRows = await db.query(
      "select count(*)::int n from containers where owner_id=$1 and system_key=$2",
      [A, "general"],
    );
    expect(generalRows.rows[0]).toEqual({ n: 1 });
  });
  it("allows owner reads but hides private data from unrelated/anonymous readers", async () => {
    await asUser(A, async () => {
      const r = await db.query("select title from notes");
      expect(r.rows).toEqual([{ title: "PRIVATE TEST A" }]);
    });
    for (const id of [B, C])
      await asUser(id, async () => {
        expect((await db.query("select * from notes")).rows).toEqual([]);
        expect((await db.query("select * from personal_records")).rows).toEqual(
          [],
        );
      });
    await asUser(null, async () => {
      await expect(db.query("select * from notes")).rejects.toThrow(
        "permission denied",
      );
    });
  });
  it("rejects direct mutation, service-function calls, and moderator impersonation", async () => {
    await asUser(B, async () => {
      await expect(
        db.query("insert into profiles(id,moderator) values($1,true)", [B]),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select commit_workspace($1,0,$2)", [B, "{}"]),
      ).rejects.toThrow("permission denied");
      expect((await db.query("select is_moderator() yes")).rows[0]).toEqual({
        yes: false,
      });
    });
  });
  it("enforces cross-owner container references in the actual database", async () => {
    const w = emptyWorkspace();
    await db.query("select commit_workspace($1,0,$2)", [B, JSON.stringify(w)]);
    const container = (
      await db.query("select id from containers where owner_id=$1", [A])
    ).rows[0] as { id: string };
    await expect(
      db.query(
        "insert into notes(id,owner_id,container_id,revision,title,body,data) values($1,$2,$3,1,$4,$5,$6)",
        [uid(), B, container.id, "bad", "bad", "{}"],
      ),
    ).rejects.toThrow("foreign key");
  });
  it("supports a real server-assigned moderator role", async () => {
    await db.query("insert into profiles(id,moderator) values($1,true)", [M]);
    await asUser(M, async () => {
      expect((await db.query("select is_moderator() yes")).rows[0]).toEqual({
        yes: true,
      });
      expect((await db.query("select * from notes")).rows).toEqual([]);
    });
  });
  it("leases jobs and safely reclaims expired work after a worker crash", async () => {
    const id = uid();
    await db.query(
      "insert into jobs(id,owner_id,kind,payload,idempotency_key) values($1,$2,$3,$4,$5)",
      [id, A, "metadata", "{}", "test-job"],
    );
    const first = await db.query("select * from claim_job($1)", ["worker-a"]);
    expect((first.rows[0] as any).attempts).toBe(1);
    expect(
      (await db.query("select * from claim_job($1)", ["worker-b"])).rows,
    ).toHaveLength(0);
    await db.query(
      "update jobs set lease_until=now()-interval '1 minute' where id=$1",
      [id],
    );
    const retry = await db.query("select * from claim_job($1)", ["worker-b"]);
    expect((retry.rows[0] as any).attempts).toBe(2);
    expect((retry.rows[0] as any).worker_id).toBe("worker-b");
  });
  it("atomically publishes immutable versions and unpublish revokes anonymous reads", async () => {
    const publicationId = uid(),
      versionId = uid();
    const payload = {
      id: versionId,
      publicationId,
      version: 1,
      title: "PUBLIC TEST",
      notes: [{ body: "PUBLIC ONLY" }],
    };
    await db.query("select publish_snapshot($1,$2,null,$3,1)", [
      A,
      publicationId,
      JSON.stringify(payload),
    ]);
    await asUser(null, async () => {
      const r = await db.query("select payload from publication_versions");
      expect(r.rows).toEqual([{ payload }]);
    });
    await expect(
      db.query("select publish_snapshot($1,$2,null,$3,0)", [
        A,
        publicationId,
        JSON.stringify({ ...payload, id: uid(), version: 2 }),
      ]),
    ).rejects.toThrow("REVISION_CONFLICT");
    expect(
      (
        await db.query("select current_version from publications where id=$1", [
          publicationId,
        ])
      ).rows[0],
    ).toEqual({ current_version: versionId });
    await db.query("update publications set status='unpublished' where id=$1", [
      publicationId,
    ]);
    await asUser(null, async () => {
      expect(
        (await db.query("select payload from publication_versions")).rows,
      ).toHaveLength(0);
    });
  });
  it("applies moderation atomically and records the authorized actor", async () => {
    const id = (await db.query("select id from publications limit 1"))
      .rows[0] as { id: string };
    await expect(
      db.query("select moderate_publication($1,$2,$3,null)", [
        B,
        id.id,
        "hide",
      ]),
    ).rejects.toThrow("FORBIDDEN");
    await db.query("select moderate_publication($1,$2,$3,null)", [
      M,
      id.id,
      "hide",
    ]);
    expect(
      (await db.query("select hidden from publications where id=$1", [id.id]))
        .rows[0],
    ).toEqual({ hidden: true });
    await db.query("select moderate_publication($1,$2,$3,null)", [
      M,
      id.id,
      "restore",
    ]);
    expect(
      (
        await db.query(
          "select action from moderation_actions order by created_at",
        )
      ).rows,
    ).toEqual([{ action: "hide" }, { action: "restore" }]);
  });
  it("enforces storage paths for direct owner and unrelated-user calls", async () => {
    await asUser(A, async () => {
      await db.query(
        "insert into storage.objects(bucket_id,name) values('attachments',$1)",
        [A + "/fixture/test.pdf"],
      );
      expect(
        (await db.query("select name from storage.objects")).rows,
      ).toHaveLength(1);
    });
    await asUser(B, async () => {
      expect(
        (await db.query("select name from storage.objects")).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "insert into storage.objects(bucket_id,name) values('attachments',$1)",
          [A + "/forged.pdf"],
        ),
      ).rejects.toThrow("row-level security");
    });
  });
  it("indexes owner-scoped search and denies browser access to its service RPC", async () => {
    expect(
      (
        await db.query(
          "select search_workspace($1,'SECRET',null,array[]::text[],null,null) item",
          [A],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select search_workspace($1,'SECRET',null,array[]::text[],null,null) item",
          [B],
        )
      ).rows,
    ).toHaveLength(0);
    await asUser(B, async () => {
      await expect(
        db.query(
          "select search_workspace($1,'SECRET',null,array[]::text[],null,null)",
          [A],
        ),
      ).rejects.toThrow("permission denied");
    });
  });
  it("protects referenced objects and rejects commits that resurrect garbage-collected keys", async () => {
    const w = emptyWorkspace(),
      key = B + "/staged/TEST.txt";
    const saved = (await db.query("select read_workspace($1) state", [B]))
      .rows[0] as any;
    w.containers = saved.state.containers;
    w.attachments.push({
      id: uid(),
      key,
      filename: "TEST.txt",
      mime: "text/plain",
      size: 4,
      hash: "test",
      createdAt: new Date().toISOString(),
    });
    await db.query("select commit_workspace($1,1,$2)", [B, JSON.stringify(w)]);
    expect(
      (
        await db.query("select claim_orphan_object('attachments',$1) claimed", [
          key,
        ])
      ).rows[0],
    ).toEqual({ claimed: false });
    const removed = structuredClone(w);
    removed.attachments = [];
    await db.query("select commit_workspace($1,2,$2)", [
      B,
      JSON.stringify(removed),
    ]);
    expect(
      (
        await db.query("select claim_orphan_object('attachments',$1) claimed", [
          key,
        ])
      ).rows[0],
    ).toEqual({ claimed: true });
    await expect(
      db.query("select commit_workspace($1,3,$2)", [B, JSON.stringify(w)]),
    ).rejects.toThrow("STAGED_OBJECT_EXPIRED");
    await asUser(B, async () => {
      await expect(
        db.query("select claim_orphan_object('attachments',$1)", [key]),
      ).rejects.toThrow("permission denied");
    });
  });
  it("reads a consistent aggregate and restores actual PostgreSQL data to a new isolated engine", async () => {
    const before = (await db.query("select read_workspace($1) state", [A]))
      .rows[0];
    expect((before as any).state.notes).toHaveLength(1);
    await asUser(B, async () => {
      await expect(db.query("select read_workspace($1)", [A])).rejects.toThrow(
        "permission denied",
      );
    });
    const dump = await db.dumpDataDir();
    const restored = new PGlite({ loadDataDir: dump });
    try {
      expect(
        (await restored.query("select read_workspace($1) state", [A])).rows[0],
      ).toEqual(before);
      expect(
        (await restored.query("select name from storage.objects")).rows,
      ).toHaveLength(1);
    } finally {
      await restored.close();
    }
  });
  it("ranks only visible publications by real aggregate study copies without exposing owners", async () => {
    const publication = (await db.query("select id from publications limit 1"))
      .rows[0] as any;
    await db.query(
      "update publications set status='published',hidden=false where id=$1",
      [publication.id],
    );
    await db.query(
      "insert into personal_records(id,owner_id,kind,data) values($1,$2,'copies',$3)",
      [
        uid(),
        B,
        JSON.stringify({
          publicationId: publication.id,
          privateText: "NEVER PUBLIC",
        }),
      ],
    );
    const result = await db.query(
      "select discover_publications('PUBLIC','all','popular') item",
    );
    expect((result.rows[0] as any).item.popularity).toBe(1);
    expect(JSON.stringify(result.rows)).not.toContain("NEVER PUBLIC");
    expect(
      (
        await db.query(
          "select discover_publications('PUBLIC','Science','popular')",
        )
      ).rows,
    ).toHaveLength(0);
    await db.query("update publications set hidden=true where id=$1", [
      publication.id,
    ]);
    expect(
      (await db.query("select discover_publications('','all','popular')")).rows,
    ).toHaveLength(0);
    await asUser(null, async () => {
      await expect(
        db.query("select discover_publications('','all','popular')"),
      ).rejects.toThrow("permission denied");
    });
  });
});
