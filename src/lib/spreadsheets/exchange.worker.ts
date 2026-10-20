import { importSpreadsheet, exportXlsx } from "./exchange";
self.onmessage = async (event) => {
  try {
    const data = event.data;
    const result =
      data.action === "export"
        ? await exportXlsx(data.snapshot)
        : await importSpreadsheet(data.bytes, data.name, data.options);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Spreadsheet conversion failed.",
    });
  }
};
