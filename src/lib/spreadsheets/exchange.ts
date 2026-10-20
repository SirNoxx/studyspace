import ExcelJS from "exceljs";
import { unzipSync, strFromU8 } from "fflate";
import type { ICellData, IStyleData } from "@univerjs/core";
import {
  blankWorkbook,
  columnName,
  readableCell,
  SHEET_LIMITS,
  validateSnapshot,
  NETWORK_FORMULA,
  metadata,
  type WorkbookSnapshot,
  type SheetGroup,
} from "./model";

export interface ImportPreview {
  snapshot: WorkbookSnapshot;
  warnings: string[];
  name: string;
}
const networkFormula = NETWORK_FORMULA;
const rgb = (color: Partial<ExcelJS.Color> | undefined) =>
  color?.argb ? `#${color.argb.slice(-6)}` : undefined;
const borderStyles = [
  "none",
  "thin",
  "hair",
  "dotted",
  "dashed",
  "dashDot",
  "dashDotDot",
  "double",
  "medium",
  "mediumDashed",
  "mediumDashDot",
  "mediumDashDotDot",
  "slantDashDot",
  "thick",
] as const;
export function parseDelimited(source: string, delimiter: string): string[][] {
  if (![",", ";", "\t"].includes(delimiter))
    throw Error("Choose a comma, semicolon or tab delimiter.");
  const result: string[][] = [];
  let cells = 0;
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' && (quoted || value === "")) {
      if (quoted && source[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === delimiter || ch === "\n" || ch === "\r")) {
      row.push(value);
      if (++cells > SHEET_LIMITS.cells)
        throw Error("Files are limited to 100,000 cells.");
      value = "";
      if (ch !== delimiter) {
        if (ch === "\r" && source[i + 1] === "\n") i++;
        result.push(row);
        row = [];
      }
    } else value += ch;
    if (result.length > SHEET_LIMITS.rows || row.length > SHEET_LIMITS.columns)
      throw Error("File dimensions exceed the supported limits.");
  }
  if (quoted)
    throw Error("An opening quote in this file has no closing quote.");
  if (value || row.length) {
    row.push(value);
    if (++cells > SHEET_LIMITS.cells)
      throw Error("Files are limited to 100,000 cells.");
    result.push(row);
  }
  if (
    result.length > SHEET_LIMITS.rows ||
    result.some((r) => r.length > SHEET_LIMITS.columns)
  )
    throw Error("File dimensions exceed the supported limits.");
  return result;
}
export async function importSpreadsheet(
  bytes: ArrayBuffer,
  name: string,
  options: { delimiter?: string; encoding?: string; formulas?: boolean } = {},
): Promise<ImportPreview> {
  if (bytes.byteLength > SHEET_LIMITS.bytes)
    throw Error("Choose a file under 10 MB.");
  const snapshot = blankWorkbook(
    crypto.randomUUID(),
    name.replace(/\.[^.]+$/, ""),
  );
  const warnings = new Set<string>();
  if (/\.(csv|tsv)$/i.test(name)) {
    const rows = parseDelimited(
      new TextDecoder(options.encoding ?? "utf-8", { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/, ""),
      options.delimiter ?? (/\.tsv$/i.test(name) ? "\t" : ","),
    );
    const sheet = snapshot.sheets[snapshot.sheetOrder[0]];
    sheet.rowCount = Math.max(100, rows.length);
    sheet.columnCount = rows.reduce(
      (max, row) => Math.max(max, row.length),
      20,
    );
    rows.forEach((row, r) => {
      sheet.cellData[r] = {};
      row.forEach((v, c) => {
        sheet.cellData[r][c] = { v, t: 1 };
      });
    });
    warnings.add(
      "Delimited files are imported as text to preserve identifiers and leading zeros. Apply number formats or edit a cell to convert values.",
    );
  } else if (/\.studyspace-sheet\.json$/i.test(name)) {
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    if (decoded.version !== 1)
      throw Error("Unsupported spreadsheet backup version.");
    validateSnapshot(decoded.snapshot);
    return {
      snapshot: { ...decoded.snapshot, id: snapshot.id },
      warnings: [],
      name,
    };
  } else if (/\.xlsx$/i.test(name)) {
    let inflated = 0,
      entries = 0;
    const archive = unzipSync(new Uint8Array(bytes), {
      filter: (entry) => {
        inflated += entry.originalSize;
        if (++entries > 10000 || inflated > SHEET_LIMITS.inflated)
          throw Error("This workbook expands beyond the import safety limits.");
        if (/vbaProject|externalLinks|connections\.xml/.test(entry.name))
          throw Error(
            "Macros and external workbook connections are not supported. Save a plain XLSX copy.",
          );
        if (/xl\/(charts|pivotTables|drawings)\//.test(entry.name))
          warnings.add(
            "Charts, drawings and pivot tables will not be imported. The original file is retained.",
          );
        return /\.xml$/.test(entry.name);
      },
    });
    for (const xml of Object.values(archive))
      if (/<!DOCTYPE|<!ENTITY/i.test(strFromU8(xml)))
        throw Error(
          "XML entity declarations are not allowed in spreadsheet imports.",
        );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    snapshot.sheets = {};
    snapshot.sheetOrder = [];
    if (
      !workbook.worksheets.length ||
      workbook.worksheets.length > SHEET_LIMITS.sheets
    )
      throw Error("Choose a workbook containing 1–20 worksheets.");
    for (const original of workbook.worksheets) {
      if (
        original.rowCount > SHEET_LIMITS.rows ||
        original.columnCount > SHEET_LIMITS.columns
      )
        throw Error(
          `Worksheet ${original.name} exceeds the supported dimensions.`,
        );
      const id = crypto.randomUUID();
      const sheet = blankWorkbook(id).sheets["sheet-1"];
      sheet.id = id;
      sheet.name = original.name;
      sheet.rowCount = Math.max(100, original.rowCount);
      sheet.columnCount = Math.max(20, original.columnCount);
      sheet.rowData = {};
      sheet.columnData = {};
      sheet.mergeData = [];
      snapshot.sheetOrder.push(id);
      snapshot.sheets[id] = sheet;
      if (original.state !== "visible")
        warnings.add(
          `${original.name}: originally hidden worksheet; review it before sharing.`,
        );
      original.eachRow({ includeEmpty: false }, (row, r) => {
        sheet.rowData[r - 1] = {
          ...(row.height ? { h: (row.height * 4) / 3 } : {}),
          hd: row.hidden ? 1 : 0,
        };
        row.eachCell({ includeEmpty: false }, (cell, c) => {
          if (cell.isMerged && cell.address !== cell.master.address) return;
          const data: ICellData = {};
          const value = cell.value;
          if (value instanceof Date) {
            data.v = value.getTime() / 86400000 + 25569;
            data.t = 2;
          } else if (
            value &&
            typeof value === "object" &&
            ("formula" in value || "sharedFormula" in value)
          ) {
            const f = cell.formula;
            if (f && options.formulas !== false && !networkFormula.test(f)) {
              data.f = "=" + f;
              data.v =
                typeof cell.result === "number" ||
                typeof cell.result === "string"
                  ? cell.result
                  : null;
            } else {
              data.v =
                typeof cell.result === "number" ||
                typeof cell.result === "string"
                  ? cell.result
                  : (f ?? "");
              warnings.add(
                `${original.name}!${cell.address}: formula imported as a cached value; it will not recalculate.`,
              );
            }
          } else if (
            value &&
            typeof value === "object" &&
            "richText" in value
          ) {
            let at = 0;
            data.v = value.richText.map((run) => run.text).join("");
            data.p = {
              id: crypto.randomUUID(),
              body: {
                dataStream: data.v + "\r\n",
                paragraphs: [{ startIndex: data.v.length }],
                textRuns: value.richText.map((run) => {
                  const st = at;
                  at += run.text.length;
                  return {
                    st,
                    ed: at,
                    ts: {
                      bl: run.font?.bold ? 1 : 0,
                      it: run.font?.italic ? 1 : 0,
                      fs: run.font?.size,
                      cl: rgb(run.font?.color)
                        ? { rgb: rgb(run.font?.color)! }
                        : undefined,
                    },
                  };
                }),
              },
              documentStyle: {},
            };
          } else if (
            value &&
            typeof value === "object" &&
            "hyperlink" in value
          ) {
            data.v = value.text;
            warnings.add(
              `${original.name}!${cell.address}: hyperlink retained as display text only.`,
            );
          } else if (value && typeof value === "object") {
            data.v = "error" in value ? value.error : cell.text;
          } else {
            data.v = typeof value === "boolean" ? Number(value) : value;
            data.t =
              typeof value === "boolean"
                ? 3
                : typeof value === "number"
                  ? 2
                  : 1;
          }
          const font = cell.font,
            align = cell.alignment;
          const style: IStyleData = {
            bl: font?.bold ? 1 : 0,
            it: font?.italic ? 1 : 0,
            fs: font?.size,
            ff: font?.name,
            cl: rgb(font?.color) ? { rgb: rgb(font?.color)! } : undefined,
            tb: align?.wrapText ? 3 : 1,
            n: { pattern: cell.numFmt ?? "General" },
          };
          if (cell.fill?.type === "pattern" && rgb(cell.fill.fgColor))
            style.bg = { rgb: rgb(cell.fill.fgColor)! };
          if (align?.horizontal)
            style.ht = (
              { left: 1, center: 2, right: 3 } as Record<string, number>
            )[align.horizontal];
          if (align?.vertical)
            style.vt = (
              { top: 1, middle: 2, bottom: 3 } as Record<string, number>
            )[align.vertical];
          if (font?.underline) style.ul = { s: 1 };
          if (font?.strike) style.st = { s: 1 };
          style.bd = {};
          for (const [side, short] of [
            ["top", "t"],
            ["bottom", "b"],
            ["left", "l"],
            ["right", "r"],
          ] as const) {
            const border = cell.border?.[side];
            if (border?.style)
              style.bd[short] = {
                s: Math.max(1, borderStyles.indexOf(border.style)),
                cl: { rgb: rgb(border.color) ?? "#666666" },
              };
          }
          data.s = style;
          (sheet.cellData[r - 1] ??= {})[c - 1] = data;
        });
      });
      original.columns.forEach((col, c) => {
        sheet.columnData[c] = {
          w: (col.width ?? 12) * 7,
          hd: col.hidden ? 1 : 0,
        };
      });
      const groups: SheetGroup[] = [];
      for (const axis of ["row", "column"] as const) {
        const max = axis === "row" ? original.rowCount : original.columnCount;
        const axisData = axis === "row" ? sheet.rowData : sheet.columnData;
        for (let level = 1; level <= 7; level++) {
          let members: string[] = [],
            hidden = true;
          const flush = () => {
            if (members.length)
              groups.push({
                id: crypto.randomUUID(),
                name: `${axis === "row" ? "Rows" : "Columns"} · outline ${level}`,
                axis,
                members,
                collapsed: hidden,
              });
            members = [];
            hidden = true;
          };
          for (let at = 0; at <= max; at++) {
            const item =
              at < max
                ? axis === "row"
                  ? original.getRow(at + 1)
                  : original.getColumn(at + 1)
                : undefined;
            if (item && (item.outlineLevel ?? 0) >= level) {
              const entry = (axisData[at] ??= {});
              entry.custom ??= {};
              entry.custom.studyspaceId ??= crypto.randomUUID();
              members.push(String(entry.custom.studyspaceId));
              hidden &&= item.hidden;
            } else flush();
          }
        }
      }
      if (groups.length) sheet.custom = { studyspace: { groups } };
      const frozen = (original.views ?? []).find((v) => v.state === "frozen");
      if (frozen?.state === "frozen")
        sheet.freeze = {
          startRow: frozen.ySplit ?? 0,
          startColumn: frozen.xSplit ?? 0,
          xSplit: frozen.xSplit ?? 0,
          ySplit: frozen.ySplit ?? 0,
        };
      for (const merge of original.model.merges ?? []) {
        const range = original.getCell(merge.split(":")[0]),
          end = original.getCell(merge.split(":")[1]);
        sheet.mergeData.push({
          startRow: Number(range.row) - 1,
          endRow: Number(end.row) - 1,
          startColumn: Number(range.col) - 1,
          endColumn: Number(end.col) - 1,
        });
      }
    }
    warnings.add(
      "Formula compatibility is limited to the engine’s supported functions. Review calculated results before relying on them.",
    );
  } else
    throw Error(
      "Import XLSX, CSV, TSV or a Studyspace spreadsheet backup. Save XLS/XLSM files as XLSX first.",
    );
  validateSnapshot(snapshot);
  return { snapshot, warnings: [...warnings], name };
}

export async function exportXlsx(
  snapshot: WorkbookSnapshot,
): Promise<ArrayBuffer> {
  validateSnapshot(snapshot);
  const workbook = new ExcelJS.Workbook();
  for (const id of snapshot.sheetOrder) {
    const source = snapshot.sheets[id];
    const sheet = workbook.addWorksheet(source.name);
    for (const [r, row] of Object.entries(source.cellData))
      for (const [c, data] of Object.entries(
        row as Record<string, ICellData>,
      )) {
        if (!data) continue;
        const cell = sheet.getCell(+r + 1, +c + 1);
        if (data.f)
          cell.value = {
            formula: data.f.replace(/^=/, ""),
            result: data.v as number | string,
          };
        else
          cell.value =
            readableCell(data) === ""
              ? null
              : data.t === 3
                ? !!data.v
                : (data.v ?? readableCell(data));
        const style =
          typeof data.s === "string" ? snapshot.styles[data.s] : data.s;
        if (style) {
          cell.font = {
            name: style.ff ?? undefined,
            size: style.fs,
            bold: style.bl === 1,
            italic: style.it === 1,
            underline: style.ul?.s === 1,
            strike: style.st?.s === 1,
            ...(style.cl?.rgb
              ? { color: { argb: "FF" + style.cl.rgb.replace("#", "") } }
              : {}),
          };
          if (style.bg?.rgb)
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF" + style.bg.rgb.replace("#", "") },
            };
          cell.numFmt = style.n?.pattern ?? "General";
          cell.alignment = {
            wrapText: style.tb === 3,
            horizontal: ({ 1: "left", 2: "center", 3: "right" } as const)[
              style.ht as 1 | 2 | 3
            ],
            vertical: ({ 1: "top", 2: "middle", 3: "bottom" } as const)[
              style.vt as 1 | 2 | 3
            ],
          };
          for (const [side, short] of [
            ["top", "t"],
            ["bottom", "b"],
            ["left", "l"],
            ["right", "r"],
          ] as const) {
            const border = style.bd?.[short];
            if (border)
              cell.border = {
                ...cell.border,
                [side]: {
                  style: borderStyles[border.s] ?? "thin",
                  color: {
                    argb: "FF" + (border.cl?.rgb ?? "#666666").replace("#", ""),
                  },
                },
              };
          }
        }
        if (data.p?.body?.dataStream) {
          const body = data.p.body,
            text = body.dataStream.replace(/[\r\n]+$/, "");
          const parts: ExcelJS.RichText[] = [];
          let at = 0;
          for (const run of [...(body.textRuns ?? [])].sort(
            (a, b) => a.st - b.st,
          )) {
            if (run.st > at) parts.push({ text: text.slice(at, run.st) });
            parts.push({
              text: text.slice(run.st, Math.min(run.ed, text.length)),
              font: {
                bold: run.ts?.bl === 1,
                italic: run.ts?.it === 1,
                size: run.ts?.fs,
                name: run.ts?.ff ?? undefined,
                underline: run.ts?.ul?.s === 1,
                strike: run.ts?.st?.s === 1,
                ...(run.ts?.cl?.rgb
                  ? { color: { argb: "FF" + run.ts.cl.rgb.replace("#", "") } }
                  : {}),
              },
            });
            at = run.ed;
          }
          if (at < text.length) parts.push({ text: text.slice(at) });
          cell.value = { richText: parts };
        }
      }
    for (const [r, data] of Object.entries(source.rowData ?? {})) {
      sheet.getRow(+r + 1).height = ((data.h ?? 24) * 3) / 4;
      sheet.getRow(+r + 1).hidden = data.hd === 1;
      sheet.getRow(+r + 1).outlineLevel = Math.min(
        7,
        metadata(source).groups.filter(
          (g) =>
            g.axis === "row" &&
            g.members.includes(String(data.custom?.studyspaceId)),
        ).length,
      );
    }
    for (const [c, data] of Object.entries(source.columnData ?? {})) {
      sheet.getColumn(+c + 1).width = (data.w ?? 84) / 7;
      sheet.getColumn(+c + 1).hidden = data.hd === 1;
      sheet.getColumn(+c + 1).outlineLevel = Math.min(
        7,
        metadata(source).groups.filter(
          (g) =>
            g.axis === "column" &&
            g.members.includes(String(data.custom?.studyspaceId)),
        ).length,
      );
    }
    if (source.freeze?.xSplit || source.freeze?.ySplit)
      sheet.views = [
        {
          state: "frozen",
          xSplit: source.freeze.xSplit,
          ySplit: source.freeze.ySplit,
        },
      ];
    for (const range of source.mergeData ?? [])
      sheet.mergeCells(
        range.startRow + 1,
        range.startColumn + 1,
        range.endRow + 1,
        range.endColumn + 1,
      );
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
export function exportDelimited(
  snapshot: WorkbookSnapshot,
  id: string,
  delimiter = ",",
) {
  const sheet = snapshot.sheets[id];
  let maxR = 0,
    maxC = 0;
  for (const [r, row] of Object.entries(sheet.cellData)) {
    maxR = Math.max(maxR, +r);
    for (const c of Object.keys(row)) maxC = Math.max(maxC, +c);
  }
  if ((maxR + 1) * (maxC + 1) > SHEET_LIMITS.cells)
    throw Error(
      "The used rectangle exceeds 100,000 cells. Export Excel or a native backup instead.",
    );
  return Array.from({ length: maxR + 1 }, (_, r) =>
    Array.from({ length: maxC + 1 }, (_, c) => {
      let text = readableCell(sheet.cellData[r]?.[c]);
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return /["\n\r,\t;]/.test(text)
        ? '"' + text.replaceAll('"', '""') + '"'
        : text;
    }).join(delimiter),
  ).join("\r\n");
}
