import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { sha256, safePath } from "../src/lib/transfer";
const [operation, directory] = process.argv.slice(2),
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!["backup", "restore"].includes(operation) || !directory || !url || !key)
  throw new Error(
    "Usage: node --import tsx --env-file=.env.local scripts/storage-backup.ts backup|restore DIRECTORY. Server Supabase configuration is required.",
  );
const root = resolve(directory),
  db = createClient(url, key, { auth: { persistSession: false } }),
  pathFor = (bucket: string, name: string) => {
    const path = resolve(root, bucket, safePath(name));
    if (!path.startsWith(root + sep)) throw new Error("Unsafe backup path.");
    return path;
  };
type Entry = {
  bucket: string;
  name: string;
  hash: string;
  size: number;
  mime: string;
};
if (operation === "backup") {
  await mkdir(root, { recursive: true });
  const files: Entry[] = [];
  for (const bucket of ["attachments", "publication-assets"]) {
    const list = async (prefix: string) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.storage.from(bucket).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        for (const object of data ?? []) {
          const name = prefix ? prefix + "/" + object.name : object.name;
          if (!object.id) {
            await list(name);
            continue;
          }
          const { data: blob, error: e } = await db.storage
            .from(bucket)
            .download(name);
          if (e || !blob) throw new Error("Object download failed.");
          const bytes = new Uint8Array(await blob.arrayBuffer()),
            path = pathFor(bucket, name);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, bytes);
          files.push({
            bucket,
            name,
            hash: await sha256(bytes),
            size: bytes.length,
            mime: blob.type || "application/octet-stream",
          });
        }
        if ((data?.length ?? 0) < 1000) break;
      }
    };
    await list("");
  }
  await writeFile(
    resolve(root, "storage-manifest.json"),
    JSON.stringify(
      { schema: 1, source: url, createdAt: new Date().toISOString(), files },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ operation, objects: files.length }));
} else {
  const manifest = JSON.parse(
    await readFile(resolve(root, "storage-manifest.json"), "utf8"),
  );
  if (
    manifest.schema !== 1 ||
    process.env.RESTORE_CONFIRM_PROJECT !== url ||
    url === manifest.source
  )
    throw new Error(
      "Restore requires a DIFFERENT isolated target URL and RESTORE_CONFIRM_PROJECT equal to that URL. Restore the database/auth backup and migrations first.",
    );
  for (const file of manifest.files as Entry[]) {
    if (!["attachments", "publication-assets"].includes(file.bucket))
      throw new Error("Invalid bucket.");
    const bytes = new Uint8Array(
      await readFile(pathFor(file.bucket, file.name)),
    );
    if (bytes.length !== file.size || (await sha256(bytes)) !== file.hash)
      throw new Error("Backup checksum mismatch.");
    const { error } = await db.storage
      .from(file.bucket)
      .upload(file.name, bytes, {
        contentType: file.mime,
        upsert: false,
        cacheControl: "0",
      });
    if (error) throw error;
    const { data } = await db.storage.from(file.bucket).download(file.name);
    if (
      !data ||
      (await sha256(new Uint8Array(await data.arrayBuffer()))) !== file.hash
    )
      throw new Error("Restored object verification failed.");
  }
  console.log(
    JSON.stringify({
      operation,
      objects: manifest.files.length,
      verified: true,
    }),
  );
}
