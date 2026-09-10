import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const migrationsDirectory = new URL(
  "../../supabase/migrations/",
  import.meta.url,
);

export async function applyMigrations(
  db: PGlite,
  after = "",
  through = "\uffff",
) {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql") && file > after && file <= through)
    .sort();
  for (const file of files) {
    const sql = (
      await readFile(new URL(file, migrationsDirectory), "utf8")
    ).replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
  }
}

export async function createTestDatabase(through?: string) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql as
        $$select string_to_array($1,'/')$$;
      grant usage on schema storage to anon,authenticated,service_role;
      grant select,insert,delete on storage.objects to anon,authenticated;
      -- Reproduce the hosted project's default ACLs, including TRUNCATE and
      -- inherited EXECUTE. Minimal Postgres defaults miss these vulnerabilities.
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    `);
    await applyMigrations(db, "", through);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function asDatabaseRole<T>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  id: string | null,
  fn: () => Promise<T>,
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
