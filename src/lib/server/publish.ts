import { z } from "zod";
import { adminClient } from "../supabase/server";
import { loadWorkspace } from "./repository";
import { prepareSnapshot, fingerprint } from "../domain";
import { inContainer } from "../model";
import { sha256 } from "../transfer";
export const PublicationInput = z.object({
  action: z.literal("publish"),
  ids: z.array(z.uuid()).min(1).max(500),
  expectedRevision: z.number().int(),
  fingerprint: z.string(),
  containerId: z.uuid(),
  selection: z
    .object({
      attachmentIds: z.array(z.uuid()).max(100).default([]),
      anchorIds: z.array(z.uuid()).max(1000).default([]),
      annotationIds: z.array(z.uuid()).max(1000).default([]),
      definitionIds: z.array(z.uuid()).optional(),
      sourceIds: z.array(z.uuid()).optional(),
    })
    .default({ attachmentIds: [], anchorIds: [], annotationIds: [] }),
  fields: z.object({
    id: z.uuid(),
    publicationId: z.uuid(),
    title: z.string().min(1).max(240),
    description: z.string().max(5000),
    summary: z.string().max(2000),
    allowCopies: z.boolean(),
    allowDownload: z.boolean(),
    allowQA: z.boolean(),
    topics: z.array(z.string().max(50)).max(20).default([]),
  }),
});

export async function publishApprovedSnapshot(
  owner: string,
  input: z.infer<typeof PublicationInput>,
  jobId?: string,
) {
  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("suspended")
    .eq("id", owner)
    .maybeSingle();
  if (profile?.suspended) throw new Error("Public posting suspended.");
  const w = await loadWorkspace(owner);
  const prior = w.publications
    .flatMap((p) => p.versions)
    .find(
      (v) =>
        v.id === input.fields.id &&
        v.publicationId === input.fields.publicationId,
    );
  if (prior) return prior;
  if (
    w.revision !== input.expectedRevision ||
    fingerprint(w, input.ids) !== input.fingerprint
  )
    throw new Error("REVISION_CONFLICT");
  if (
    !w.containers.some((c) => c.id === input.containerId) ||
    input.ids.some((id) => !w.notes.some((n) => n.id === id && !n.trashed))
  )
    throw new Error("Publication selection unavailable.");
  const existing = w.publications.find(
    (p) => p.id === input.fields.publicationId,
  );
  const snapshot = prepareSnapshot(
    w,
    input.ids,
    {
      ...input.fields,
      author: w.settings.displayName,
      version: (existing?.current.version ?? 0) + 1,
    },
    input.selection,
  );
  const copy = w.copies.find((c) =>
    inContainer(w, input.containerId, c.containerId),
  );
  snapshot.lineage = copy?.lineage ?? [];
  for (const asset of snapshot.attachments ?? []) {
    const original = w.attachments.find((a) => a.id === asset.id)!;
    if (!original.key.startsWith(owner + "/"))
      throw new Error("Invalid attachment ownership.");
    const { data, error } = await db.storage
      .from("attachments")
      .download(original.key);
    if (error || !data) throw new Error("Selected attachment is unavailable.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if ((await sha256(bytes)) !== asset.hash)
      throw new Error("Selected attachment checksum changed.");
    const uploaded = await db.storage
      .from("publication-assets")
      .upload(`${snapshot.publicationId}/${snapshot.id}/${asset.id}`, bytes, {
        contentType: asset.mime,
        upsert: false,
        cacheControl: "0",
      });
    if (
      uploaded.error &&
      uploaded.error.message !== "The resource already exists"
    )
      throw uploaded.error;
  }
  if (jobId) {
    const { data: job } = await db
      .from("jobs")
      .select("cancel_requested")
      .eq("id", jobId)
      .single();
    if (job?.cancel_requested) throw new Error("JOB_CANCELLED");
  }
  const { error } = await db.rpc("publish_snapshot", {
    p_owner: owner,
    p_id: snapshot.publicationId,
    p_container: input.containerId,
    p_snapshot: snapshot,
    p_expected: w.revision,
  });
  if (error) throw error;
  return snapshot;
}
