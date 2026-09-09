import { z } from "zod";
import { adminClient } from "@/lib/supabase/server";
import { publicSnapshot } from "@/lib/server/publications";
import type { Snapshot } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ publicationId: string; versionId: string; id: string }>;
  },
) {
  try {
    const { publicationId, versionId, id } = z
      .object({ publicationId: z.uuid(), versionId: z.uuid(), id: z.uuid() })
      .parse(await params);
    if (!(await publicSnapshot(publicationId)))
      return new Response("Unavailable", { status: 404 });
    const db = adminClient();
    const { data: version } = await db
      .from("publication_versions")
      .select("payload")
      .eq("id", versionId)
      .eq("publication_id", publicationId)
      .single();
    const asset = (version?.payload as Snapshot | undefined)?.attachments?.find(
      (a) => a.id === id,
    );
    if (!asset) return new Response("Unavailable", { status: 404 });
    const { data, error } = await db.storage
      .from("publication-assets")
      .download(`${publicationId}/${versionId}/${id}`);
    if (error || !data) return new Response("Unavailable", { status: 404 });
    return new Response(data.stream(), {
      headers: {
        "Content-Type": asset.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 404 });
  }
}
