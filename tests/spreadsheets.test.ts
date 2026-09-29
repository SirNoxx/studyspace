import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { printWorksheet } from "../src/lib/spreadsheets/print";
import { formatTextRuns } from "../src/lib/spreadsheets/rich-text";
import { publicSpreadsheetPreviews } from "../src/lib/spreadsheets/references";
import "fake-indexeddb/auto";
import {
  initializeWorkbook,
  saveWorkbook,
  loadWorkbook,
  workbookHistory,
} from "../src/lib/spreadsheets/store";
import { emptyWorkspace, general } from "../src/lib/model";
import { createNote } from "../src/lib/domain";
import { codeFence } from "../src/lib/code-blocks";
import {
  exportWorkspace,
  prepareImport,
  commitImport,
} from "../src/lib/transfer";
import { stageWorkbookImports } from "../src/lib/spreadsheets/backup";
import { workbookReferences } from "../src/lib/spreadsheets/references";
import {
  blankWorkbook,
  validateSnapshot,
  columnName,
} from "../src/lib/spreadsheets/model";
import {
  importSpreadsheet,
  exportXlsx,
  exportDelimited,
  parseDelimited,
} from "../src/lib/spreadsheets/exchange";

describe("spreadsheet interchange", () => {
  it("preserves earlier substring formatting when styling another selection", () => {
    expect(
      formatTextRuns("Bold italic", [{ st: 0, ed: 4, ts: { bl: 1 } }], 5, 11, {
        it: 1,
      }),
    ).toEqual([
      { st: 0, ed: 4, ts: { bl: 1 } },
      { st: 5, ed: 11, ts: { it: 1 } },
    ]);
  });
  it("publishes only selected preview values and excludes private resource IDs and seeds", () => {
    const id = crypto.randomUUID(),
      body = codeFence({
        language: "module",
        id: "publication-sheet",
        collapsed: false,
        title: "Sheet",
        code: JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: id,
          seed: { headers: ["Secret"], rows: [["Private seed"]] },
          preview: { sheet: "Study", range: "A1", rows: [["Public value"]] },
        }),
      });
    const output = publicSpreadsheetPreviews(body);
    expect(output).toContain("Public value");
    expect(output).not.toContain(id);
    expect(output).not.toContain("Private seed");
  });
  it("prints every selected row rather than only the virtual editor viewport", () => {
    vi.useFakeTimers();
    const dom = new JSDOM("<!doctype html><body></body>");
    vi.stubGlobal("document", dom.window.document);
    try {
      const w = blankWorkbook(crypto.randomUUID());
      w.sheets["sheet-1"].cellData = {
        0: { 0: { v: "Header" } },
        59: { 0: { v: "Last row" } },
      };
      printWorksheet(w, "sheet-1", { repeatHeader: true });
      const frame = document.querySelector("iframe")!;
      expect(frame.contentDocument!.querySelectorAll("tr")).toHaveLength(60);
      expect(frame.contentDocument!.querySelector("thead")?.textContent).toBe(
        "Header",
      );
      expect(frame.contentDocument!.body.textContent).toContain("Last row");
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      dom.window.close();
    }
  });
  it("round-trips values, formulas and formatting through XLSX", async () => {
    const workbook = blankWorkbook(crypto.randomUUID());
    workbook.sheets["sheet-1"].cellData = {
      0: {
        0: { v: "Topic", s: { bl: 1, fs: 18, bg: { rgb: "#abcdef" } } },
        1: { v: 4 },
      },
      1: { 0: { v: "00123", t: 1 }, 1: { f: "=B1*2", v: 8 } },
    };
    const imported = await importSpreadsheet(
      await exportXlsx(workbook),
      "test.xlsx",
    );
    const sheet = imported.snapshot.sheets[imported.snapshot.sheetOrder[0]];
    expect(sheet.cellData[0][0].v).toBe("Topic");
    expect(sheet.cellData[0][0].s).toMatchObject({
      bl: 1,
      fs: 18,
      bg: { rgb: "#abcdef" },
    });
    expect(sheet.cellData[1][0].v).toBe("00123");
    expect(sheet.cellData[1][1]).toMatchObject({ f: "=B1*2", v: 8 });
  });
  it("preserves quoted and multiline delimited fields and text identifiers", async () => {
    expect(
      parseDelimited('"Hello, world",code\r\n"two\nlines",0012', ","),
    ).toEqual([
      ["Hello, world", "code"],
      ["two\nlines", "0012"],
    ]);
    const result = await importSpreadsheet(
      new TextEncoder().encode("name,code\nTest,0012").buffer,
      "test.csv",
    );
    expect(result.snapshot.sheets["sheet-1"].cellData[1][1].v).toBe("0012");
    expect(() => parseDelimited('"unclosed', ",")).toThrow("closing quote");
  });
  it("rejects external formulas and excessive dimensions without truncating", () => {
    const workbook = blankWorkbook(crypto.randomUUID());
    workbook.sheets["sheet-1"].rowCount = 100001;
    expect(() => validateSnapshot(workbook)).toThrow("dimensions");
    workbook.sheets["sheet-1"].rowCount = 100;
    workbook.sheets["sheet-1"].cellData = {
      0: { 0: { f: '=WEBSERVICE("https://example.com")' } },
    };
    expect(() => validateSnapshot(workbook)).toThrow("network formulas");
  });
  it("exports formula-looking text safely in CSV and retains all columns", () => {
    const workbook = blankWorkbook(crypto.randomUUID());
    workbook.sheets["sheet-1"].cellData = {
      0: { 0: { v: "=danger" }, 2: { v: "normal" } },
    };
    expect(exportDelimited(workbook, "sheet-1")).toBe("'=danger,,normal");
    expect(columnName(0)).toBe("A");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
  });
  it("round-trips nested row outlines, hidden states and frozen panes", async () => {
    const w = blankWorkbook(crypto.randomUUID()),
      s = w.sheets["sheet-1"];
    s.cellData = {
      0: { 0: { v: "Heading" } },
      1: { 0: { v: "Parent" } },
      2: { 0: { v: "Child" } },
    };
    s.rowData = {
      1: { hd: 1, custom: { studyspaceId: "r1" } },
      2: { hd: 1, custom: { studyspaceId: "r2" } },
    };
    s.custom = {
      studyspace: {
        groups: [
          {
            id: "g1",
            name: "Parent",
            axis: "row",
            members: ["r1", "r2"],
            collapsed: true,
          },
          {
            id: "g2",
            name: "Child",
            axis: "row",
            members: ["r2"],
            collapsed: true,
          },
        ],
      },
    };
    s.freeze = { startRow: 1, startColumn: 1, xSplit: 1, ySplit: 1 };
    const imported = await importSpreadsheet(
      await exportXlsx(w),
      "groups.xlsx",
    );
    const result = imported.snapshot.sheets[imported.snapshot.sheetOrder[0]];
    expect(result.rowData[2].hd).toBe(1);
    expect(
      (result.custom?.studyspace as { groups: unknown[] }).groups,
    ).toHaveLength(2);
    expect(result.freeze).toMatchObject({ xSplit: 1, ySplit: 1 });
  });
  it("bounds sparse CSV rectangles and rejects prototype-bearing native backups", () => {
    const w = blankWorkbook(crypto.randomUUID());
    w.sheets["sheet-1"].cellData = { 99999: { 1023: { v: "far" } } };
    expect(() => exportDelimited(w, "sheet-1")).toThrow("rectangle");
    expect(() =>
      validateSnapshot(JSON.parse('{"__proto__":{"polluted":true}}')),
    ).toThrow("metadata key");
  });
  it("retains versions and rejects stale saves without overwriting the winning edit", async () => {
    const id = crypto.randomUUID(),
      scope = crypto.randomUUID();
    const a = await initializeWorkbook(scope, id, "note", blankWorkbook(id));
    const b = structuredClone(a);
    b.snapshot.sheets["sheet-1"].cellData = { 0: { 0: { v: "Winner" } } };
    const saved = await saveWorkbook(b, a.revision);
    await expect(saveWorkbook(a, a.revision)).rejects.toThrow("another window");
    expect(
      (await loadWorkbook(scope, id))?.snapshot.sheets["sheet-1"].cellData[0][0]
        .v,
    ).toBe("Winner");
    expect((await workbookHistory(scope, id))[0].revision).toBe(a.revision);
    const duplicate = await initializeWorkbook(
      scope,
      id,
      "other-note",
      blankWorkbook(id),
    );
    expect(duplicate.id).not.toBe(id);
    expect(duplicate.snapshot.sheets["sheet-1"].cellData[0][0].v).toBe(
      "Winner",
    );
    expect(saved.revision).toBe(a.revision + 1);
  });
  it("backs up and restores resource references with fresh IDs without altering originals", async () => {
    const scope = crypto.randomUUID(),
      id = crypto.randomUUID(),
      w = emptyWorkspace();
    const note = createNote(w, general(w).id, { title: "Workbook note" });
    note.body = codeFence({
      language: "module",
      collapsed: false,
      id: crypto.randomUUID(),
      title: "Study sheet",
      code: JSON.stringify({ version: 1, kind: "spreadsheet", workbookId: id }),
    });
    const snapshot = blankWorkbook(id);
    snapshot.sheets["sheet-1"].cellData = { 0: { 0: { v: "Retained cell" } } };
    await initializeWorkbook(scope, id, note.id, snapshot);
    const bytes = await exportWorkspace(w, {
      full: true,
      loadWorkbook: async (key) => (await loadWorkbook(scope, key))?.snapshot,
    });
    const plan = await stageWorkbookImports(
      await prepareImport([new File([Uint8Array.from(bytes)], "backup.zip")]),
      scope,
    );
    const fresh = emptyWorkspace();
    commitImport(fresh, plan, general(fresh).id);
    const restored = fresh.notes.find((n) => n.title === "Workbook note")!;
    const ref = workbookReferences(restored.body)[0].data.workbookId;
    expect(ref).not.toBe(id);
    expect(
      (await loadWorkbook(scope, ref))?.snapshot.sheets["sheet-1"]
        .cellData[0][0].v,
    ).toBe("Retained cell");
    expect((await loadWorkbook(scope, id))?.noteId).toBe(note.id);
  });
});
