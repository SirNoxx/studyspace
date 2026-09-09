import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/server/repository";
export async function GET(request: Request) {
  try {
    const { user } = await requireUser(),
      url = new URL(request.url),
      query = z
        .string()
        .max(500)
        .parse(url.searchParams.get("q") ?? ""),
      container = z.uuid().nullable().parse(url.searchParams.get("container"));
    const tokens = query.split(/\s+/),
      tags = tokens.filter((t) => t.startsWith("#")).map((t) => t.slice(1)),
      kind = tokens.find((t) => t.startsWith("type:"))?.slice(5),
      after = tokens.find((t) => t.startsWith("after:"))?.slice(6);
    const { data, error } = await adminClient().rpc("search_workspace", {
      p_owner: user.id,
      p_query: tokens
        .filter(
          (t) =>
            !t.startsWith("#") &&
            !t.startsWith("type:") &&
            !t.startsWith("after:"),
        )
        .join(" "),
      p_container: container,
      p_tags: tags,
      p_kind: kind ?? null,
      p_after: after ?? null,
    });
    if (error) throw error;
    return Response.json(
      { notes: data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
