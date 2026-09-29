import { validateSnapshot, type WorkbookSnapshot } from "./model";
import type { ICellData } from "@univerjs/core";

const canonical = (value: unknown): unknown =>
  !value || typeof value !== "object"
    ? value
    : Array.isArray(value)
      ? value.map(canonical)
      : Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        );
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
const source = (cell: Partial<ICellData> | undefined | null) =>
  cell?.f ? { ...cell, v: undefined, t: undefined } : cell;
function structure(snapshot: WorkbookSnapshot) {
  // Style IDs are hashes; registry additions can merge independently. Views
  // and calculated results do not constitute structural edits.
  const axis = (
    entries: Record<number, { ah?: number; hd?: number }> | undefined,
  ) =>
    Object.fromEntries(
      Object.entries(entries ?? {})
        .map(([id, row]) => {
          const { ah: _, ...manual } = row;
          if (manual.hd === 0) delete manual.hd;
          return [id, manual] as const;
        })
        .filter(([, row]) => Object.keys(row).length),
    );
  return {
    id: snapshot.id,
    name: snapshot.name,
    sheetOrder: snapshot.sheetOrder,
    resources: (snapshot.resources ?? []).filter(
      (r) =>
        ["SHEET_FILTER_PLUGIN", "SHEET_DEFINED_NAME_PLUGIN"].includes(r.name) &&
        !["{}", "[]", "", null].includes(r.data),
    ),
    sheets: Object.fromEntries(
      Object.entries(snapshot.sheets).map(([id, s]) => {
        return [
          id,
          {
            name: s.name,
            rowCount: s.rowCount,
            columnCount: s.columnCount,
            mergeData: s.mergeData ?? [],
            freeze: s.freeze?.xSplit || s.freeze?.ySplit ? s.freeze : null,
            custom: s.custom ?? null,
            hidden: s.hidden ?? 0,
            rowData: axis(s.rowData),
            columnData: axis(s.columnData),
          },
        ];
      }),
    ),
  };
}
export class SpreadsheetConflict extends Error {
  constructor(public readonly cells: string[]) {
    super(
      cells.length
        ? `Concurrent changes in ${cells.join(", ")}. Your edits are retained in a recovery copy.`
        : "The workbook structure changed. Reload the saved workbook before applying these edits.",
    );
  }
}
/** Three-way, cell-level merge. Structural edits use optimistic exclusivity.
 * A conflict rejects the entire batch; neither participant's source is lost. */
export function mergeWorkbook(
  base: WorkbookSnapshot,
  incoming: WorkbookSnapshot,
  current: WorkbookSnapshot,
): WorkbookSnapshot {
  validateSnapshot(base);
  validateSnapshot(incoming);
  validateSnapshot(current);
  if (base.id !== incoming.id || current.id !== base.id)
    throw Error("Workbook identity changed.");
  const oursStructure = !same(structure(base), structure(incoming));
  const theirsStructure = !same(structure(base), structure(current));
  if (theirsStructure && !same(incoming, current))
    throw new SpreadsheetConflict([]);
  if (oursStructure && !same(base, current)) throw new SpreadsheetConflict([]);
  if (oursStructure) return structuredClone(incoming);
  const next = structuredClone(current),
    conflicts: string[] = [];
  for (const id of incoming.sheetOrder) {
    const old = base.sheets[id].cellData,
      ours = incoming.sheets[id].cellData,
      theirs = current.sheets[id].cellData;
    for (const r of new Set([...Object.keys(old), ...Object.keys(ours)])) {
      for (const c of new Set([
        ...Object.keys(old[+r] ?? {}),
        ...Object.keys(ours[+r] ?? {}),
      ])) {
        const a = old[+r]?.[+c],
          b = ours[+r]?.[+c],
          live = theirs[+r]?.[+c];
        if (same(source(a), source(b))) continue;
        if (!same(source(a), source(live)) && !same(source(b), source(live))) {
          conflicts.push(`${id}:${+r + 1}:${+c + 1}`);
          continue;
        }
        const row = (next.sheets[id].cellData[+r] ??= {});
        if (b) row[+c] = structuredClone(b);
        else delete row[+c];
      }
    }
  }
  if (conflicts.length) throw new SpreadsheetConflict(conflicts.slice(0, 20));
  for (const [id, style] of Object.entries(incoming.styles)) {
    if (
      current.styles[id] &&
      !same(current.styles[id], style) &&
      !same(base.styles[id], current.styles[id])
    )
      throw new SpreadsheetConflict(["formatting"]);
    next.styles[id] = structuredClone(style);
  }
  validateSnapshot(next);
  return next;
}
