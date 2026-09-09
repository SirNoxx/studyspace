import {
  checkpointMerge,
  undoMerge,
  mappedReferences,
  copyPath,
  copyRelativePath,
} from "@/lib/merge-checkpoint";
import { sha256 } from "@/lib/transfer";
import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import {
  loadWorkspace,
  persistWorkspace,
  assertSameOrigin,
  apiError,
} from "@/lib/server/repository";
import { publicSnapshot } from "@/lib/server/publications";
import { fingerprint, diffNote, saveNote, createNote } from "@/lib/domain";
import { uid, now, type Attachment, type PublicNote } from "@/lib/model";
import { recordChanges, applyRecordDecision } from "@/lib/merge-records";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const raw = await request.json();
    if (raw.action === "undo") {
      const input = z
          .object({ copyId: z.uuid(), expectedRevision: z.number().int() })
          .parse(raw),
        w = await loadWorkspace(user.id),
        copy = w.copies.find((c) => c.id === input.copyId);
      if (!copy || w.revision !== input.expectedRevision)
        throw new Error("REVISION_CONFLICT");
      undoMerge(w, copy);
      return Response.json({
        revision: await persistWorkspace(user.id, w, w.revision),
      });
    }
    const input = z
      .object({
        copyId: z.uuid(),
        upstreamId: z.uuid(),
        fingerprint: z.string(),
        expectedRevision: z.number().int(),
        decisions: z.record(
          z.string(),
          z.enum(["skip", "merge", "mine", "upstream", "both", "edit"]),
        ),
        resolutions: z.record(z.string(), z.string().max(5242880)),
      })
      .parse(raw);
    const w = await loadWorkspace(user.id);
    const copy = w.copies.find((c) => c.id === input.copyId);
    if (!copy) throw new Error("Copy unavailable.");
    if (
      w.revision !== input.expectedRevision ||
      fingerprint(w, Object.values(copy.mapping)) !== input.fingerprint
    )
      return Response.json(
        { error: "Your copy changed. Reopen the comparison." },
        { status: 409 },
      );
    const upstream = await publicSnapshot(copy.publicationId);
    if (!upstream || upstream.snapshot.id !== input.upstreamId)
      return Response.json(
        { error: "Upstream changed or is unavailable. Reopen the comparison." },
        { status: 409 },
      );
    if (!upstream.snapshot.allowCopies)
      throw new Error(
        "The author has disabled new copy updates. Your existing copy remains yours.",
      );
    const metadata = recordChanges(w, copy, upstream.snapshot);
    checkpointMerge(w, copy);
    for (const change of metadata.filter((c) => c.kind === "attachments")) {
      const decision = input.decisions[change.id];
      if (!decision || decision === "skip") continue;
      let asset: Attachment | undefined;
      if (change.nextData && decision !== "mine") {
        const publicFile = upstream.snapshot.attachments?.find(
          (a) => a.id === change.id,
        )!;
        const db = adminClient(),
          { data, error } = await db.storage
            .from("publication-assets")
            .download(
              `${copy.publicationId}/${upstream.snapshot.id}/${publicFile.id}`,
            );
        if (error || !data)
          throw new Error("Published attachment unavailable.");
        const bytes = new Uint8Array(await data.arrayBuffer());
        if ((await sha256(bytes)) !== publicFile.hash)
          throw new Error("Attachment checksum mismatch.");
        const key = `${user.id}/copy-updates/${copy.id}/${upstream.snapshot.id}/${publicFile.id}`;
        const upload = await db.storage
          .from("attachments")
          .upload(key, bytes, {
            contentType: publicFile.mime,
            upsert: true,
            cacheControl: "0",
          });
        if (upload.error) throw upload.error;
        asset = { ...publicFile, id: uid(), key, createdAt: now() };
      }
      applyRecordDecision(w, copy, change, decision, asset);
    }
    const inverse = Object.fromEntries(
      Object.entries(copy.mapping).map(([a, b]) => [b, a]),
    );
    for (const [id, decision] of Object.entries(input.decisions)) {
      if (decision === "skip") continue;
      const change = metadata.find((c) => c.id === id);
      if (change) continue;
      if (
        !copy.accepted[id] &&
        !upstream.snapshot.notes.some((n) => n.id === id)
      )
        throw new Error("Invalid merge item.");
      const base = copy.accepted[id] ?? null,
        n = w.notes.find((n) => n.id === copy.mapping[id] && !n.trashed);
      const local: PublicNote | null = n
        ? {
            id,
            title: n.title,
            body: mappedReferences(n.body, inverse),
            revision: n.revision,
            path: copyRelativePath(w, copy, n.containerId, base?.path ?? ""),
          }
        : null;
      const next = upstream.snapshot.notes.find((n) => n.id === id) ?? null;
      const computed = diffNote(base, local, next);
      if (decision === "merge" && computed.status !== "safe")
        throw new Error("This item requires an explicit conflict resolution.");
      let result =
        decision === "merge"
          ? computed.result
          : decision === "upstream"
            ? next
            : local;
      if (decision === "edit")
        result = {
          ...(local ?? next!),
          body: input.resolutions[id] ?? local?.body ?? "",
        };
      if (decision === "both" && next)
        createNote(w, copy.containerId, {
          title: next.title + " · upstream",
          body: next.body,
        });
      if (!["both", "mine"].includes(decision)) {
        if (result) {
          if (n)
            saveNote(
              w,
              n.id,
              n.revision,
              {
                body: mappedReferences(result.body, copy.mapping),
                title: result.title,
              },
              "Merge checkpoint",
            );
          else
            copy.mapping[id] = createNote(w, copy.containerId, {
              title: result.title,
              body: mappedReferences(result.body, copy.mapping),
            }).id;
        } else if (n) {
          saveNote(
            w,
            n.id,
            n.revision,
            { body: n.body + "\n" },
            "Before upstream deletion",
          );
          n.trashed = true;
        }
      }
      const updated = w.notes.find((n) => n.id === copy.mapping[id]);
      if (updated && result && !["mine", "both"].includes(decision))
        updated.containerId = copyPath(w, copy, result.path);
      copy.accepted[id] = next;
    }
    for (const change of metadata.filter((c) => c.kind !== "attachments")) {
      const decision = input.decisions[change.id];
      if (decision && decision !== "skip")
        applyRecordDecision(w, copy, change, decision);
    }
    const revision = await persistWorkspace(user.id, w, w.revision);
    return Response.json({ revision });
  } catch (e) {
    return apiError(e);
  }
}
