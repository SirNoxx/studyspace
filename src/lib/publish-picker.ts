import {
  type Workspace,
  type Container,
  type Note,
  ancestry,
  inContainer,
} from "./model";
import { treeItems } from "./tree";

export type PublishBranch = {
  item: Container | Note;
  children: PublishBranch[];
  files: number;
};

export function publishTree(
  w: Workspace,
  parent: string | null = null,
): PublishBranch[] {
  return treeItems(w, parent)
    .filter(
      (item) => "parentId" in item || !["journal", "dream"].includes(item.kind),
    )
    .map((item) => {
      const children = "parentId" in item ? publishTree(w, item.id) : [];
      return {
        item,
        children,
        files:
          "parentId" in item
            ? children.reduce((sum, child) => sum + child.files, 0)
            : 1,
      };
    });
}

/** Container publication defaults must match the visible picker hierarchy. */
export function publicationCandidates(
  w: Workspace,
  id?: string,
  container?: boolean,
) {
  return w.notes.filter(
    (note) =>
      !note.trashed &&
      (container
        ? !note.archived &&
          !["quick", "journal", "dream"].includes(note.kind) &&
          inContainer(w, note.containerId, id!) &&
          ancestry(w, note.containerId).every(
            (parent) =>
              !parent.trashed &&
              !parent.archived &&
              parent.system !== "quick" &&
              parent.system !== "pinned",
          )
        : note.id === id),
  );
}
