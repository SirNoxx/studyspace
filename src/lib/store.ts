"use client";
import { openDB } from "idb";
import type { Workspace } from "./model";
import { emptyWorkspace } from "./model";
import { sampleWorkspace } from "./demo";
import { validateWorkspace } from "./domain";
import { makePatch } from "./workspace-patch";
export async function localDB() {
  return openDB("studyspace-device-v1", 1, {
    upgrade(db) {
      db.createObjectStore("workspaces");
      db.createObjectStore("drafts");
      db.createObjectStore("assets");
      db.createObjectStore("navigation");
    },
  });
}
export async function loadLocal(sample = false) {
  const db = await localDB();
  let w = (await db.get("workspaces", "demo")) as Workspace | undefined;
  if (!w) {
    w = sample ? sampleWorkspace() : emptyWorkspace();
    await db.put("workspaces", w, "demo");
  }
  return w;
}
export async function persistLocal(w: Workspace, expected: number) {
  validateWorkspace(w);
  const db = await localDB();
  const tx = db.transaction("workspaces", "readwrite");
  const current = (await tx.store.get("demo")) as Workspace | undefined;
  if (current && current.revision !== expected) {
    tx.abort();
    throw new Error("CONFLICT");
  }
  const next = { ...w, revision: expected + 1 };
  await tx.store.put(next, "demo");
  await tx.done;
  return next.revision;
}
export async function saveRemote(
  w: Workspace,
  expected: number,
  base?: Workspace,
) {
  const json = JSON.stringify(
    base ? { patch: makePatch(w, base), expected } : { state: w, expected },
  );
  let body: BodyInit = json;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (json.length > 512000 && typeof CompressionStream !== "undefined") {
    body = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    headers["x-studyspace-compressed"] = "gzip";
  }
  if (
    typeof body !== "string" &&
    (body as ArrayBuffer).byteLength > 4 * 1024 * 1024
  )
    throw new Error(
      "This edit exceeds the hosted request limit. Export your retained draft and split the largest note.",
    );
  const response = await fetch("/api/workspace", {
    method: "PUT",
    headers,
    body,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(response.status === 409 ? "CONFLICT" : data.error);
  return data.revision as number;
}
export async function saveDraft(
  account: string,
  noteId: string,
  draft: unknown,
) {
  const db = await localDB();
  await db.put("drafts", draft, account + ":" + noteId);
}
export async function clearAccountCache(account: string) {
  const db = await localDB();
  for (const store of ["drafts", "navigation"] as const) {
    for (const key of await db.getAllKeys(store))
      if (String(key).startsWith(account + ":")) await db.delete(store, key);
  }
}
