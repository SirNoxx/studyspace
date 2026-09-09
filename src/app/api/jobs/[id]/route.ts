import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/server/repository";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const db = adminClient();
    const { data: job } = await db
      .from("jobs")
      .select("result,status")
      .eq("id", id)
      .eq("owner_id", user.id)
      .single();
    if (
      job?.status !== "succeeded" ||
      job.result?.expired ||
      !String(job.result?.objectKey).startsWith(user.id + "/")
    )
      return new Response("Unavailable", { status: 404 });
    const { data, error } = await db.storage
      .from("attachments")
      .download(job.result.objectKey);
    if (error || !data) throw error;
    return new Response(data.stream(), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="studyspace-backup.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
