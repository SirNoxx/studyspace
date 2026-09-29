import type { IWorkbookData, IWorksheetData, ICellData } from "@univerjs/core";

export type WorkbookSnapshot = Omit<IWorkbookData, "sheets"> & {
  sheets: Record<string, IWorksheetData>;
};
export interface SheetGroup {
  id: string;
  name: string;
  axis: "row" | "column";
  members: string[];
  collapsed: boolean;
}
export interface SheetMetadata {
  groups: SheetGroup[];
}
export const NETWORK_FORMULA =
  /\b(?:WEBSERVICE|IMPORTXML|IMPORTDATA|IMPORTRANGE|IMAGE|HYPERLINK)\s*\(|\[[^\]]+\]/i;
export function validateFormula(formula: string) {
  if (formula.length > 8192)
    throw Error("Formulas are limited to 8,192 characters.");
  if (NETWORK_FORMULA.test(formula))
    throw Error(
      "External workbook links and network formulas are not supported.",
    );
}
export interface WorkbookRecord {
  version: 1;
  engineVersion: "0.25.1";
  id: string;
  scope: string;
  noteId: string;
  revision: number;
  updatedAt: string;
  snapshot: WorkbookSnapshot;
}
export const SHEET_LIMITS = {
  bytes: 10 * 1024 * 1024,
  inflated: 100 * 1024 * 1024,
  cells: 100000,
  sheets: 20,
  rows: 100000,
  columns: 1024,
};
export function blankWorkbook(
  id: string,
  title = "Spreadsheet",
  seed?: { headers: string[]; rows: string[][] },
): WorkbookSnapshot {
  const cells: IWorksheetData["cellData"] = {};
  if (seed)
    [seed.headers, ...seed.rows].forEach((row, r) => {
      cells[r] = {};
      row.forEach((value, c) => {
        cells[r][c] = { v: value, t: 1 };
      });
    });
  return {
    id,
    name: title,
    appVersion: "0.25.1",
    locale: "enUS",
    styles: {},
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet 1",
        rowCount: Math.max(100, (seed?.rows.length ?? 0) + 20),
        columnCount: Math.max(20, seed?.headers.length ?? 0),
        cellData: cells,
      } as IWorksheetData,
    } as WorkbookSnapshot["sheets"],
  } as WorkbookSnapshot;
}
export function columnName(column: number): string {
  let name = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
export function cellAddress(row: number, column: number) {
  return `${columnName(column)}${row + 1}`;
}
export function metadata(sheet: IWorksheetData): SheetMetadata {
  const data = sheet.custom?.studyspace as SheetMetadata | undefined;
  return { groups: data?.groups ?? [] };
}
export function readableCell(
  cell: Partial<ICellData> | null | undefined,
): string {
  return (
    cell?.p?.body?.dataStream?.replace(/[\r\n]+$/, "") ??
    String(cell?.v ?? cell?.f ?? "")
  );
}
export function validateSnapshot(
  value: unknown,
): asserts value is WorkbookSnapshot {
  if (!value || typeof value !== "object") throw Error("Invalid workbook.");
  const w = value as WorkbookSnapshot;
  // Native backups are untrusted input too. Reject executable resources and
  // prototype keys before passing any snapshot to the engine.
  let nodes = 0;
  const inspect = (item: unknown, depth = 0): void => {
    if (++nodes > 4000000 || depth > 30)
      throw Error("Workbook metadata exceeds the supported limits.");
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw Error("Invalid workbook metadata key.");
      inspect(child, depth + 1);
    }
  };
  inspect(w);
  for (const resource of w.resources ?? []) {
    if (typeof resource.data !== "string" || resource.data.length > 2000000)
      throw Error("Invalid or excessive extension metadata.");
    if (resource.data) {
      try {
        inspect(JSON.parse(resource.data));
      } catch {
        throw Error("Invalid extension metadata.");
      }
    }
  }
  if (
    w.resources?.some(
      (r) =>
        ![
          "SHEET_AuthzIoMockService_PLUGIN",
          "SHEET_FILTER_PLUGIN",
          "SHEET_NUMFMT_PLUGIN",
          "SHEET_RANGE_PROTECTION_PLUGIN",
          "SHEET_WORKSHEET_PROTECTION_PLUGIN",
          "SHEET_WORKSHEET_PROTECTION_POINT_PLUGIN",
          "SHEET_DEFINED_NAME_PLUGIN",
          "SHEET_RANGE_THEME_MODEL_PLUGIN",
          "SHEET_FORMULA_REMOTE_PLUGIN",
          "SHEETS_FORMULA_PLUGIN",
          "SHEET_PERMISSION_PASTE_PLUGIN",
          "SHEET_PLUGIN",
        ].includes(r.name),
    )
  )
    throw Error(
      "This workbook contains unsupported extension resources: " +
        w.resources?.map((r) => r.name).join(", "),
    );
  if (
    !w.styles ||
    typeof w.styles !== "object" ||
    Object.keys(w.styles).length > 10000
  )
    throw Error("Invalid or excessive workbook styles.");
  if (
    typeof w.id !== "string" ||
    !Array.isArray(w.sheetOrder) ||
    !w.sheets ||
    w.sheetOrder.length < 1 ||
    w.sheetOrder.length > SHEET_LIMITS.sheets
  )
    throw Error("A workbook must contain 1–20 worksheets.");
  if (new Set(w.sheetOrder).size !== w.sheetOrder.length)
    throw Error("Duplicate worksheet IDs.");
  let count = 0;
  for (const id of w.sheetOrder) {
    const s = w.sheets[id];
    if (
      !s ||
      typeof s.name !== "string" ||
      !Number.isInteger(s.rowCount) ||
      s.rowCount < 1 ||
      s.rowCount > SHEET_LIMITS.rows ||
      !Number.isInteger(s.columnCount) ||
      s.columnCount < 1 ||
      s.columnCount > SHEET_LIMITS.columns
    )
      throw Error("Worksheet dimensions exceed the supported limits.");
    if (
      s.mergeData &&
      (!Array.isArray(s.mergeData) || s.mergeData.length > 10000)
    )
      throw Error("Too many merged ranges.");
    for (const range of s.mergeData ?? []) {
      if (
        ![
          range.startRow,
          range.endRow,
          range.startColumn,
          range.endColumn,
        ].every(Number.isInteger) ||
        range.startRow < 0 ||
        range.startColumn < 0 ||
        range.endRow >= s.rowCount ||
        range.endColumn >= s.columnCount ||
        range.endRow < range.startRow ||
        range.endColumn < range.startColumn
      )
        throw Error("Invalid merged range.");
    }
    const groups = s.custom?.studyspace?.groups;
    if (groups !== undefined) {
      if (!Array.isArray(groups) || groups.length > 500)
        throw Error("Invalid spreadsheet groups.");
      for (const group of groups) {
        if (
          !group ||
          typeof group.id !== "string" ||
          typeof group.name !== "string" ||
          group.name.length > 120 ||
          !["row", "column"].includes(group.axis) ||
          typeof group.collapsed !== "boolean" ||
          !Array.isArray(group.members) ||
          group.members.length > 100000 ||
          group.members.some((m: unknown) => typeof m !== "string")
        )
          throw Error("Invalid spreadsheet group.");
      }
    }
    for (const [r, row] of Object.entries(s.cellData ?? {})) {
      if (
        !/^\d+$/.test(r) ||
        +r >= s.rowCount ||
        !row ||
        typeof row !== "object"
      )
        throw Error("Invalid cell row.");
      for (const [c, cell] of Object.entries(
        row as Record<string, ICellData>,
      )) {
        if (
          !/^\d+$/.test(c) ||
          +c >= s.columnCount ||
          (cell !== null && typeof cell !== "object")
        )
          throw Error("Invalid cell column.");
        if (!cell) continue;
        if (++count > SHEET_LIMITS.cells)
          throw Error("Workbooks are limited to 100,000 populated cells.");
        if (
          (typeof cell.v === "string" && cell.v.length > 32767) ||
          (cell.p?.body?.dataStream?.length ?? 0) > 32769
        )
          throw Error("Cell text exceeds 32,767 characters.");
        if (cell.f) validateFormula(cell.f);
      }
    }
  }
}
