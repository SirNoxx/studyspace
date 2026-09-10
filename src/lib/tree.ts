import type { Workspace, Container, Note } from "./model";
import { inContainer, now } from "./model";
import { DomainError, moveItems, validateWorkspace } from "./domain";

export type DropPosition = "before" | "inside" | "after";
export function treeItems(
  w: Workspace,
  parent: string | null,
): (Container | Note)[] {
  const containers = w.containers.filter(
    (c) =>
      c.system !== "quick" &&
      c.system !== "pinned" &&
      c.parentId === parent &&
      !c.trashed &&
      !c.archived,
  );
  const notes = w.notes.filter(
    (n) =>
      n.kind !== "quick" &&
      n.containerId === parent &&
      !n.trashed &&
      !n.archived,
  );
  const fallback = Math.max(-1, ...containers.map((c) => c.order)) + 1;
  return [...containers, ...notes]
    .map((item, index) => ({ item, rank: item.order ?? fallback + index }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.item);
}
export function treeDestination(
  w: Workspace,
  source: string,
  target: string,
  position: DropPosition,
) {
  const item =
    w.containers.find((c) => c.id === source) ??
    w.notes.find((n) => n.id === source);
  const other =
    w.containers.find((c) => c.id === target) ??
    w.notes.find((n) => n.id === target);
  if (
    !item ||
    !other ||
    source === target ||
    item.trashed ||
    other.trashed ||
    item.archived ||
    other.archived
  )
    throw new DomainError("Choose another item to move beside or into.");
  const parent =
    position === "inside"
      ? "parentId" in other
        ? other.id
        : undefined
      : "parentId" in other
        ? other.parentId
        : other.containerId;
  if (parent === undefined || (parent === null && !("parentId" in item)))
    throw new DomainError("Files belong inside a collection or folder.");
  if ("parentId" in item) {
    if (item.system && parent !== item.parentId)
      throw new DomainError("General must remain a top-level collection.");
    if (parent && inContainer(w, parent, source))
      throw new DomainError("A folder cannot contain itself or its parent.");
  }
  return parent;
}
export function dropTreeItem(
  w: Workspace,
  source: string,
  target: string,
  position: DropPosition,
) {
  const parent = treeDestination(w, source, target, position);
  const item =
    w.containers.find((c) => c.id === source) ??
    w.notes.find((n) => n.id === source)!;
  const oldParent = "parentId" in item ? item.parentId : item.containerId;
  // Capture the destination order before changing parents; append to it for an inside drop.
  const siblings = treeItems(w, parent).filter((x) => x.id !== source);
  const index =
    position === "inside"
      ? siblings.length
      : siblings.findIndex((x) => x.id === target) +
        (position === "after" ? 1 : 0);
  if (oldParent !== parent) {
    if (parent) moveItems(w, [source], parent);
    else if ("parentId" in item) {
      item.parentId = null;
      if (item.kind === "subject") item.kind = "collection";
    }
  }
  siblings.splice(index, 0, item);
  siblings.forEach((sibling, order) => {
    sibling.order = order;
  });
  item.updatedAt = now();
  validateWorkspace(w);
  return parent;
}
