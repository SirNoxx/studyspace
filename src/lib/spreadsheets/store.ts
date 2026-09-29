import { openDB } from "idb";
import {
  validateSnapshot,
  type WorkbookRecord,
  type WorkbookSnapshot,
} from "./model";

const db = () =>
  openDB("studyspace-sheets-v1", 2, {
    upgrade(database) {
      for (const name of ["workbooks", "history", "originals", "recovery"])
        if (!database.objectStoreNames.contains(name))
          database.createObjectStore(name);
    },
    blocking(_current, _blocked, event) {
      (event.target as IDBDatabase)?.close();
    },
  });
const key = (scope: string, id: string) => JSON.stringify([scope, id]);
export async function clearWorkbookScope(scope: string) {
  const database = await db(),
    tx = database.transaction(
      ["workbooks", "history", "originals", "recovery"],
      "readwrite",
    );
  for (const name of ["workbooks", "history", "originals", "recovery"]) {
    let cursor = await tx.objectStore(name).openCursor();
    while (cursor) {
      const storedKey = String(cursor.key);
      if (storedKey.startsWith(JSON.stringify([scope]).slice(0, -1) + ","))
        await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}
export async function saveRecovery(record: WorkbookRecord) {
  return (await db()).put("recovery", record, key(record.scope, record.id));
}
export async function loadRecovery(
  scope: string,
  id: string,
): Promise<WorkbookRecord | undefined> {
  return (await db()).get("recovery", key(scope, id));
}
export async function clearRecovery(scope: string, id: string) {
  return (await db()).delete("recovery", key(scope, id));
}
export async function loadWorkbook(
  scope: string,
  id: string,
): Promise<WorkbookRecord | undefined> {
  return (await db()).get("workbooks", key(scope, id));
}
export async function saveWorkbook(
  record: WorkbookRecord,
  expected: number,
): Promise<WorkbookRecord> {
  validateSnapshot(record.snapshot);
  const database = await db();
  const tx = database.transaction(["workbooks", "history"], "readwrite");
  const id = key(record.scope, record.id);
  const previous = (await tx.objectStore("workbooks").get(id)) as
    WorkbookRecord | undefined;
  if ((previous?.revision ?? 0) !== expected) {
    tx.abort();
    await tx.done.catch(() => {});
    throw Error(
      "This spreadsheet changed in another window. Export your current copy before reloading the saved version.",
    );
  }
  const next: WorkbookRecord = {
    ...record,
    revision: expected + 1,
    updatedAt: new Date().toISOString(),
  };
  if (previous)
    await tx.objectStore("history").put(previous, `${id}:${previous.revision}`);
  if (next.revision > 20)
    await tx.objectStore("history").delete(`${id}:${next.revision - 20}`);
  await tx.objectStore("workbooks").put(next, id);
  await tx.done;
  return next;
}
export async function workbookHistory(
  scope: string,
  id: string,
): Promise<WorkbookRecord[]> {
  const current = await loadWorkbook(scope, id);
  if (!current) return [];
  const database = await db();
  const records = await Promise.all(
    Array.from({ length: Math.min(19, current.revision - 1) }, (_, i) =>
      database.get("history", `${key(scope, id)}:${current.revision - i - 1}`),
    ),
  );
  return records.filter(Boolean) as WorkbookRecord[];
}
export async function keepOriginal(scope: string, id: string, file: File) {
  await (
    await db()
  ).put(
    "originals",
    { name: file.name, bytes: await file.arrayBuffer() },
    key(scope, id),
  );
}
export async function loadOriginal(
  scope: string,
  id: string,
): Promise<{ name: string; bytes: ArrayBuffer } | undefined> {
  return (await db()).get("originals", key(scope, id));
}
export async function initializeWorkbook(
  scope: string,
  id: string,
  noteId: string,
  snapshot: WorkbookSnapshot,
) {
  const existing = await loadWorkbook(scope, id);
  if (existing?.noteId === noteId) return existing;
  if (existing?.noteId === "")
    return saveWorkbook({ ...existing, noteId }, existing.revision);
  // A copied module is an independent workbook; the source remains untouched.
  const copyId = existing ? crypto.randomUUID() : id;
  return saveWorkbook(
    {
      version: 1,
      engineVersion: "0.25.1",
      id: copyId,
      scope,
      noteId,
      revision: 0,
      updatedAt: "",
      snapshot: { ...(existing?.snapshot ?? snapshot), id: copyId },
    },
    0,
  );
}
