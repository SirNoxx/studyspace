import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError, loadWorkspace } from "@/lib/server/repository";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const w = await loadWorkspace(user.id);
    const a = w.attachments.find(
      (a) =>
        a.id === id &&
        (!a.trashed ||
          new URL(_request.url).searchParams.get("includeTrashed") === "1"),
    );
    if (!a || !a.key.startsWith(user.id + "/"))
      return new Response("Unavailable", { status: 404 });
    const { data, error } = await adminClient()
      .storage.from("attachments")
      .download(a.key);
    if (error || !data) return new Response("Unavailable", { status: 404 });
    return new Response(data.stream(), {
      headers: {
        "Content-Type": a.mime || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
