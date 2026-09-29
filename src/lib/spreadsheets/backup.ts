import type { ImportPlan } from "../transfer";
import { validateSnapshot, type WorkbookSnapshot } from "./model";
import { saveWorkbook } from "./store";
import { remapWorkbooks } from "./references";

/** Stage resources under new IDs before committing notes. Never overwrite an
 * existing workbook just because an imported archive chose the same ID. */
export async function stageWorkbookImports(
  plan: ImportPlan,
  scope: string,
): Promise<ImportPlan> {
  const ids = new Map<string, string>();
  const staged: { id: string; snapshot: WorkbookSnapshot }[] = [];
  for (const file of plan.files.filter((f) => f.kind === "workbook")) {
    const envelope = JSON.parse(new TextDecoder().decode(file.bytes));
    if (envelope.version !== 1 || typeof envelope.workbookId !== "string")
      throw Error("Invalid spreadsheet backup metadata.");
    validateSnapshot(envelope.snapshot);
    const id = crypto.randomUUID();
    ids.set(envelope.workbookId, id);
    staged.push({ id, snapshot: { ...envelope.snapshot, id } });
  }
  if (!ids.size) return plan;
  const files = plan.files.map((file) => {
    if (file.kind === "note")
      return {
        ...file,
        bytes: new TextEncoder().encode(
          remapWorkbooks(new TextDecoder().decode(file.bytes), ids),
        ),
      };
    if (file.kind === "manifest") {
      const manifest = JSON.parse(new TextDecoder().decode(file.bytes));
      if (!Array.isArray(manifest.notes))
        throw Error("Invalid backup note manifest.");
      manifest.notes = manifest.notes.map((note: { body: string }) => ({
        ...note,
        body: remapWorkbooks(note.body, ids),
      }));
      return {
        ...file,
        bytes: new TextEncoder().encode(JSON.stringify(manifest)),
      };
    }
    return file;
  });
  for (const resource of staged)
    await saveWorkbook(
      {
        version: 1,
        engineVersion: "0.25.1",
        scope,
        noteId: "",
        id: resource.id,
        revision: 0,
        updatedAt: "",
        snapshot: resource.snapshot,
      },
      0,
    );
  return { ...plan, files };
}
