import {
  type WorkbookRecord,
  type WorkbookSnapshot,
  validateSnapshot,
} from "./model";
import { sharedWorkbookContent } from "./shared-view";
export interface SharedWorkbookTarget {
  collection: string;
  note: string;
  scope: string;
}
function record(
  target: SharedWorkbookTarget,
  row: {
    id: string;
    snapshot: WorkbookSnapshot;
    revision: number;
    updated_at: string;
    note_id?: string;
  },
): WorkbookRecord {
  validateSnapshot(row.snapshot);
  return {
    version: 1,
    engineVersion: "0.25.1",
    id: row.id,
    scope: target.scope,
    noteId: row.note_id ?? target.note,
    snapshot: row.snapshot,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
export async function readSharedWorkbook(
  target: SharedWorkbookTarget,
  id: string,
  revision?: number,
) {
  const response = await fetch(
      `/api/shared/spreadsheets?id=${id}&collection=${target.collection}${revision === undefined ? "" : "&revision=" + revision}`,
      { cache: "no-store" },
    ),
    data = await response.json();
  if (!response.ok)
    throw Object.assign(Error(data.error), { status: response.status });
  return {
    record: data.workbook ? record(target, data.workbook) : undefined,
    readOnly: !!data.readOnly,
  };
}
export async function writeSharedWorkbook(
  target: SharedWorkbookTarget,
  current: WorkbookRecord,
) {
  // One durable operation ID survives retries. It is never reused for a different edit.
  const body = JSON.stringify({
    id: current.id,
    collection: target.collection,
    note: target.note,
    revision: current.revision,
    requestId: crypto.randomUUID(),
    snapshot: sharedWorkbookContent(current.snapshot),
  });
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/shared/spreadsheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
        data = await response.json();
      if (!response.ok)
        throw Object.assign(Error(data.error), { status: response.status });
      return record(target, data.workbook);
    } catch (e) {
      last = e;
      if ((e as { status?: number }).status) throw e;
    }
  }
  throw last;
}
