import { requireUser, adminClient } from "@/lib/supabase/server";
import { apiError, loadWorkspace } from "@/lib/server/repository";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, client } = await requireUser();
    const { id } = await params;
    const shared = await client.from("shared_workspace_assets").select("id,key,mime,filename").eq("id",id).maybeSingle();
    if(shared.data) {
      const download=await adminClient().storage.from("shared-workspace-assets").download(shared.data.key);
      if(download.error || !download.data)return new Response("Unavailable",{status:404});
      return new Response(download.data.stream(),{headers:{"Content-Type":shared.data.mime,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(shared.data.filename)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private,no-store"}});
    }
    const legacy=await client.from("shared_assets").select("content,mime,filename").eq("id",id).maybeSingle();
    if(legacy.data) {
      const bytes=Buffer.from(legacy.data.content.replace(/^\\x/,""),"hex");
      return new Response(bytes,{headers:{"Content-Type":legacy.data.mime,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(legacy.data.filename)}`,"X-Content-Type-Options":"nosniff","Cache-Control":"private,no-store"}});
    }
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
