import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/server/repository";
import { validateSnapshot } from "@/lib/spreadsheets/model";
import {
  mergeWorkbook,
  SpreadsheetConflict,
} from "@/lib/spreadsheets/concurrency";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
function failure(e: unknown) {
  const err = e as { code?: string; message?: string };
  return reply(
    {
      error:
        err.code === "42501"
          ? "Access to this workbook was revoked."
          : err.message === "AUTH_REQUIRED"
            ? "Sign in to open this workbook."
            : "The workbook could not sync. Your recovery copy is retained.",
    },
    err.code === "42501" ? 403 : err.message === "AUTH_REQUIRED" ? 401 : 400,
  );
}
export async function GET(request: Request) {
  try {
    if (
      process.env.SOCIAL_ENABLED === "false" ||
      process.env.SHARED_SPREADSHEETS_ENABLED !== "true"
    )
      return reply(
        { error: "Shared spreadsheets are not enabled on this server yet." },
        503,
      );
    const { client } = await requireUser(),
      params = new URL(request.url).searchParams,
      id = z.uuid().parse(params.get("id")),
      collection = z.uuid().parse(params.get("collection"));
    const [access, writeAccess] = await Promise.all([
      client.rpc("shared_access", { a: collection, writing: false }),
      client.rpc("shared_access", { a: collection, writing: true }),
    ]);
    if (access.error) throw access.error;
    if (writeAccess.error) throw writeAccess.error;
    if (!access.data) throw { code: "42501" };
    if (params.has("revision") && !params.has("history")) {
      const requested = z.coerce
        .number()
        .int()
        .min(0)
        .parse(params.get("revision"));
      const revision = await client
        .from("shared_spreadsheets")
        .select("revision")
        .eq("id", id)
        .eq("collection_id", collection)
        .maybeSingle();
      if (revision.error) throw revision.error;
      if (revision.data?.revision === requested)
        return reply({ notModified: true, readOnly: !writeAccess.data });
    }
    const result = await client
      .from("shared_spreadsheets")
      .select("*")
      .eq("id", id)
      .eq("collection_id", collection)
      .maybeSingle();
    if (result.error) throw result.error;
    if (params.has("history")) {
      if (!result.data) return reply({ versions: [] });
      const versions = await client
        .from("shared_spreadsheet_versions")
        .select("revision,snapshot,created_at")
        .eq("workbook_id", id)
        .order("revision", { ascending: false })
        .limit(20);
      if (versions.error) throw versions.error;
      return reply({ versions: versions.data });
    }
    return reply({
      workbook: result.data,
      readOnly: !writeAccess.data,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (
      process.env.SOCIAL_ENABLED === "false" ||
      process.env.SHARED_SPREADSHEETS_ENABLED !== "true"
    )
      return reply(
        { error: "Shared spreadsheets are not enabled on this server yet." },
        503,
      );
    const { client, user } = await requireUser();
    // Bound streamed input before parsing, even when Content-Length is absent.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing workbook." }, 400);
    let bytes = 0;
    const parts: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 10500000) {
        await reader.cancel();
        return reply({ error: "Workbook exceeds 10 MB." }, 413);
      }
      parts.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(parts));
    const body = z
      .object({
        id: z.uuid(),
        collection: z.uuid(),
        note: z.uuid(),
        revision: z.number().int().min(0),
        requestId: z.uuid(),
        snapshot: z.unknown(),
      })
      .parse(JSON.parse(text));
    validateSnapshot(body.snapshot);
    if (body.snapshot.id !== body.id)
      return reply({ error: "Workbook identity mismatch." }, 400);
    const access = await client.rpc("shared_access", {
      a: body.collection,
      writing: true,
    });
    if (access.error) throw access.error;
    if (!access.data)
      return reply({ error: "Viewers cannot edit spreadsheets." }, 403);
    for (let attempt = 0; attempt < 4; attempt++) {
      const query = await client
        .from("shared_spreadsheets")
        .select("*")
        .eq("id", body.id)
        .eq("collection_id", body.collection)
        .maybeSingle();
      if (query.error) throw query.error;
      const current = query.data;
      let snapshot = body.snapshot;
      if (current && current.revision !== body.revision) {
        const history = await client
          .from("shared_spreadsheet_versions")
          .select("snapshot")
          .eq("workbook_id", body.id)
          .eq("revision", body.revision)
          .maybeSingle();
        if (history.error) throw history.error;
        if (!history.data)
          return reply(
            {
              error:
                "The base version is no longer available. Export your edits and reload the saved workbook.",
            },
            409,
          );
        try {
          snapshot = mergeWorkbook(
            history.data.snapshot,
            body.snapshot,
            current.snapshot,
          );
        } catch (e) {
          if (e instanceof SpreadsheetConflict)
            return reply({ error: e.message, conflicts: e.cells }, 409);
          throw e;
        }
      } else if (!current && body.revision !== 0)
        return reply(
          { error: "Workbook no longer exists. Export your recovery copy." },
          409,
        );
      const committed = await adminClient().rpc("shared_spreadsheet_commit", {
        p_id: body.id,
        p_collection: body.collection,
        p_note: body.note,
        p_actor: user.id,
        p_expected: current?.revision ?? 0,
        p_request: body.requestId,
        p_snapshot: snapshot,
      });
      if (committed.error?.code === "40001") continue;
      if (committed.error) throw committed.error;
      const saved = await client
        .from("shared_spreadsheets")
        .select("*")
        .eq("id", body.id)
        .single();
      if (saved.error) throw saved.error;
      return reply({ workbook: saved.data });
    }
    return reply(
      { error: "Workbook is busy. Keep your recovery copy and retry." },
      409,
    );
  } catch (e) {
    return failure(e);
  }
}
