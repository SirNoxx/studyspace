import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import type { QuotaEntry, QuotaResult } from "./ai-quota";

/** Development only. A filesystem lock serializes reservations across local Next workers. Production always uses Postgres. */
export async function reserveDevelopmentAI(
  entries: QuotaEntry[],
): Promise<QuotaResult> {
  if (process.env.NODE_ENV !== "development")
    throw Error("AI_LIMITER_UNAVAILABLE");
  const dir = join(process.cwd(), ".next", "cache");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "studyspace-ai-usage.json"),
    lock = path + ".lock";
  let handle;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      handle = await open(lock, "wx");
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!handle) throw Error("AI_LIMITER_UNAVAILABLE");
  try {
    const current = Date.now(),
      day = Math.floor(current / 86400000),
      minute = Math.floor(current / 60000);
    let ledger: Record<
      string,
      { requests: number; tokens: number; expires: number }
    > = {};
    try {
      ledger = JSON.parse(await readFile(path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    for (const [key, value] of Object.entries(ledger))
      if (value.expires <= current) delete ledger[key];
    const keys = entries.map(
      (entry) =>
        `${entry.window}:${entry.window === "day" ? day : minute}:${entry.key}`,
    );
    for (const [i, entry] of entries.entries()) {
      const used = ledger[keys[i]];
      if (
        (used?.requests ?? 0) + 1 > entry.requests ||
        (used?.tokens ?? 0) + entry.cost > entry.tokens
      )
        return {
          allowed: false,
          reason:
            (used?.tokens ?? 0) + entry.cost > entry.tokens
              ? entry.reason === "global"
                ? "global"
                : "processing"
              : entry.reason,
          reset: new Date(
            (entry.window === "day" ? day + 1 : minute + 1) *
              (entry.window === "day" ? 86400000 : 60000),
          ).toISOString(),
        };
    }
    entries.forEach((entry, i) => {
      const used = ledger[keys[i]];
      ledger[keys[i]] = {
        requests: (used?.requests ?? 0) + 1,
        tokens: (used?.tokens ?? 0) + entry.cost,
        expires:
          (entry.window === "day" ? day + 1 : minute + 1) *
          (entry.window === "day" ? 86400000 : 60000),
      };
    });
    await writeFile(path + ".tmp", JSON.stringify(ledger));
    await rename(path + ".tmp", path);
    return {
      allowed: true,
      remaining: entries[0].requests - ledger[keys[0]].requests,
      reset: new Date((day + 1) * 86400000).toISOString(),
    };
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
