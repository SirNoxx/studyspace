import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError, assertSameOrigin } from "@/lib/server/repository";
async function moderator() {
  const { user } = await requireUser();
  const db = adminClient();
  const { data } = await db
    .from("profiles")
    .select("moderator")
    .eq("id", user.id)
    .single();
  if (!data?.moderator) throw new Error("AUTH_REQUIRED");
  return { user, db };
}
export async function GET() {
  try {
    const { db } = await moderator();
    const { data, error } = await db
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return Response.json({ reports: data });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, db } = await moderator();
    const input = z
      .object({
        publicationId: z.uuid(),
        reportId: z.uuid().nullable(),
        action: z.enum(["hide", "restore"]),
      })
      .parse(await request.json());
    const { error } = await db.rpc("moderate_publication", {
      p_actor: user.id,
      p_publication: input.publicationId,
      p_action: input.action,
      p_report: input.reportId,
    });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
