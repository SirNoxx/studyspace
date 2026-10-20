import { ancestry, contextDefinitions, type Workspace } from "./model";
import {
  conceptMatches,
  definitionLinks,
  includeLinkedDefinitions,
} from "./markdown";

export function definitionUsages(w: Workspace, definitionId: string) {
  if (!w.definitions.some((d) => d.id === definitionId && !d.trashed))
    return [];
  return w.notes
    .filter(
      (note) =>
        !note.trashed &&
        !note.archived &&
        ancestry(w, note.containerId).every((c) => !c.trashed && !c.archived),
    )
    .flatMap((note) => {
      const entries = includeLinkedDefinitions(
        note.body,
        contextDefinitions(w, note.containerId),
        w.definitions,
      );
      const ranges = [
        ...conceptMatches(note.body, entries)
          .filter((match) => match.entry.id === definitionId)
          .map((match) => ({ from: match.from, to: match.to })),
        ...definitionLinks(note.body)
          .filter((link) => link.id === definitionId)
          .map((link) => ({ from: link.labelFrom, to: link.labelTo })),
      ];
      return ranges
        .sort((a, b) => a.from - b.from)
        .map((range) => ({
          noteId: note.id,
          title: note.title,
          ...range,
          quote: note.body.slice(range.from, range.to),
          before: note.body
            .slice(Math.max(0, range.from - 65), range.from)
            .replace(/\s+/g, " "),
          after: note.body.slice(range.to, range.to + 85).replace(/\s+/g, " "),
          line: note.body.slice(0, range.from).split("\n").length,
        }));
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.from - b.from);
}
