import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import {
  loadWorkspace,
  persistWorkspace,
  assertSameOrigin,
  apiError,
} from "@/lib/server/repository";
import type { Workspace } from "@/lib/model";
import { applyPatch, patchArrays } from "@/lib/workspace-patch";
import { jsonStream } from "@/lib/server/stream";
import { gunzipSync } from "node:zlib";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { user } = await requireUser();
    return jsonStream(await loadWorkspace(user.id));
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    if (Number(request.headers.get("content-length") ?? 0) > 32 * 1024 * 1024)
      throw new Error("Request too large.");
    const raw =
      request.headers.get("x-studyspace-compressed") === "gzip"
        ? JSON.parse(
            gunzipSync(new Uint8Array(await request.arrayBuffer()), {
              maxOutputLength: 32 * 1024 * 1024,
            }).toString("utf8"),
          )
        : await request.json();
    const current = await loadWorkspace(user.id);
    if (raw.patch) {
      const patch = z
        .object({
          arrays: z.partialRecord(
            z.enum(patchArrays),
            z.object({
              upserts: z
                .array(z.object({ id: z.uuid() }).passthrough())
                .max(10000),
              remove: z.array(z.uuid()).max(10000),
            }),
          ),
          settings: z.record(z.string(), z.unknown()).optional(),
          bookmarks: z.array(z.uuid()).optional(),
          progress: z.record(z.string(), z.array(z.uuid())).optional(),
        })
        .parse(raw.patch);
      raw.state = applyPatch(
        current,
        patch as Parameters<typeof applyPatch>[1],
      );
    }
    const { expected, state } = z
      .object({
        expected: z.number().int().nonnegative(),
        state: z
          .object({
            schemaVersion: z.literal(1),
            notes: z
              .array(
                z
                  .object({
                    id: z.uuid(),
                    containerId: z.uuid(),
                    title: z.string().max(240),
                    body: z.string().max(5242880),
                    revision: z.number().int().positive(),
                  })
                  .passthrough(),
              )
              .max(10000),
            containers: z.array(
              z
                .object({
                  id: z.uuid(),
                  parentId: z.uuid().nullable(),
                  title: z.string().min(1).max(240),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      })
      .parse(raw);
    const next = state as unknown as Workspace;
    // Provenance and public records are created only by dedicated authenticated operations.
    next.copies = current.copies;
    next.publications = current.publications;
    for (const asset of next.attachments) {
      if (!asset.key.startsWith(user.id + "/"))
        throw new Error("Invalid asset ownership.");
    }
    const revision = await persistWorkspace(user.id, next, expected);
    if (next.settings.autoEnrich) {
      const jobs = next.sources
        .filter(
          (s) => s.status === "pending" && s.kind !== "url" && s.kind !== "pdf",
        )
        .slice(0, 20)
        .map((s) => ({
          owner_id: user.id,
          kind: "metadata",
          payload: { sourceId: s.id },
          idempotency_key: s.id,
        }));
      if (jobs.length)
        await adminClient().from("jobs").upsert(jobs, {
          onConflict: "owner_id,idempotency_key",
          ignoreDuplicates: true,
        });
    }
    return Response.json({ revision });
  } catch (e) {
    return apiError(e);
  }
}
