import { now, uid, type Workspace } from "./model";
import { definitionCollections } from "./definition-collections";
import { codeFence, studyCodeBlocks } from "./code-blocks";
import { parseModule } from "./modules";
import { saveNote } from "./domain";

/** Save nested and full-form definitions through the same module/review links. */
export function saveDictionaryDefinition(
  w: Workspace,
  input: {
    id?: string;
    term: string;
    definition: string;
    subjectIds: string[];
    noteId?: string;
    aliases?: string[];
  },
) {
  if (!input.term.trim() || !input.definition.trim())
    throw Error("A term and definition are required.");
  const choices = definitionCollections(w);
  const subjectIds = [...new Set(input.subjectIds)];
  if (
    !subjectIds.length ||
    subjectIds.some((id) => !choices.some((c) => c.id === id))
  )
    throw Error(
      "Choose at least one available collection for this definition.",
    );
  let entry = input.id
    ? w.definitions.find((d) => d.id === input.id && !d.trashed)
    : undefined;
  if (input.id && !entry)
    throw Error("This definition is no longer available.");
  if (entry) {
    Object.assign(entry, {
      term: input.term.trim(),
      definition: input.definition,
      subjectIds,
      aliases: input.aliases ?? entry.aliases,
      noteId: entry.noteId ?? input.noteId,
      updatedAt: now(),
    });
    for (const review of w.review.filter((r) => r.sourceId === entry!.id))
      review.contentChanged = true;
  } else {
    entry = {
      id: uid(),
      term: input.term.trim(),
      definition: input.definition,
      subjectIds,
      aliases: input.aliases ?? [],
      noteId: input.noteId,
      createdAt: now(),
      updatedAt: now(),
    };
    w.definitions.push(entry);
  }
  if (entry.moduleBlockId && entry.noteId) {
    const note = w.notes.find((n) => n.id === entry!.noteId);
    const block =
      note &&
      studyCodeBlocks(note.body).find((b) => b.id === entry!.moduleBlockId);
    const module = block && parseModule(block.code);
    if (note && block && module?.kind === "definition")
      saveNote(
        w,
        note.id,
        note.revision,
        {
          body:
            note.body.slice(0, block.from) +
            codeFence({
              ...block,
              code: JSON.stringify({
                ...module,
                term: entry.term,
                explanation: entry.definition,
              }),
            }) +
            note.body.slice(block.to),
        },
        "Definition update",
      );
  }
  return entry.id;
}
