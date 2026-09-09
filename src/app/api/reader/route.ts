import { locateQuote } from "@/lib/anchors";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import {
  loadWorkspace,
  persistWorkspace,
  apiError,
  assertSameOrigin,
} from "@/lib/server/repository";
import { publicSnapshot } from "@/lib/server/publications";
import { now } from "@/lib/model";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const input = z
      .object({
        action: z.enum(["bookmark", "progress", "annotation"]),
        publicationId: z.uuid(),
        noteId: z.uuid(),
        versionId: z.uuid(),
        quote: z.string().max(5000).default(""),
        body: z.string().max(10000).default(""),
        idempotencyKey: z.uuid(),
      })
      .parse(await request.json());
    const p = await publicSnapshot(input.publicationId, input.versionId);
    if (!p) throw new Error("Publication unavailable.");
    const note = p.snapshot.notes.find((n) => n.id === input.noteId);
    if (!note) throw new Error("Note unavailable.");
    const w = await loadWorkspace(user.id);
    if (
      input.action === "bookmark" &&
      !w.bookmarks.includes(input.publicationId)
    )
      w.bookmarks.push(input.publicationId);
    if (input.action === "progress")
      w.progress[input.publicationId] = [
        ...new Set([...(w.progress[input.publicationId] ?? []), input.noteId]),
      ];
    if (
      input.action === "annotation" &&
      !w.annotations.some((a) => a.id === input.idempotencyKey)
    ) {
      if (!input.body.trim()) throw new Error("Write a note first.");
      if (input.quote && locateQuote(note.body, input.quote).index < 0)
        throw new Error("Selected passage changed.");
      w.annotations.push({
        id: input.idempotencyKey,
        noteId: note.id,
        publicationId: p.snapshot.publicationId,
        versionId: p.snapshot.id,
        revision: note.revision,
        quote: input.quote,
        prefix: "",
        suffix: "",
        body: input.body,
        kind: "private",
        createdAt: now(),
        state: "attached",
      });
    }
    await persistWorkspace(user.id, w, w.revision);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
