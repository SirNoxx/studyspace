import { PublicationInput, publishApprovedSnapshot } from "./publish";
import { z } from "zod";
import { adminClient } from "../supabase/server";
import { loadWorkspace, persistWorkspace } from "./repository";
import { enrichMetadata } from "./metadata";
import { makeStudyCopy } from "./publications";
import {
  prepareImport,
  commitImport,
  exportWorkspace,
  sha256,
  assetMime,
} from "../transfer";
import { createContainer } from "../domain";
export const JobInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("publication"),
    payload: PublicationInput,
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("metadata"),
    payload: z.object({ sourceId: z.uuid() }),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("copy"),
    payload: z.object({ publicationId: z.uuid(), copyId: z.uuid() }),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("import"),
    payload: z.object({
      objectKey: z.string().max(500),
      filename: z.string().max(240),
      destination: z.uuid().optional(),
      title: z.string().max(240).default("Imported notes"),
    }),
    idempotencyKey: z.uuid(),
  }),
  z.object({
    kind: z.literal("export"),
    payload: z.object({
      containerId: z.uuid().optional(),
      full: z.boolean().default(false),
    }),
    idempotencyKey: z.uuid(),
  }),
]);
export async function executeJob(job: any) {
  const db = adminClient();
  const owner = job.owner_id;
  const checkCancelled = async () => {
    const { data, error } = await db
      .from("jobs")
      .select("cancel_requested")
      .eq("id", job.id)
      .single();
    if (error) throw error;
    if (data.cancel_requested) throw new Error("Job cancelled.");
  };
  const current = await db
    .from("jobs")
    .select("cancel_requested")
    .eq("id", job.id)
    .single();
  if (current.data?.cancel_requested) return { cancelled: true };
  const validated = JobInput.parse({
    kind: job.kind,
    payload: job.payload,
    idempotencyKey: job.idempotency_key,
  });
  if (validated.kind === "publication")
    return {
      snapshot: await publishApprovedSnapshot(owner, validated.payload, job.id),
    };
  if (validated.kind === "copy")
    return {
      containerId: await makeStudyCopy(
        owner,
        validated.payload.publicationId,
        validated.payload.copyId,
        checkCancelled,
      ),
    };
  const w = await loadWorkspace(owner);
  if (validated.kind === "metadata") {
    const s = w.sources.find((s) => s.id === validated.payload.sourceId);
    if (!s) throw new Error("Source unavailable.");
    const result = await enrichMetadata(s.input);
    for (const [key, value] of Object.entries(result))
      if (!s.overrides.includes(key)) (s as any)[key] = value;
    await checkCancelled();
    await persistWorkspace(owner, w, w.revision);
    return { sourceId: s.id, status: s.status };
  }
  if (validated.kind === "import") {
    const p = validated.payload;
    if (!p.objectKey.startsWith(owner + "/"))
      throw new Error("Invalid staging ownership.");
    if (w.containers.some((c) => c.description === "Import job " + job.id))
      return { alreadyCommitted: true };
    const { data, error } = await db.storage
      .from("attachments")
      .download(p.objectKey);
    if (error || !data) throw new Error("Staged import unavailable.");
    const plan = await prepareImport([
      new File([await data.arrayBuffer()], p.filename),
    ]);
    const destination =
      p.destination ??
      createContainer(w, {
        title: p.title,
        description: "Import job " + job.id,
      }).id;
    if (!w.containers.some((c) => c.id === destination))
      throw new Error("Destination unavailable.");
    const assets = plan.files.filter((f) => f.kind === "asset");
    for (const file of assets) {
      const id = crypto.randomUUID(),
        key = owner + "/" + id + "/" + file.path.split("/").at(-1);
      const upload = await db.storage
        .from("attachments")
        .upload(key, Uint8Array.from(file.bytes), {
          contentType: assetMime(file.path),
        });
      if (upload.error) throw upload.error;
      w.attachments.push({
        id,
        filename: file.path,
        mime: assetMime(file.path),
        hash: file.hash,
        size: file.bytes.length,
        key,
        createdAt: new Date().toISOString(),
      });
    }
    const report = commitImport(w, plan, destination);
    await checkCancelled();
    await persistWorkspace(owner, w, w.revision);
    return {
      containerId: destination,
      imported: report.imported,
      skipped: report.skipped,
      warnings: report.warnings,
    };
  }
  const bytes = await exportWorkspace(w, {
    ...validated.payload,
    loadAsset: async (a) => {
      if (!a.key.startsWith(owner + "/"))
        throw new Error("Invalid attachment ownership.");
      const { data, error } = await db.storage
        .from("attachments")
        .download(a.key);
      if (error || !data) throw new Error("Missing attachment.");
      return new Uint8Array(await data.arrayBuffer());
    },
  });
  await checkCancelled();
  const key = owner + "/exports/" + job.id + "-" + crypto.randomUUID() + ".zip";
  const { error } = await db.storage
    .from("attachments")
    .upload(key, Uint8Array.from(bytes), {
      contentType: "application/zip",
      upsert: true,
    });
  if (error) throw error;
  return { objectKey: key, size: bytes.length, hash: await sha256(bytes) };
}
