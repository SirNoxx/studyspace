import { instantiateSnapshot } from "../study-copy";
import { sha256 } from "../transfer";
import { adminClient } from "../supabase/server";
import { type Snapshot, type Workspace, uid, now, inContainer } from "../model";
import {
  createContainer,
  createNote,
  prepareSnapshot,
  fingerprint,
} from "../domain";
import { loadWorkspace, persistWorkspace } from "./repository";
export async function publicSnapshot(
  id: string,
  versionId?: string,
): Promise<{ snapshot: Snapshot; ownerId: string } | null> {
  const db = adminClient();
  const { data, error } = await db
    .from("publications")
    .select("owner_id,current_version")
    .eq("id", id)
    .eq("status", "published")
    .eq("hidden", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: version } = await db
    .from("publication_versions")
    .select("payload")
    .eq("id", versionId ?? data.current_version)
    .eq("publication_id", id)
    .single();
  return version
    ? { snapshot: version.payload as Snapshot, ownerId: data.owner_id }
    : null;
}
export async function makeStudyCopy(
  owner: string,
  publicationId: string,
  key: string,
  checkCancelled?: () => Promise<void>,
) {
  const source = await publicSnapshot(publicationId);
  if (!source || !source.snapshot.allowCopies)
    throw new Error("Study copies are not available for this publication.");
  const w = await loadWorkspace(owner);
  const prior = w.copies.find((c) => c.id === key);
  if (prior) return prior.containerId;
  const p = source.snapshot;
  const assets = [];
  for (const a of p.attachments ?? []) {
    const db = adminClient();
    const { data, error } = await db.storage
      .from("publication-assets")
      .download(`${p.publicationId}/${p.id}/${a.id}`);
    if (error || !data) throw new Error("Published attachment unavailable.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if ((await sha256(bytes)) !== a.hash)
      throw new Error("Attachment checksum mismatch.");
    await checkCancelled?.();
    const objectKey = owner + "/copies/" + key + "/" + uid() + "/" + a.id;
    const upload = await db.storage
      .from("attachments")
      .upload(objectKey, bytes, { contentType: a.mime, upsert: true });
    if (upload.error) throw upload.error;
    assets.push({ ...a, id: uid(), key: objectKey, createdAt: now() });
  }
  const copy = instantiateSnapshot(w, p, key, assets);
  await checkCancelled?.();
  await persistWorkspace(owner, w, w.revision);
  return copy.containerId;
}
