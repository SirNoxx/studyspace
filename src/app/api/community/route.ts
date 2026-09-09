import { locateQuote } from "@/lib/anchors";
import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError, assertSameOrigin } from "@/lib/server/repository";
import { publicSnapshot } from "@/lib/server/publications";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("publicationId");
    if (id) {
      const p = await publicSnapshot(id);
      if (!p || !p.snapshot.allowQA) return Response.json({ threads: [] });
      const { data, error } = await adminClient()
        .from("public_threads")
        .select(
          "id,publication_id,version_id,note_id,anchor,body,resolved,created_at,thread_replies(id,body,created_at)",
        )
        .eq("publication_id", id)
        .eq("hidden", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return Response.json(
        {
          threads: data?.map((t) => ({
            ...t,
            anchorState: locateQuote(
              p.snapshot.notes.find((n) => n.id === t.note_id)?.body ?? "",
              t.anchor.quote,
              t.anchor.prefix,
              t.anchor.suffix,
            ).state,
          })),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { user, client } = await requireUser();
    const { data, error } = await client
      .from("clarification_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const { data: notifications } = await client
      .from("notifications")
      .select("*")
      .limit(100);
    return Response.json({ requests: data, notifications });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const db = adminClient();
    const raw = await request.json();
    const { data: profile } = await db
      .from("profiles")
      .select("suspended,moderator")
      .eq("id", user.id)
      .single();
    if (profile?.suspended)
      return Response.json({ error: "Posting is suspended." }, { status: 403 });
    const { data: allowed } = await db.rpc("consume_quota", {
      p_owner: user.id,
      p_bucket: "community",
      p_limit: 100,
    });
    if (!allowed)
      return Response.json(
        { error: "Posting limit reached. Try again tomorrow." },
        { status: 429 },
      );
    if (raw.action === "notifications-read") {
      const { error } = await db
        .from("notifications")
        .update({ read: true })
        .eq("owner_id", user.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (raw.action === "thread-update") {
      const input = z
        .object({
          threadId: z.uuid(),
          operation: z.enum(["resolve", "reopen", "delete", "edit"]),
          body: z.string().max(10000).optional(),
        })
        .parse(raw);
      const { data: t } = await db
        .from("public_threads")
        .select("*")
        .eq("id", input.threadId)
        .single();
      const p = t ? await publicSnapshot(t.publication_id) : null;
      if (
        !t ||
        !p ||
        (![t.owner_id, p.ownerId].includes(user.id) && !profile?.moderator)
      )
        return Response.json(
          { error: "This discussion is unavailable." },
          { status: 403 },
        );
      if (input.operation === "edit" && t.owner_id !== user.id)
        throw new Error("Only the question author may edit its text.");
      const patch =
        input.operation === "delete"
          ? { hidden: true }
          : input.operation === "edit"
            ? { body: z.string().min(1).parse(input.body) }
            : { resolved: input.operation === "resolve" };
      const { error } = await db
        .from("public_threads")
        .update(patch)
        .eq("id", t.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (raw.action === "request-reply") {
      const input = z
        .object({
          requestId: z.uuid(),
          idempotencyKey: z.uuid(),
          body: z.string().min(1).max(10000),
          status: z.enum(["Open", "In progress", "Resolved", "Closed"]),
        })
        .parse(raw);
      const { error } = await db.rpc("reply_to_request", {
        p_actor: user.id,
        p_request: input.requestId,
        p_key: input.idempotencyKey,
        p_body: input.body,
        p_status: input.status,
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (raw.action === "reply") {
      const input = z
        .object({
          threadId: z.uuid(),
          body: z.string().min(1).max(10000),
          idempotencyKey: z.uuid(),
        })
        .parse(raw);
      const { data: t } = await db
        .from("public_threads")
        .select("*")
        .eq("id", input.threadId)
        .eq("hidden", false)
        .single();
      const p = t ? await publicSnapshot(t.publication_id) : null;
      if (!p?.snapshot.allowQA) throw new Error("Discussion unavailable.");
      const { error } = await db.from("thread_replies").upsert(
        {
          id: input.idempotencyKey,
          thread_id: t.id,
          owner_id: user.id,
          body: input.body,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
      return Response.json({ ok: true });
    }
    const input = z
      .object({
        action: z.enum(["question", "clarification", "report"]),
        publicationId: z.uuid(),
        noteId: z.uuid().optional(),
        versionId: z.uuid(),
        quote: z.string().max(5000).default(""),
        body: z.string().min(1).max(10000),
        category: z.string().max(80).optional(),
        idempotencyKey: z.uuid(),
      })
      .parse(raw);
    const p = await publicSnapshot(input.publicationId, input.versionId);
    if (!p) throw new Error("Publication unavailable.");
    if (input.action === "question") {
      if (!p.snapshot.allowQA)
        return Response.json(
          { error: "Public questions are disabled." },
          { status: 403 },
        );
      const n = p.snapshot.notes.find((n) => n.id === input.noteId);
      if (!n || (input.quote && locateQuote(n.body, input.quote).index < 0))
        throw new Error("Selected passage no longer matches.");
      const located = locateQuote(n.body, input.quote);
      const start = located.index;
      const { error } = await db.from("public_threads").upsert(
        {
          id: input.idempotencyKey,
          publication_id: input.publicationId,
          version_id: p.snapshot.id,
          owner_id: user.id,
          note_id: n.id,
          body: input.body,
          anchor: {
            quote: input.quote,
            prefix: located.text.slice(Math.max(0, start - 60), start),
            suffix: located.text.slice(
              start + input.quote.length,
              start + input.quote.length + 60,
            ),
            revision: n.revision,
          },
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
    if (input.action === "clarification") {
      const { error } = await db.from("clarification_requests").upsert(
        {
          id: input.idempotencyKey,
          publication_id: input.publicationId,
          sender_id: user.id,
          recipient_id: p.ownerId,
          body: input.body,
          category: input.category ?? "Other",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
    if (input.action === "report") {
      const { error } = await db.from("reports").upsert(
        {
          id: input.idempotencyKey,
          publication_id: input.publicationId,
          reporter_id: user.id,
          body: input.body,
          category: input.category ?? "Other",
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
    }
    if (input.action !== "report" && user.id !== p.ownerId)
      await db.from("notifications").upsert(
        {
          owner_id: p.ownerId,
          event_key: input.idempotencyKey,
          title:
            input.action === "question"
              ? "A new public question"
              : "A private clarification request",
          body: "Open your inbox to read it.",
          href: "/w/inbox",
        },
        { onConflict: "owner_id,event_key", ignoreDuplicates: true },
      );
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
