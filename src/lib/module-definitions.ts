import { type Workspace, type Note, now, uid } from "./model";
import {
  definitionCollection,
  definitionCollections,
} from "./definition-collections";
import { studyCodeBlocks } from "./code-blocks";
import { parseModule } from "./modules";
export function syncModuleDefinitions(w: Workspace, note: Note) {
  const found = new Set<string>();
  for (const block of studyCodeBlocks(note.body)) {
    if (note.trashed || block.language !== "module") continue;
    const data = parseModule(block.code);
    // Attached entries retain their dictionary identity; a module stores a reusable snapshot.
    if (data?.kind === "definition" && data.definitionId) continue;
    if (
      data?.kind !== "definition" ||
      !data.term.trim() ||
      !data.explanation.trim()
    )
      continue;
    found.add(block.id);
    const collection = definitionCollection(w, note.containerId);
    if (!collection) continue;
    const existing = w.definitions.find(
      (d) => d.noteId === note.id && d.moduleBlockId === block.id,
    );
    const available = new Set(definitionCollections(w).map((c) => c.id));
    const fields = {
      term: data.term.trim().replace(/\s+/g, " "),
      definition: data.explanation,
      noteId: note.id,
      subjectIds: [
        ...new Set([
          collection.id,
          ...(existing?.subjectIds.slice(1) ?? []).filter((id) =>
            available.has(id),
          ),
        ]),
      ],
      trashed: false,
    };
    if (existing) {
      if (
        existing.term !== fields.term ||
        existing.definition !== fields.definition ||
        existing.trashed ||
        existing.subjectIds.join() !== fields.subjectIds.join()
      ) {
        Object.assign(existing, fields, { updatedAt: now() });
        for (const review of w.review.filter((r) => r.sourceId === existing.id))
          review.contentChanged = true;
      }
    } else
      w.definitions.push({
        id: uid(),
        ...fields,
        moduleBlockId: block.id,
        aliases: [],
        createdAt: now(),
        updatedAt: now(),
      });
  }
  for (const d of w.definitions)
    if (d.noteId === note.id && d.moduleBlockId && !found.has(d.moduleBlockId))
      d.trashed = true;
}
