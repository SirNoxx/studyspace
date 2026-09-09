import { adminClient } from "../supabase/server";
export async function sweepStorage() {
  const db = adminClient(),
    grace =
      Math.max(72, Number(process.env.ORPHAN_GRACE_HOURS ?? 72)) * 3600000,
    cutoff = Date.now() - grace,
    retention =
      Math.max(1, Number(process.env.EXPORT_RETENTION_DAYS ?? 7)) * 86400000;
  const { data: exports, error: exportError } = await db
    .from("jobs")
    .select("id,result")
    .eq("kind", "export")
    .eq("status", "succeeded")
    .or("result->>expired.is.null,result->>expired.eq.false")
    .lt("updated_at", new Date(Date.now() - retention).toISOString())
    .limit(1000);
  if (exportError) throw exportError;
  for (const job of exports ?? []) {
    if (job.result?.expired) continue;
    const { error } = await db
      .from("jobs")
      .update({ result: { ...job.result, expired: true } })
      .eq("id", job.id);
    if (error) throw error;
  }
  let removed = 0;
  for (const bucket of ["attachments", "publication-assets"]) {
    const candidates: string[] = [];
    const walk = async (prefix: string) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.storage.from(bucket).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        for (const object of data ?? []) {
          const key = prefix ? prefix + "/" + object.name : object.name;
          if (!object.id) await walk(key);
          else if (object.created_at && Date.parse(object.created_at) < cutoff)
            candidates.push(key);
        }
        if ((data?.length ?? 0) < 1000) break;
      }
    };
    await walk("");
    for (const key of candidates) {
      const { data: claimed, error } = await db.rpc("claim_orphan_object", {
        p_bucket: bucket,
        p_key: key,
      });
      if (error) throw error;
      if (claimed) {
        const deletion = await db.storage.from(bucket).remove([key]);
        if (deletion.error) throw deletion.error;
        removed++;
      }
    }
  }
  return { removed };
}
