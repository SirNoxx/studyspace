import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { emptyWorkspace, uid } from "../src/lib/model";
import { createNote, prepareSnapshot } from "../src/lib/domain";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
  service = process.env.SUPABASE_SERVICE_ROLE_KEY!,
  anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (
  !url ||
  !service ||
  !anon ||
  process.env.TEST_SUPABASE_URL !== url ||
  process.env.TEST_ALLOW_MUTATIONS !== "yes"
)
  throw new Error(
    "Use an isolated migrated Supabase project. Set TEST_SUPABASE_URL to its exact URL and TEST_ALLOW_MUTATIONS=yes. This test creates and removes clearly named fixture accounts.",
  );
const admin = createClient(url, service, { auth: { persistSession: false } }),
  users: { id: string; client: SupabaseClient }[] = [];
try {
  for (const persona of ["owner-a", "owner-b", "reader-c", "moderator"]) {
    const password = uid() + "-Aa1!",
      email = `studyspace-test-${persona}-${uid()}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    const id = data.user!.id,
      client = createClient(url, anon, { auth: { persistSession: false } });
    users.push({ id, client });
    assert.ifError(
      (await client.auth.signInWithPassword({ email, password })).error,
    );
    const w = emptyWorkspace();
    createNote(w, undefined, {
      title: "OBVIOUS TEST " + persona,
      body: "ISOLATED TEST CONTENT",
    });
    assert.ifError(
      (
        await admin.rpc("commit_workspace", {
          p_owner: id,
          p_expected: 0,
          p_state: w,
        })
      ).error,
    );
  }
  const [a, b, c, m] = users;
  const anonymous = createClient(url, anon, {
    auth: { persistSession: false },
  });
  const own = await a.client.from("notes").select("id,owner_id");
  assert.ifError(own.error);
  assert.equal(own.data!.length, 1);
  for (const other of [b, c])
    assert.equal(
      (await other.client.from("notes").select("id").eq("owner_id", a.id)).data
        ?.length,
      0,
    );
  assert.ok((await anonymous.from("notes").select("*")).error);
  assert.ok((await b.client.rpc("read_workspace", { p_owner: a.id })).error);
  assert.ok(
    (await b.client.from("profiles").update({ moderator: true }).eq("id", b.id))
      .error,
  );
  assert.ifError(
    (await admin.from("profiles").update({ moderator: true }).eq("id", m.id))
      .error,
  );
  assert.equal((await m.client.rpc("is_moderator")).data, true);
  assert.equal((await b.client.rpc("is_moderator")).data, false);
  const key = a.id + "/test/evidence.txt";
  assert.ifError(
    (
      await a.client.storage
        .from("attachments")
        .upload(key, new Blob(["ISOLATED TEST OBJECT"]), {
          contentType: "text/plain",
        })
    ).error,
  );
  assert.ok((await b.client.storage.from("attachments").download(key)).error);
  assert.ok((await anonymous.storage.from("attachments").download(key)).error);
  assert.equal(
    await (
      await a.client.storage.from("attachments").download(key)
    ).data!.text(),
    "ISOLATED TEST OBJECT",
  );
  const { data: raw } = await admin.rpc("read_workspace", { p_owner: a.id });
  const snapshot = prepareSnapshot({ ...emptyWorkspace(), ...raw }, [
    own.data![0].id,
  ]);
  assert.ifError(
    (
      await admin.rpc("publish_snapshot", {
        p_owner: a.id,
        p_id: snapshot.publicationId,
        p_container: raw.notes[0].containerId,
        p_snapshot: snapshot,
        p_expected: raw.revision,
      })
    ).error,
  );
  assert.equal(
    (
      await anonymous
        .from("publication_versions")
        .select("id")
        .eq("id", snapshot.id)
    ).data?.length,
    1,
  );
  assert.ifError(
    (
      await admin.rpc("moderate_publication", {
        p_actor: m.id,
        p_publication: snapshot.publicationId,
        p_action: "hide",
        p_report: null,
      })
    ).error,
  );
  assert.equal(
    (
      await anonymous
        .from("publication_versions")
        .select("id")
        .eq("id", snapshot.id)
    ).data?.length,
    0,
  );
  assert.ifError(
    (
      await admin.rpc("moderate_publication", {
        p_actor: m.id,
        p_publication: snapshot.publicationId,
        p_action: "restore",
        p_report: null,
      })
    ).error,
  );
  assert.ifError(
    (
      await admin
        .from("publications")
        .update({ status: "unpublished" })
        .eq("id", snapshot.publicationId)
    ).error,
  );
  assert.equal(
    (
      await anonymous
        .from("publication_versions")
        .select("id")
        .eq("id", snapshot.id)
    ).data?.length,
    0,
  );
  console.log(
    JSON.stringify({
      result: "passed",
      personas: 5,
      checks: [
        "authenticated owner isolation",
        "anonymous rejection",
        "service RPC denial",
        "moderator assignment",
        "real private storage",
        "snapshot publication",
        "moderation",
        "unpublish",
      ],
    }),
  );
} finally {
  for (const u of users) {
    await admin.storage
      .from("attachments")
      .remove([u.id + "/test/evidence.txt"]);
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.error("Fixture cleanup failed for account " + u.id);
  }
}
