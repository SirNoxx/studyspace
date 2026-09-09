import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import {
  apiError,
  assertSameOrigin,
  loadWorkspace,
} from "@/lib/server/repository";
import { JobInput } from "@/lib/server/jobs";
export async function GET() {
  try {
    const { client } = await requireUser();
    const { data, error } = await client
      .from("jobs")
      .select("id,kind,status,progress,attempts,error,result,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ jobs: data });
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
    if (raw.action === "cancel" || raw.action === "retry") {
      const id = z.uuid().parse(raw.id);
      const { data: job } = await db
        .from("jobs")
        .select("status")
        .eq("id", id)
        .eq("owner_id", user.id)
        .single();
      if (!job) throw new Error("Job unavailable.");
      if (raw.action === "cancel") {
        await db
          .from("jobs")
          .update({
            cancel_requested: true,
            ...(job.status === "queued" ? { status: "cancelled" } : {}),
          })
          .eq("id", id)
          .eq("owner_id", user.id);
      } else if (["failed", "cancelled"].includes(job.status))
        await db
          .from("jobs")
          .update({
            status: "queued",
            attempts: 0,
            cancel_requested: false,
            error: null,
            available_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("owner_id", user.id);
      return Response.json({ ok: true });
    }
    const input = JobInput.parse(raw);
    if (
      input.kind === "import" &&
      !input.payload.objectKey.startsWith(user.id + "/")
    )
      throw new Error("Invalid staging ownership.");
    if (input.kind === "metadata") {
      const w = await loadWorkspace(user.id);
      if (!w.sources.some((s) => s.id === input.payload.sourceId))
        throw new Error("Source unavailable.");
    }
    const { data: allowed } = await db.rpc("consume_quota", {
      p_owner: user.id,
      p_bucket: "jobs",
      p_limit: 200,
    });
    if (!allowed)
      return Response.json(
        { error: "Daily job allowance reached." },
        { status: 429 },
      );
    const { data, error } = await db
      .from("jobs")
      .upsert(
        {
          owner_id: user.id,
          kind: input.kind,
          payload: input.payload,
          idempotency_key: input.idempotencyKey,
        },
        { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data) return Response.json(data);
    const old = await db
      .from("jobs")
      .select("id")
      .eq("owner_id", user.id)
      .eq("idempotency_key", input.idempotencyKey)
      .single();
    return Response.json(old.data);
  } catch (e) {
    return apiError(e);
  }
}
