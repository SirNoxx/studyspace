import { expect, it } from "vitest";
import {
  deleteTableColumn,
  insertTableColumn,
  insertTableRow,
  pasteTableCells,
  parseTableTSV,
  tableTSV,
  type TableData,
} from "../src/lib/table-editing";
const table: TableData = {
  version: 1,
  kind: "table",
  headers: ["A", "B", "C"],
  rows: [
    ["a", "b", "c"],
    ["d", "e", "f"],
  ],
};
it("deletes the selected column from headings and every row without changing the original", () => {
  expect(deleteTableColumn(table, 1)).toEqual({
    ...table,
    headers: ["A", "C"],
    rows: [
      ["a", "c"],
      ["d", "f"],
    ],
  });
  expect(table.rows[0]).toEqual(["a", "b", "c"]);
  expect(insertTableColumn(table, 1).rows[0]).toEqual(["a", "", "b", "c"]);
  expect(insertTableRow(table, 1).rows).toEqual([
    ["a", "b", "c"],
    ["", "", ""],
    ["d", "e", "f"],
  ]);
  expect(() =>
    deleteTableColumn({ ...table, headers: ["A"], rows: [["a"]] }, 0),
  ).toThrow("at least one");
});
it("round trips quoted spreadsheet cells and expands pastes without overwriting unrelated cells", () => {
  const grid = [
    ["a\tb", 'He said "yes"', "two\nlines"],
    ["", "last", ""],
  ];
  expect(parseTableTSV(tableTSV(grid))).toEqual(grid);
  const pasted = pasteTableCells(
    table,
    { row: 1, column: 2 },
    "X\tY\r\nZ\tW\r\n",
  );
  expect(pasted.headers).toEqual(["A", "B", "C", "Column"]);
  expect(pasted.rows).toEqual([
    ["a", "b", "c", ""],
    ["d", "e", "X", "Y"],
    ["", "", "Z", "W"],
  ]);
  expect(
    pasteTableCells(table, { row: -1, column: 1 }, "New header\nValue").headers,
  ).toEqual(["A", "New header", "C"]);
});
it("rejects oversized pastes atomically", () => {
  expect(() => pasteTableCells(table, { row: 99, column: 11 }, "x\ty")).toThrow(
    "Nothing was changed",
  );
  expect(() =>
    pasteTableCells(table, { row: 0, column: 0 }, "a".repeat(20001)),
  ).toThrow("Nothing was changed");
  expect(table.rows).toHaveLength(2);
});
