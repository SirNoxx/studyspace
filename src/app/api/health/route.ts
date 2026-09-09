import { configured, adminClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!configured())
    return Response.json({
      status: "local-demo",
      database: "not-configured",
      ai: "not-configured",
    });
  try {
    const { error } = await adminClient()
      .from("workspaces")
      .select("owner_id", { head: true, count: "exact" });
    return Response.json(
      {
        status: error ? "degraded" : "ok",
        database: error ? "unavailable" : "ok",
        ai:
          process.env.AI_API_KEY && process.env.AI_MODEL
            ? "configured"
            : "not-configured",
      },
      { status: error ? 503 : 200 },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "configuration-error" },
      { status: 503 },
    );
  }
}
