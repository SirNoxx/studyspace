import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (process.env.SOCIAL_ENABLED === "false")
    return new Response("Community is temporarily unavailable", {
      status: 503,
    });
  try {
    const { client } = await requireUser();
    const id = z.uuid().parse((await context.params).id);
    // Session client + RLS: every download rechecks membership. No signed URL.
    const { data, error } = await client
      .from("shared_assets")
      .select("filename,mime,content")
      .eq("id", id)
      .maybeSingle();
    if (error || !data)
      return new Response("File unavailable", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    const bytes = Buffer.from(data.content.replace(/^\\x/, ""), "hex");
    return new Response(bytes, {
      headers: {
        "Content-Type": data.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Sign in to download this file", {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
