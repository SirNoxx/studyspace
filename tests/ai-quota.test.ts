import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { quotaEntries, studyCost } from "../src/lib/server/ai-quota";
import { buildAIContext } from "../src/lib/server/ai";
import { emptyWorkspace } from "../src/lib/model";
import { createNote } from "../src/lib/domain";
afterEach(() => vi.unstubAllEnvs());
it("hashes identifiers, ignores untrusted forwarding, and groups IPv6 privacy addresses", () => {
  vi.stubEnv("AI_QUOTA_SECRET", "test-secret"); vi.stubEnv("VERCEL", ""); vi.stubEnv("AI_TRUSTED_IP_HEADER", "");
  const request = (ip: string) => new Request("https://example.com/api/ai", { headers: { "x-forwarded-for": ip, "x-vercel-forwarded-for": ip } });
  expect(quotaEntries(request("1.2.3.4"), undefined, 100)).toEqual(quotaEntries(request("9.8.7.6"), undefined, 100));
  vi.stubEnv("VERCEL", "1");
  expect(quotaEntries(request("2001:db8:1:2::1"), undefined, 100)[2].key).toBe(quotaEntries(request("2001:db8:1:2::99"), undefined, 100)[2].key);
  expect(JSON.stringify(quotaEntries(request("1.2.3.4"), "private-account", 100))).not.toMatch(/1\.2\.3\.4|private-account/);
});
it("budgets every section, conversation and maximum output before dispatch", () => {
  const w = emptyWorkspace(), note = createNote(w, undefined, { body: "a".repeat(50000) });
  const input = { action: "summarize" as const, scope: "note" as const, noteId: note.id, expectedRevision: note.revision };
  const context = buildAIContext(w, input);
  expect(studyCost(input, context)).toBeGreaterThan(50000 + 3 * 3500);
  expect(studyCost({ ...input, history: [{ question: "Hello", answer: "Explain" }] }, context)).toBeGreaterThan(studyCost(input, context));
});
it("Postgres atomically enforces budgets and prevents client access", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec(await readFile("supabase/migrations/20260929010000_free_ai_usage.sql", "utf8"));
    const entry = (key: string, cost = 4) => ({ key, window: "day", requests: 10, tokens: 10, cost, reason: "daily" });
    const reserve = async (entries: unknown[]) => (await db.query<{ value: { allowed: boolean } }>("select reserve_ai_usage($1::jsonb) as value", [JSON.stringify(entries)])).rows[0].value;
    expect((await reserve([entry("a"), entry("global")])).allowed).toBe(true);
    expect((await reserve([entry("a"), entry("global")])).allowed).toBe(true);
    expect((await reserve([entry("fresh-device"), entry("global")])).allowed).toBe(false);
    expect((await db.query("select * from ai_usage_buckets where bucket='day:fresh-device'")).rows).toHaveLength(0);
    expect((await db.query<{ tokens: number }>("select tokens from ai_usage_buckets where bucket='day:global'")).rows[0].tokens).toBe(8);
    await db.exec("set role anon");
    await expect(db.query("select reserve_ai_usage('[]'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from ai_usage_buckets")).rejects.toThrow(/permission denied/);
  } finally { await db.close(); }
}, 30000);
