import {
  PublicationInput,
  publishApprovedSnapshot,
} from "@/lib/server/publish";
import { z } from "zod";
import { adminClient, configured, requireUser } from "@/lib/supabase/server";
import {
  apiError,
  assertSameOrigin,
  loadWorkspace,
} from "@/lib/server/repository";
import { publicSnapshot, makeStudyCopy } from "@/lib/server/publications";
import { prepareSnapshot, fingerprint } from "@/lib/domain";
import { uid, inContainer } from "@/lib/model";
import { publicationExport } from "@/lib/publication-export";
import { sha256 } from "@/lib/transfer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!configured()) return Response.json({ publications: [] });
    const url = new URL(request.url),
      id = url.searchParams.get("id");
    if (id) {
      z.uuid().parse(id);
      const result = await publicSnapshot(id);
      if (!result)
        return Response.json(
          { error: "Publication unavailable." },
          { status: 404 },
        );
      if (url.searchParams.get("versions") === "1") {
        const { data, error } = await adminClient()
          .from("publication_versions")
          .select("payload")
          .eq("publication_id", id)
          .order("version", { ascending: false })
          .limit(100);
        if (error) throw error;
        return Response.json(
          { versions: (data ?? []).map((v) => v.payload) },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (url.searchParams.get("download") === "1") {
        if (!result.snapshot.allowDownload)
          return Response.json(
            { error: "Downloads are disabled." },
            { status: 403 },
          );
        const stream = publicationExport(result.snapshot, async (asset) => {
          const { data, error } = await adminClient()
            .storage.from("publication-assets")
            .download(
              result.snapshot.publicationId +
                "/" +
                result.snapshot.id +
                "/" +
                asset.id,
            );
          if (error || !data) throw new Error("Published file unavailable.");
          return new Uint8Array(await data.arrayBuffer());
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition":
              'attachment; filename="studyspace-publication.zip"',
            "Cache-Control": "no-store",
          },
        });
      }
      return Response.json(
        { snapshot: result.snapshot },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { data, error } = await adminClient().rpc("discover_publications", {
      p_query: z
        .string()
        .max(500)
        .parse(url.searchParams.get("q") ?? ""),
      p_category: z
        .string()
        .max(100)
        .parse(url.searchParams.get("category") ?? "all"),
      p_sort: url.searchParams.get("sort") === "popular" ? "popular" : "newest",
    });
    if (error) throw error;
    return Response.json(
      { publications: data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const db = adminClient();
    const { data: profile } = await db
      .from("profiles")
      .select("suspended")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.suspended)
      return Response.json(
        { error: "Public posting is suspended for this account." },
        { status: 403 },
      );
    const raw = await request.json();
    if (raw.action === "unpublish") {
      const id = z.uuid().parse(raw.publicationId);
      const { error } = await db
        .from("publications")
        .update({ status: "unpublished" })
        .eq("id", id)
        .eq("owner_id", user.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (raw.action === "copy") {
      const input = z
        .object({ publicationId: z.uuid(), idempotencyKey: z.uuid() })
        .parse(raw);
      const source = await publicSnapshot(input.publicationId);
      if (!source || !source.snapshot.allowCopies)
        return Response.json(
          { error: "Study copies are unavailable." },
          { status: 403 },
        );
      if (
        source.snapshot.notes.length > 50 ||
        source.snapshot.attachments?.length
      ) {
        const { error } = await db.from("jobs").upsert(
          {
            owner_id: user.id,
            kind: "copy",
            payload: {
              publicationId: input.publicationId,
              copyId: input.idempotencyKey,
            },
            idempotency_key: input.idempotencyKey,
          },
          { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true },
        );
        if (error) throw error;
        const { data: job, error: lookupError } = await db
          .from("jobs")
          .select("id")
          .eq("owner_id", user.id)
          .eq("idempotency_key", input.idempotencyKey)
          .single();
        if (lookupError) throw lookupError;
        return Response.json({ jobId: job.id }, { status: 202 });
      }
      const containerId = await makeStudyCopy(
        user.id,
        input.publicationId,
        input.idempotencyKey,
      );
      return Response.json({ containerId });
    }
    const input = PublicationInput.parse(raw);
    if (input.selection.attachmentIds.length || input.ids.length > 50) {
      const { data, error } = await db
        .from("jobs")
        .upsert(
          {
            owner_id: user.id,
            kind: "publication",
            payload: input,
            idempotency_key: input.fields.id,
          },
          { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error) throw error;
      const job =
        data ??
        (
          await db
            .from("jobs")
            .select("id")
            .eq("owner_id", user.id)
            .eq("idempotency_key", input.fields.id)
            .single()
        ).data;
      return Response.json({ jobId: job?.id }, { status: 202 });
    }
    return Response.json({
      snapshot: await publishApprovedSnapshot(user.id, input),
    });
  } catch (e) {
    return apiError(e);
  }
}
