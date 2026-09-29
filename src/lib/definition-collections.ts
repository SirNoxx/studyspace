import { ancestry, type Workspace } from "./model";

export function definitionCollections(w: Workspace) {
  // Nested collections use the historical "subject" kind.
  return w.containers.filter(
    (c) =>
      c.kind !== "folder" &&
      c.system !== "quick" &&
      c.system !== "pinned" &&
      ancestry(w, c.id).every((parent) => !parent.trashed && !parent.archived),
  );
}

export function definitionCollection(w: Workspace, containerId: string) {
  const choices = definitionCollections(w);
  return (
    ancestry(w, containerId)
      .reverse()
      .find((c) => choices.some((choice) => choice.id === c.id)) ??
    choices.find((c) => c.system === "general") ??
    choices[0]
  );
}
