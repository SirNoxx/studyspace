/** Local observability hook. Never include file names, IDs, cell values or errors.
 * Hosts may subscribe to aggregate these events in their telemetry provider. */
export function spreadsheetMetric(
  action: "open" | "save" | "import" | "export",
  status: "ok" | "failed",
  durationMs?: number,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("studyspace:spreadsheet-metric", {
      detail: {
        action,
        status,
        durationMs:
          durationMs === undefined ? undefined : Math.round(durationMs),
      },
    }),
  );
}
