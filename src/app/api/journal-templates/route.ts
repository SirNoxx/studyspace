import { z } from "zod";
import { adminClient, configured, requireUser } from "@/lib/supabase/server";
import {
  apiError,
  assertSameOrigin,
  loadWorkspace,
} from "@/lib/server/repository";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!configured())
    return Response.json(
      {
        error:
          "Public templates are unavailable until the app is connected to Supabase. Your saved templates still work offline.",
      },
      { status: 503 },
    );
  try {
    const url = new URL(request.url);
    const kind = z
      .enum(["journal", "dream"])
      .parse(url.searchParams.get("kind") ?? "journal");
    const query = z
      .string()
      .max(100)
      .parse(url.searchParams.get("q") ?? "")
      .replace(/[\\%_]/g, "\\$&");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000)
      .parse(url.searchParams.get("page") ?? 0);
    let select = adminClient()
      .from("journal_templates")
      .select("id,title,body,kind,author,created_at", { count: "exact" })
      .eq("hidden", false)
      .eq("kind", kind);
    if (query) select = select.ilike("title", `%${query}%`);
    const { data, error, count } = await select
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 19);
    if (error) throw error;
    return Response.json({
      templates: data ?? [],
      hasMore: (count ?? 0) > (page + 1) * 20,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const input = z
      .object({
        title: z.string().trim().min(1).max(100),
        body: z.string().trim().min(1).max(50000),
        kind: z.enum(["journal", "dream"]),
      })
      .parse(await request.json());
    const w = await loadWorkspace(user.id);
    const { data: allowed, error: quotaError } = await adminClient().rpc(
      "consume_quota",
      { p_owner: user.id, p_bucket: "journal-templates", p_limit: 20 },
    );
    if (quotaError) throw quotaError;
    if (!allowed)
      return Response.json(
        {
          error: "Daily template publishing limit reached. Try again tomorrow.",
        },
        { status: 429 },
      );
    const { data, error } = await adminClient()
      .from("journal_templates")
      .insert({
        ...input,
        owner_id: user.id,
        author: (w.settings.displayName.trim() || "Studyspace member").slice(
          0,
          100,
        ),
      })
      .select("id,title,body,kind,author")
      .single();
    if (error) throw error;
    return Response.json({ template: data }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const { error } = await adminClient()
      .from("journal_templates")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
