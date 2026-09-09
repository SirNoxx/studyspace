import { enrichMetadata } from "../src/lib/server/metadata";
import { writeFile, mkdir } from "node:fs/promises";
const results = [];
for (const input of [
  "10.1038/nphys1170",
  "arXiv:2303.08774v2",
  "9780306406157",
]) {
  const start = Date.now();
  try {
    const data = await enrichMetadata(input);
    results.push({
      input,
      status: "live-success",
      provider: data.provider,
      title: data.title,
      metadataStatus: data.status,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    results.push({
      input,
      status: "live-failed",
      error: (e as Error).message,
      durationMs: Date.now() - start,
    });
  }
}
await mkdir("docs/evidence", { recursive: true });
await writeFile(
  "docs/evidence/metadata-smoke.json",
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
console.log(JSON.stringify(results, null, 2));
