import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin, apiError } from "@/lib/server/repository";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client, user } = await requireUser();
    const input = z
      .object({
        collection: z.uuid(),
        filename: z.string().min(1).max(240),
        mime: z.string().max(120),
        size: z.number().int().min(0).max(52428800),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(await request.json());
    const access = await client.rpc("shared_access", {
      a: input.collection,
      writing: true,
    });
    if (access.error || !access.data)
      return Response.json(
        { error: "You cannot add attachments to this collection." },
        { status: 403 },
      );
    const id = crypto.randomUUID(),
      key =
        input.collection +
        "/" +
        id +
        "/" +
        input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const admin = adminClient();
    const saved = await admin.rpc("shared_workspace_asset_reserve", {
      p_id: input.collection,
      p_actor: user.id,
      p_asset: id,
      p_filename: input.filename,
      p_mime: input.mime,
      p_size: input.size,
      p_hash: input.hash,
      p_key: key,
    });
    if (saved.error) throw saved.error;
    const signed = await admin.storage
      .from("shared-workspace-assets")
      .createSignedUploadUrl(key);
    if (signed.error) throw signed.error;
    return Response.json(
      {
        asset: {
          id,
          filename: input.filename,
          mime: input.mime,
          size: input.size,
          hash: input.hash,
          key,
          createdAt: new Date().toISOString(),
        },
        uploadUrl: signed.data.signedUrl,
      },
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
