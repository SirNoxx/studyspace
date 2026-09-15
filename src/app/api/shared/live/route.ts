import * as Y from "yjs";
import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/server/repository";
import { validateWorkspace } from "@/lib/domain";
import {
  encode,
  fromBase64,
  toBase64,
  legacyWorkspace,
  readWorkspace,
  repairSharedHierarchy,
  writeWorkspace,
} from "@/lib/shared/document";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  const e = error as { code?: string; message?: string };
  const denied = e.code === "42501",
    auth = e.message === "AUTH_REQUIRED";
  const missing = ["PGRST202", "42P01", "42883"].includes(e.code ?? "");
  return Response.json(
    {
      error: auth
        ? "Sign in to open this shared workspace."
        : denied
          ? "Access to this collection was revoked."
          : missing
            ? "Live collaboration needs the shared workspace database migration. Your existing files are preserved."
            : "Live sync could not finish. Your changes are retained for retry.",
    },
    { status: auth ? 401 : denied ? 403 : missing ? 503 : 400, headers },
  );
}
async function read(
  client: Awaited<ReturnType<typeof requireUser>>["client"],
  id: string,
) {
  const r = await client.rpc("shared_workspace_read", { p_id: id });
  if (r.error) throw r.error;
  return r.data;
}
async function initialized(
  client: Awaited<ReturnType<typeof requireUser>>["client"],
  id: string,
  actor: string,
) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const data = await read(client, id);
    if (data.state) return data;
    const doc = new Y.Doc();
    try {
      writeWorkspace(doc, legacyWorkspace(data.legacy));
      const snapshot = readWorkspace(doc);
      validateWorkspace(snapshot);
      const r = await adminClient().rpc("shared_workspace_initialize", {
        p_id: id,
        p_actor: actor,
        p_legacy_revision: data.collection.revision,
        p_state: toBase64(encode(doc)),
        p_snapshot: snapshot,
      });
      if (r.error) throw r.error;
    } finally {
      doc.destroy();
    }
  }
  throw Error("COLLECTION_BUSY");
}
export async function GET(request: Request) {
  try {
    if (process.env.SOCIAL_ENABLED === "false")
      return Response.json(
        { error: "Community is unavailable." },
        { status: 503, headers },
      );
    const { client, user } = await requireUser(),
      url = new URL(request.url),
      id = z.uuid().parse(url.searchParams.get("id"));
    const data = await initialized(client, id, user.id);
    if (!url.searchParams.has("vector") || url.searchParams.has("offset")) {
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(28000000)
        .parse(url.searchParams.get("offset") ?? 0);
      return Response.json(
        {
          part: data.state.slice(offset, offset + 1000000),
          length: data.state.length,
          offset,
          revision: data.revision,
          role: data.role,
          viewer: user.id,
        },
        { headers },
      );
    }
    if (
      data.state &&
      url.searchParams.get("revision") === String(data.revision)
    )
      return Response.json(
        { notModified: true, role: data.role, revision: data.revision },
        { headers },
      );
    const doc = new Y.Doc();
    Y.applyUpdate(doc, fromBase64(data.state));
    try {
      const delta = toBase64(
        encode(
          doc,
          fromBase64(
            z.string().max(50000).parse(url.searchParams.get("vector")),
          ),
        ),
      );
      if (delta.length > 3000000)
        return Response.json(
          { reload: true, revision: data.revision, role: data.role },
          { headers },
        );
      return Response.json(
        {
          ...data,
          state: toBase64(
            encode(
              doc,
              url.searchParams.has("vector")
                ? fromBase64(
                    z.string().max(50000).parse(url.searchParams.get("vector")),
                  )
                : undefined,
            ),
          ),
          viewer: user.id,
        },
        { headers },
      );
    } finally {
      doc.destroy();
    }
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (process.env.SOCIAL_ENABLED === "false")
      return Response.json(
        { error: "Community is unavailable." },
        { status: 503, headers },
      );
    const { client, user } = await requireUser();
    const body = z
      .object({
        id: z.uuid(),
        update: z.string().max(28000000),
        vector: z.string().max(50000).optional(),
      })
      .parse(await request.json());
    const update = fromBase64(body.update);
    for (let attempt = 0; attempt < 6; attempt++) {
      const data = await initialized(client, body.id, user.id);
      if (data.role === "viewer") throw { code: "42501" };
      const doc = new Y.Doc();
      Y.applyUpdate(doc, fromBase64(data.state));
      try {
        const previous = readWorkspace(doc);
        Y.applyUpdate(doc, update);
        const repaired = repairSharedHierarchy(doc, previous);
        const snapshot = readWorkspace(doc);
        validateWorkspace(snapshot);
        if (snapshot.notes.some((n) => n.body.length > 1000000))
          throw Error("NOTE_LIMIT");
        const state = toBase64(encode(doc));
        if (state === data.state)
          return Response.json(
            {
              state: toBase64(
                encode(doc, body.vector ? fromBase64(body.vector) : undefined),
              ),
              revision: data.revision,
              role: data.role,
            },
            { headers },
          );
        const saved = await adminClient().rpc("shared_workspace_commit", {
          p_id: body.id,
          p_actor: user.id,
          p_revision: data.revision,
          p_state: state,
          p_snapshot: snapshot,
        });
        if (saved.error?.code === "40001") continue;
        if (saved.error) throw saved.error;
        const delta = toBase64(
          encode(doc, body.vector ? fromBase64(body.vector) : undefined),
        );
        return Response.json(
          {
            ...(delta.length > 3000000 ? { reload: true } : { state: delta }),
            notice: repaired
              ? "A conflicting folder move was reset. Your folders and note text were preserved."
              : undefined,
            revision: saved.data,
            role: data.role,
          },
          { headers },
        );
      } finally {
        doc.destroy();
      }
    }
    return Response.json(
      { error: "This collection is busy. Retrying your changes." },
      { status: 409, headers },
    );
  } catch (e) {
    return failure(e);
  }
}
