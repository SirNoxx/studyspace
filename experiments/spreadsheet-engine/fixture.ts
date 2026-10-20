import {
  createUniver,
  LocaleType,
  mergeLocales,
  type IWorkbookData,
} from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import enUS from "@univerjs/preset-sheets-core/locales/en-US";
import ExcelJS from "exceljs";
import type { ICellData } from "@univerjs/core";
import "@univerjs/preset-sheets-core/lib/index.css";

// Isolated feasibility fixture, deliberately not registered as a Studyspace module.
// No production user data, network storage, Pro packages or remote assets.
function start(container: HTMLElement, snapshot?: IWorkbookData) {
  const instance = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(enUS) },
    presets: [UniverSheetsCorePreset({ container, disableAutoFocus: true })],
  });
  const workbook = instance.univerAPI.createWorkbook(
    snapshot ?? {
      id: crypto.randomUUID(),
      name: "Studyspace feasibility",
      sheetOrder: ["main"],
      sheets: {
        main: {
          id: "main",
          name: "Study",
          rowCount: 1000,
          columnCount: 30,
          cellData: {
            0: { 0: { v: "Topic" }, 1: { v: "Hours" } },
            1: { 0: { v: "Biology" }, 1: { v: 2 } },
            2: { 0: { v: "Math" }, 1: { v: 3 } },
            3: { 0: { v: "Total" }, 1: { f: "=SUM(B2:B3)" } },
          },
        },
      },
    },
  );
  return { ...instance, workbook };
}

let primary = start(document.getElementById("sheet")!);
let secondary: ReturnType<typeof start> | undefined;

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("studyspace-engine-experiment", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const spike = {
  get current() {
    return primary;
  },
  mountSecond() {
    secondary?.univer.dispose();
    secondary = start(document.getElementById("second")!);
    secondary.workbook
      .getActiveSheet()
      .getRange("A1")
      .setValue("Independent workbook");
    return secondary.workbook.getActiveSheet().getRange("A1").getValue();
  },
  async save() {
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(primary.workbook.save(), "primary");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  },
  async restore() {
    const db = await database();
    try {
      const snapshot = await new Promise<IWorkbookData>((resolve, reject) => {
        const request = db
          .transaction("snapshots")
          .objectStore("snapshots")
          .get("primary");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!snapshot) throw Error("No saved feasibility snapshot");
      primary.univer.dispose();
      primary = start(document.getElementById("sheet")!, snapshot);
    } finally {
      db.close();
    }
  },
  // Deliberately small mapping test: validates a few supported fields, not a
  // general-purpose importer or a claim of full XLSX fidelity.
  async xlsxRoundTrip() {
    const sheet = primary.workbook.getActiveSheet();
    const snapshot = primary.workbook.save();
    const source = snapshot.sheets[sheet.getSheetId()];
    const file = new ExcelJS.Workbook();
    const target = file.addWorksheet("Study");
    for (const [r, cells] of Object.entries(source.cellData ?? {})) {
      if (+r > 10) continue;
      for (const [c, cell] of Object.entries(
        cells as Record<string, ICellData>,
      )) {
        const out = target.getCell(+r + 1, +c + 1);
        out.value = cell.f
          ? { formula: cell.f.replace(/^=/, ""), result: cell.v as number }
          : (cell.v as ExcelJS.CellValue);
        const style =
          typeof cell.s === "string" ? snapshot.styles[cell.s] : cell.s;
        if (style) {
          out.font = {
            bold: style.bl === 1,
            italic: style.it === 1,
            size: style.fs,
          };
          if (style.bg?.rgb)
            out.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF" + style.bg.rgb.replace("#", "") },
            };
        }
      }
    }
    target.getCell("D1").value = {
      richText: [
        { text: "Rich ", font: { bold: true } },
        { text: "text", font: { italic: true } },
      ],
    };
    target.getRow(2).outlineLevel = 1;
    const bytes = await file.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(bytes);
    const restored = reopened.worksheets[0];
    return {
      bytes: bytes.byteLength,
      title: restored.getCell("A1").value,
      formula: restored.getCell("B4").value,
      font: restored.getCell("A1").font,
      fill: restored.getCell("A1").fill,
      richText: restored.getCell("D1").value,
      outlineLevel: restored.getRow(2).outlineLevel,
    };
  },
};
Object.assign(window, { spreadsheetSpike: spike });
