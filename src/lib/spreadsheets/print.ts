import { cellAddress, readableCell, type WorkbookSnapshot } from "./model";

/** Print a complete used worksheet, independent of the editor's virtual window. */
export function printWorksheet(
  snapshot: WorkbookSnapshot,
  sheetId: string,
  options: {
    range?: {
      startRow: number;
      endRow: number;
      startColumn: number;
      endColumn: number;
    };
    orientation?: "portrait" | "landscape";
    repeatHeader?: boolean;
  } = {},
) {
  const sheet = snapshot.sheets[sheetId];
  const frame = document.createElement("iframe");
  frame.title = "Spreadsheet print preview";
  Object.assign(frame.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const style = doc.createElement("style");
  style.textContent = `@page{size:${options.orientation === "portrait" ? "portrait" : "landscape"};margin:12mm}body{font:10pt Arial;color:#111}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #aaa;padding:4px;white-space:pre-wrap;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}h1{font-size:16pt}`;
  doc.head.append(style);
  doc.title = sheet.name;
  const title = doc.createElement("h1");
  title.textContent = `${snapshot.name} — ${sheet.name}`;
  doc.body.append(title);
  const table = doc.createElement("table");
  let maxRow = 0,
    maxColumn = 0;
  for (const [r, row] of Object.entries(sheet.cellData)) {
    maxRow = Math.max(maxRow, +r);
    for (const c of Object.keys(row)) maxColumn = Math.max(maxColumn, +c);
  }
  const startRow = options.range?.startRow ?? 0,
    startColumn = options.range?.startColumn ?? 0;
  maxRow = options.range?.endRow ?? maxRow;
  maxColumn = options.range?.endColumn ?? maxColumn;
  if ((maxRow - startRow + 1) * (maxColumn - startColumn + 1) > 100000) {
    frame.remove();
    throw Error(
      "This worksheet is too large to print at once. Export to Excel to select print ranges.",
    );
  }
  const head = doc.createElement("thead"),
    body = doc.createElement("tbody");
  table.append(head, body);
  for (let r = startRow; r <= maxRow; r++) {
    const tr = doc.createElement("tr");
    for (let c = startColumn; c <= maxColumn; c++) {
      const cell = sheet.cellData[r]?.[c],
        td = doc.createElement("td");
      td.textContent = readableCell(cell);
      td.setAttribute("aria-label", cellAddress(r, c));
      const format =
        typeof cell?.s === "string" ? snapshot.styles[cell.s] : cell?.s;
      if (format) {
        td.style.fontWeight = format.bl === 1 ? "bold" : "normal";
        td.style.fontStyle = format.it === 1 ? "italic" : "normal";
        if (format.fs) td.style.fontSize = format.fs + "pt";
        if (format.ff) td.style.fontFamily = format.ff;
        if (format.cl?.rgb) td.style.color = format.cl.rgb;
        if (format.bg?.rgb) td.style.backgroundColor = format.bg.rgb;
      }
      tr.append(td);
    }
    (options.repeatHeader && r === startRow ? head : body).append(tr);
  }
  doc.body.append(table);
  frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), {
    once: true,
  });
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }, 100);
  setTimeout(() => frame.remove(), 120000);
}
