import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
export async function GET(request: Request) {
  try {
    const { client } = await requireUser(),
      url = new URL(request.url);
    const { data, error } = await client.rpc("shared_workspace_history", {
      p_id: z.uuid().parse(url.searchParams.get("collection")),
      p_note: z.uuid().parse(url.searchParams.get("note")),
    });
    if (error) throw error;
    return Response.json(
      { items: data },
      { headers: { "Cache-Control": "private,no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "History is unavailable. Check your connection and collection access.",
      },
      { status: 403 },
    );
  }
}
