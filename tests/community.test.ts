import { beforeAll, afterAll, it, expect } from "vitest";
import { type PGlite } from "@electric-sql/pglite";
import { createTestDatabase, asDatabaseRole } from "./helpers/database";
import { randomUUID as uuid } from "node:crypto";
let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});
it("stages releases and blocks direct database bypasses during rollback", async () => {
  const a = await actor(),
    b = await actor();
  const c = await cmd(a, "collection", { title: "Rollback test" });
  await invite(a, b, c.id);
  const n = await cmd(a, "node-create", {
    collection: c.id,
    kind: "note",
    title: "Private shared text",
  });
  const asset = uuid();
  await cmd(
    a,
    "asset",
    {
      collection: c.id,
      id: n.id,
      filename: "test.txt",
      mime: "text/plain",
      content: "eA==",
    },
    asset,
  );
  try {
    await db.exec(
      "update community_release set features=array['profiles','discover','moderation']",
    );
    await expect(query(b, "collection", c.id)).rejects.toThrow(
      "COMMUNITY_UNAVAILABLE",
    );
    await expect(
      cmd(a, "node-save", {
        collection: c.id,
        id: n.id,
        revision: 1,
        title: "Bypass",
        body: "x",
      }),
    ).rejects.toThrow("COMMUNITY_UNAVAILABLE");
    await asDatabaseRole(db, "authenticated", b, async () => {
      expect(
        (await db.query("select id from shared_assets where id=$1", [asset]))
          .rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "select community_command_core('profile','{}',gen_random_uuid())",
        ),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("update community_release set enabled=true"),
      ).rejects.toThrow("permission denied");
    });
    expect((await query(a, "profile")).mine).toBe(true);
    await db.exec("update community_release set enabled=false");
    await expect(query(null, "profile", a)).rejects.toThrow(
      "COMMUNITY_UNAVAILABLE",
    );
  } finally {
    await db.exec(
      "update community_release set enabled=true,features=array['profiles','discover','shared','messages','moderation']",
    );
  }
});
async function actor(publicProfile = true) {
  const id = uuid();
  await db.query("insert into auth.users values($1)", [id]);
  await db.query("insert into profiles(id,display_name) values($1,'Tester')", [
    id,
  ]);
  await cmd(id, "profile", {
    username: "u_" + id.replaceAll("-", "").slice(0, 20),
    public: publicProfile,
    requests: true,
  });
  return id;
}
async function cmd(
  actor: string,
  action: string,
  data: Record<string, unknown>,
  request = uuid(),
) {
  return asDatabaseRole(db, "authenticated", actor, async () => {
    const r = await db.query<{ value: any }>(
      "select community_command($1,$2,$3) value",
      [action, JSON.stringify(data), request],
    );
    return r.rows[0].value;
  });
}
async function query(
  actor: string | null,
  kind: string,
  id: string | null = null,
  filter = {},
) {
  return asDatabaseRole(
    db,
    actor ? "authenticated" : "anon",
    actor,
    async () => {
      const r = await db.query<{ value: any }>(
        "select community_query($1,$2,$3) value",
        [kind, id, JSON.stringify(filter)],
      );
      return r.rows[0].value;
    },
  );
}
async function invite(
  owner: string,
  member: string,
  collection: string,
  role = "editor",
) {
  const id = uuid();
  await cmd(owner, "invite", { target: member, collection, role }, id);
  await cmd(member, "invitation", { id, accept: true });
}
it("invites accounts without social profiles while preserving owner and recipient permissions", async () => {
  const owner = uuid(),
    recipient = uuid(),
    outsider = uuid();
  for (const id of [owner, recipient, outsider]) {
    await db.query("insert into auth.users values($1)", [id]);
    await db.query(
      "insert into profiles(id,display_name) values($1,'New account')",
      [id],
    );
  }
  expect((await query(recipient, "profile")).id).toBe(recipient);
  const collection = await cmd(owner, "collection", {
    title: "First collaboration",
  });
  const invitation = uuid();
  const payload = {
    collection: collection.id,
    target: recipient,
    role: "editor",
  };
  await cmd(owner, "invite", payload, invitation);
  await cmd(owner, "invite", payload, invitation);
  expect((await query(recipient, "shared")).invitations).toHaveLength(1);
  expect((await query(outsider, "shared")).invitations).toHaveLength(0);
  await expect(query(recipient, "collection", collection.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await expect(
    cmd(outsider, "invitation", { id: invitation, accept: true }),
  ).rejects.toThrow("ACCESS_DENIED");
  await cmd(recipient, "invitation", { id: invitation, accept: true });
  expect((await query(recipient, "collection", collection.id)).role).toBe(
    "editor",
  );
  await cmd(recipient, "node-create", {
    collection: collection.id,
    kind: "note",
    title: "Editor note",
  });
  await expect(
    cmd(recipient, "invite", { ...payload, target: outsider }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    cmd(owner, "invite", { ...payload, target: owner }),
  ).rejects.toThrow("INVITE_SELF");
  await expect(
    cmd(owner, "invite", { ...payload, target: uuid() }),
  ).rejects.toThrow("INVITEE_UNAVAILABLE");
  await cmd(outsider, "block", { target: owner });
  await expect(
    cmd(owner, "invite", { ...payload, target: outsider }),
  ).rejects.toThrow("BLOCKED");
  await cmd(owner, "member", {
    collection: collection.id,
    target: recipient,
    role: "remove",
  });
  await expect(query(recipient, "collection", collection.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  expect(
    (
      await db.query(
        "select id from community_profiles where id in ($1,$2,$3)",
        [owner, recipient, outsider],
      )
    ).rows,
  ).toHaveLength(0);
});
it("keeps private profiles, preferences, statistics and workspace data private", async () => {
  const a = await actor(false),
    b = await actor();
  await expect(query(b, "profile", a)).rejects.toThrow("PROFILE_PRIVATE");
  await expect(query(null, "profile", a)).rejects.toThrow("PROFILE_PRIVATE");
  const mine = await query(a, "profile");
  expect(mine.stats).toBeDefined();
  expect(mine.profile.requests).toBe(true);
  const theirs = await query(a, "profile", b);
  expect(theirs.stats).toBeUndefined();
  expect(theirs.profile.preferences).toBeUndefined();
  expect(theirs.profile.requests).toBeUndefined();
  await asDatabaseRole(db, "authenticated", b, async () => {
    expect(
      (
        await db.query("select username from community_profiles where id=$1", [
          a,
        ])
      ).rows,
    ).toEqual([]);
    await expect(
      db.query("select preferences from community_profiles"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("update community_profiles set public=true"),
    ).rejects.toThrow("permission denied");
  });
});
it("supports posts, follows, topics, saves, comments and owner-only edits", async () => {
  const a = await actor(),
    b = await actor();
  const post = await cmd(a, "post", {
    kind: "research",
    title: "Cell biology",
    body: "An explicit public idea",
    category: "Natural sciences",
    tags: ["biology"],
  });
  await cmd(b, "follow", { target: a });
  await cmd(b, "topic", { topic: "biology" });
  await cmd(b, "save", { id: post.id });
  await cmd(b, "comment", { id: post.id, body: "Useful" });
  expect(
    (await query(b, "feed", null, { feed: "following" })).items.some(
      (p: any) => p.id === post.id,
    ),
  ).toBe(true);
  expect((await query(b, "feed", null, { feed: "saved" })).items).toHaveLength(
    1,
  );
  expect((await query(null, "comments", post.id)).items[0].body).toBe("Useful");
  await expect(
    cmd(b, "post-edit", { id: post.id, title: "Hijack", body: "no" }),
  ).rejects.toThrow("ACCESS_DENIED");
  await cmd(a, "post-delete", { id: post.id });
  await expect(query(b, "comments", post.id)).rejects.toThrow("ACCESS_DENIED");
});
it("limits introductions to one, requires acceptance, deduplicates sends and paginates", async () => {
  const a = await actor(),
    b = await actor(),
    stranger = await actor();
  const request = uuid();
  const conv = await cmd(
    a,
    "request",
    { target: b, body: "Study together?" },
    request,
  );
  await cmd(a, "request", { target: b, body: "Study together?" }, request);
  expect((await query(b, "messages", conv.id)).items).toHaveLength(1);
  await expect(cmd(a, "request", { target: b, body: "Again" })).rejects.toThrow(
    "CONVERSATION_EXISTS",
  );
  await expect(
    cmd(a, "message", { id: conv.id, body: "Spam" }),
  ).rejects.toThrow("CONVERSATION_NOT_ACCEPTED");
  await expect(
    cmd(a, "conversation", { id: conv.id, status: "accepted" }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(query(stranger, "messages", conv.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await cmd(b, "conversation", { id: conv.id, status: "accepted" });
  const send = uuid();
  await cmd(a, "message", { id: conv.id, body: "Accepted message" }, send);
  await cmd(a, "message", { id: conv.id, body: "Accepted message" }, send);
  await expect(
    cmd(a, "message", { id: conv.id, body: "Changed payload" }, send),
  ).rejects.toThrow("IDEMPOTENCY_MISMATCH");
  const messages = await query(b, "messages", conv.id);
  expect(messages.items).toHaveLength(2);
  expect((await query(b, "badges")).messages).toBe(2);
  await cmd(b, "read", { id: conv.id, sequence: messages.items[0].sequence });
  expect((await query(b, "badges")).messages).toBe(0);
  expect(
    (
      await query(b, "messages", conv.id, {
        sequence: messages.items[0].sequence,
      })
    ).items,
  ).toHaveLength(1);
  await cmd(b, "block", { target: a });
  await expect(
    cmd(a, "message", { id: conv.id, body: "Blocked" }),
  ).rejects.toThrow("CONVERSATION_NOT_ACCEPTED");
  await expect(query(a, "profile", b)).rejects.toThrow("PROFILE_PRIVATE");
});
it("enforces shared roles, CAS, history, nesting, recovery and immediate attachment revocation", async () => {
  const owner = await actor(),
    editor = await actor(),
    viewer = await actor(),
    other = await actor();
  const c = await cmd(owner, "collection", { title: "Shared only" });
  await invite(owner, editor, c.id);
  await invite(owner, viewer, c.id, "viewer");
  const n = await cmd(editor, "node-create", {
    collection: c.id,
    kind: "note",
    title: "First",
    body: "v1",
  });
  await expect(
    cmd(viewer, "node-save", {
      collection: c.id,
      id: n.id,
      revision: 1,
      title: "bad",
      body: "bad",
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(query(other, "collection", c.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await cmd(editor, "node-save", {
    collection: c.id,
    id: n.id,
    revision: 1,
    title: "Second",
    body: "v2",
  });
  await expect(
    cmd(owner, "node-save", {
      collection: c.id,
      id: n.id,
      revision: 1,
      title: "Old",
      body: "lost",
    }),
  ).rejects.toThrow("REVISION_CONFLICT");
  expect(
    (await query(viewer, "versions", n.id)).items.map(
      (v: any) => v.snapshot.body,
    ),
  ).toEqual(["v2", "v1"]);
  await cmd(editor, "node-delete", { collection: c.id, id: n.id, revision: 2 });
  await cmd(editor, "node-restore", {
    collection: c.id,
    id: n.id,
    revision: 3,
    version: 1,
  });
  const current = (await query(owner, "collection", c.id)).nodes[0];
  expect(current.body).toBe("v1");
  expect(current.revision).toBe(4);
  expect(current.deleted).toBe(false);
  const f = await cmd(editor, "node-create", {
    collection: c.id,
    kind: "folder",
    title: "A",
  });
  const f2 = await cmd(editor, "node-create", {
    collection: c.id,
    kind: "folder",
    title: "B",
    parent: f.id,
  });
  await expect(
    cmd(editor, "node-save", {
      collection: c.id,
      id: f.id,
      revision: 1,
      title: "A",
      body: "",
      parent: f2.id,
    }),
  ).rejects.toThrow("FOLDER_CYCLE");
  await expect(
    cmd(editor, "node-delete", { collection: c.id, id: f.id, revision: 1 }),
  ).rejects.toThrow("MOVE_CHILDREN_FIRST");
  const asset = uuid();
  await cmd(
    editor,
    "asset",
    {
      collection: c.id,
      id: n.id,
      filename: "study.txt",
      mime: "text/plain",
      content: "c2VjcmV0",
    },
    asset,
  );
  await asDatabaseRole(db, "authenticated", viewer, async () =>
    expect(
      (await db.query("select id from shared_assets where id=$1", [asset]))
        .rows,
    ).toHaveLength(1),
  );
  await cmd(owner, "member", {
    collection: c.id,
    target: viewer,
    role: "remove",
  });
  await expect(query(viewer, "versions", n.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await asDatabaseRole(db, "authenticated", viewer, async () =>
    expect(
      (await db.query("select id from shared_assets where id=$1", [asset]))
        .rows,
    ).toHaveLength(0),
  );
  await expect(
    cmd(editor, "member", { collection: c.id, target: owner, role: "remove" }),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("requires accepted ownership transfer and rejects revoked invitations", async () => {
  const owner = await actor(),
    next = await actor(),
    third = await actor();
  const c = await cmd(owner, "collection", { title: "Transfer" });
  const inv = uuid();
  await cmd(
    owner,
    "invite",
    { collection: c.id, target: next, role: "owner" },
    inv,
  );
  expect((await query(owner, "collection", c.id)).role).toBe("owner");
  await cmd(next, "invitation", { id: inv, accept: true });
  expect((await query(next, "collection", c.id)).role).toBe("owner");
  expect((await query(owner, "collection", c.id)).role).toBe("editor");
  const revoked = uuid();
  await cmd(
    next,
    "invite",
    { collection: c.id, target: third, role: "viewer" },
    revoked,
  );
  await cmd(next, "member", {
    collection: c.id,
    target: third,
    role: "remove",
  });
  await expect(
    cmd(third, "invitation", { id: revoked, accept: true }),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("returns a semantic conflict instead of asking the gateway to retry forever", async () => {
  const a = await actor();
  const c = await cmd(a, "collection", { title: "Conflict transport" });
  const n = await cmd(a, "node-create", {
    collection: c.id,
    kind: "note",
    title: "Current",
  });
  await expect(
    cmd(a, "node-save", {
      collection: c.id,
      id: n.id,
      revision: 0,
      title: "Stale",
      body: "draft",
    }),
  ).rejects.toMatchObject({ code: "PT409", message: "REVISION_CONFLICT" });
  expect((await query(a, "collection", c.id)).nodes[0].revision).toBe(1);
});
it("applies message settings, blocks, notification preferences, moderation and rate limits", async () => {
  const a = await actor(),
    b = await actor();
  await cmd(b, "profile", {
    username: "private_" + b.slice(0, 8),
    public: true,
    requests: false,
    preferences: { following: false },
  });
  await expect(cmd(a, "request", { target: b, body: "Hi" })).rejects.toThrow(
    "REQUESTS_DISABLED",
  );
  await cmd(a, "follow", { target: b });
  expect(
    (await db.query("select id from notifications where owner_id=$1", [b]))
      .rows,
  ).toHaveLength(0);
  const post = await cmd(a, "post", {
    kind: "idea",
    title: "Reported",
    category: "General study",
  });
  const report = uuid();
  await cmd(
    b,
    "report",
    { kind: "post", id: post.id, reason: "Report details" },
    report,
  );
  await expect(query(a, "reports")).rejects.toThrow("ACCESS_DENIED");
  await db.query("update profiles set moderator=true where id=$1", [b]);
  await cmd(b, "moderate", { id: report, decision: "hide" });
  expect(
    (await query(null, "feed")).items.some((p: any) => p.id === post.id),
  ).toBe(false);
  await db.query(
    "insert into rate_limits(owner_id,bucket,window_start,used) values($1,'social:request',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',5)",
    [a],
  );
  await expect(cmd(a, "request", { target: b, body: "Limit" })).rejects.toThrow(
    "RATE_LIMIT",
  );
});
it("deletes owned social data and denies still-valid JWTs after account deletion", async () => {
  const owner = await actor(),
    member = await actor();
  const c = await cmd(owner, "collection", { title: "Deleted owner" });
  await invite(owner, member, c.id);
  const conv = await cmd(member, "request", { target: owner, body: "hi" });
  await db.query("delete from auth.users where id=$1", [owner]);
  await expect(query(owner, "profile")).rejects.toThrow("AUTH_REQUIRED");
  await expect(
    cmd(owner, "profile", { username: "resurrect" }),
  ).rejects.toThrow("AUTH_REQUIRED");
  await expect(query(member, "collection", c.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await expect(query(member, "messages", conv.id)).rejects.toThrow(
    "ACCESS_DENIED",
  );
});
