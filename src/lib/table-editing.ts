import type { ModuleData } from "./modules";
export type TableData = Extract<ModuleData, { kind: "table" }>;
export type Cell = { row: number; column: number }; // -1 is the heading row.

export function insertTableRow(data: TableData, at: number): TableData {
  if (data.rows.length >= 100) throw Error("Tables can have up to 100 rows.");
  const rows = data.rows.map((row) => [...row]);
  rows.splice(
    at,
    0,
    data.headers.map(() => ""),
  );
  return { ...data, rows };
}
export function insertTableColumn(data: TableData, at: number): TableData {
  if (data.headers.length >= 12)
    throw Error("Tables can have up to 12 columns.");
  const headers = [...data.headers];
  headers.splice(at, 0, "Column");
  return {
    ...data,
    headers,
    rows: data.rows.map((row) => {
      const cells = [...row];
      cells.splice(at, 0, "");
      return cells;
    }),
  };
}
export function deleteTableColumn(data: TableData, at: number): TableData {
  if (data.headers.length <= 1)
    throw Error("Keep at least one column in the table.");
  return {
    ...data,
    headers: data.headers.filter((_, i) => i !== at),
    rows: data.rows.map((row) => row.filter((_, i) => i !== at)),
  };
}
export function cellText(data: TableData, cell: Cell) {
  return (
    (cell.row < 0 ? data.headers : data.rows[cell.row])?.[cell.column] ?? ""
  );
}
export function setCellText(
  data: TableData,
  cell: Cell,
  value: string,
): TableData {
  if (value.length > 20000)
    throw Error("A cell can contain up to 20,000 characters.");
  if (cell.row < 0)
    return {
      ...data,
      headers: data.headers.map((v, c) => (c === cell.column ? value : v)),
    };
  return {
    ...data,
    rows: data.rows.map((row, r) =>
      r === cell.row ? row.map((v, c) => (c === cell.column ? value : v)) : row,
    ),
  };
}
export function tableTSV(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((value) =>
          /[\t\n\r"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value,
        )
        .join("\t"),
    )
    .join("\n");
}
/** Read spreadsheet clipboard data, including quoted multiline cells. */
export function parseTableTSV(text: string) {
  if (text.length > 2_000_000) throw Error("The pasted table is too large.");
  const rows: string[][] = [[]];
  let value = "",
    quoted = false;
  const push = () => {
    rows[rows.length - 1].push(value);
    value = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && (quoted || value === "")) {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "\t" || ch === "\n" || ch === "\r")) {
      push();
      if (ch !== "\t") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        rows.push([]);
      }
    } else value += ch;
  }
  if (quoted) throw Error("The pasted table has an unclosed quoted cell.");
  push();
  if (
    rows.length > 1 &&
    /[\r\n]$/.test(text) &&
    rows.at(-1)?.length === 1 &&
    rows.at(-1)?.[0] === ""
  )
    rows.pop();
  return rows;
}
export function pasteTableCells(
  data: TableData,
  cell: Cell,
  text: string,
): TableData {
  const grid = parseTableTSV(text);
  const width = Math.max(
    data.headers.length,
    cell.column + Math.max(...grid.map((row) => row.length)),
  );
  const height = Math.max(data.rows.length, cell.row + grid.length);
  if (width > 12 || height > 100)
    throw Error(
      "That paste would exceed 12 columns or 100 rows. Nothing was changed.",
    );
  if (grid.some((row) => row.some((value) => value.length > 20000)))
    throw Error(
      "A pasted cell exceeds 20,000 characters. Nothing was changed.",
    );
  const headers = Array.from(
    { length: width },
    (_, c) => data.headers[c] ?? "Column",
  );
  const rows = Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => data.rows[r]?.[c] ?? ""),
  );
  grid.forEach((row, r) =>
    row.forEach((value, c) => {
      const target = cell.row + r;
      (target < 0 ? headers : rows[target])[cell.column + c] = value;
    }),
  );
  return { ...data, headers, rows };
}
