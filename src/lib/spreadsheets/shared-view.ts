import { metadata, type WorkbookSnapshot } from "./model";
/** Group disclosure is a per-person view, never a collaborative content edit. */
export function sharedWorkbookContent(snapshot: WorkbookSnapshot) {
  return workbookView(snapshot, {});
}
export function workbookView(
  snapshot: WorkbookSnapshot,
  collapsed: Record<string, boolean>,
) {
  const next = structuredClone(snapshot);
  for (const sheet of Object.values(next.sheets)) {
    const groups = metadata(sheet).groups;
    if (!groups.length) continue;
    for (const group of groups) group.collapsed = collapsed[group.id] ?? false;
    for (const axis of ["row", "column"] as const) {
      for (const entry of Object.values(
        axis === "row" ? (sheet.rowData ?? {}) : (sheet.columnData ?? {}),
      )) {
        const id = String(entry.custom?.studyspaceId ?? "");
        if (groups.some((g) => g.axis === axis && g.members.includes(id)))
          entry.hd =
            entry.custom?.studyspaceManualHidden ||
            groups.some(
              (g) => g.axis === axis && g.collapsed && g.members.includes(id),
            )
              ? 1
              : 0;
      }
    }
  }
  return next;
}
