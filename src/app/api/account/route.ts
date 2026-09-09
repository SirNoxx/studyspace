import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin, apiError } from "@/lib/server/repository";
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, client } = await requireUser();
    const { password, confirmation } = z
      .object({
        password: z.string().min(1),
        confirmation: z.literal("DELETE MY ACCOUNT"),
      })
      .parse(await request.json());
    if (!user.email)
      throw new Error("Password revalidation is unavailable for this account.");
    const { error: authError } = await client.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (authError)
      return Response.json(
        { error: "Password revalidation failed. No data was deleted." },
        { status: 403 },
      );
    const db = adminClient();
    const { data: publications } = await db
      .from("publications")
      .select("id")
      .eq("owner_id", user.id);
    await db
      .from("publications")
      .update({ status: "unpublished" })
      .eq("owner_id", user.id);
    await db
      .from("jobs")
      .update({ cancel_requested: true, status: "cancelled" })
      .eq("owner_id", user.id);
    async function removeObjects(prefix: string, bucket = "attachments") {
      const { data, error } = await db.storage
        .from(bucket)
        .list(prefix, { limit: 1000 });
      if (error) throw error;
      for (const obj of data ?? []) {
        const path = prefix + "/" + obj.name;
        if (obj.id) {
          const { error } = await db.storage.from(bucket).remove([path]);
          if (error) throw error;
        } else await removeObjects(path, bucket);
      }
      if ((data?.length ?? 0) === 1000) await removeObjects(prefix, bucket);
    }
    await removeObjects(user.id);
    for (const p of publications ?? [])
      await removeObjects(p.id, "publication-assets");
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
    await client.auth.signOut();
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
