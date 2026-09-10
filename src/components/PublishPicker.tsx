"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Library,
  Search,
} from "lucide-react";
import { type Workspace, ancestry } from "@/lib/model";
import { publishTree, type PublishBranch } from "@/lib/publish-picker";
import { Modal } from "./ui";
import "./PublishPicker.css";

export default function PublishPicker({
  w,
  onSelect,
  onClose,
}: {
  w: Workspace;
  onSelect: (id: string, container: boolean) => void;
  onClose: () => void;
}) {
  const branches = useMemo(() => publishTree(w), [w]);
  const [expanded, setExpanded] = useState(
    () =>
      new Set(w.containers.filter((c) => c.parentId === null).map((c) => c.id)),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const matches = (branch: PublishBranch): boolean =>
    branch.item.title.toLocaleLowerCase().includes(search) ||
    branch.children.some(matches);
  const find = (nodes: PublishBranch[]): PublishBranch | undefined => {
    for (const node of nodes) {
      if (node.item.id === selected) return node;
      const found = find(node.children);
      if (found) return found;
    }
  };
  const selection = find(branches);
  const selectedItem = selection?.item;
  const path = selectedItem
    ? [
        ...ancestry(
          w,
          "parentId" in selectedItem
            ? selectedItem.id
            : selectedItem.containerId,
        ).map((c) => c.title),
        ...("parentId" in selectedItem
          ? []
          : [selectedItem.title || "Untitled"]),
      ].join(" / ")
    : "";

  function render(nodes: PublishBranch[], ancestorMatches = false) {
    const visible = search && !ancestorMatches ? nodes.filter(matches) : nodes;
    return (
      <ul className="publish-tree-list">
        {visible.map((branch) => {
          const { item, children, files } = branch;
          const container = "parentId" in item;
          const collection = container && item.kind !== "folder";
          const open = !!search || expanded.has(item.id);
          const kind = collection
            ? "Collection"
            : container
              ? "Folder"
              : "File";
          const title = item.title || "Untitled";
          const Icon = collection
            ? Library
            : container
              ? open
                ? FolderOpen
                : Folder
              : FileText;
          return (
            <li key={item.id}>
              <div
                className={
                  "publish-tree-row" +
                  (selected === item.id ? " is-selected" : "")
                }
              >
                {children.length > 0 ? (
                  <button
                    type="button"
                    className="publish-tree-toggle"
                    aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
                    aria-expanded={open}
                    disabled={!!search}
                    onClick={() =>
                      setExpanded((previous) => {
                        const next = new Set(previous);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    <ChevronRight size={16} className={open ? "is-open" : ""} />
                  </button>
                ) : (
                  <span className="publish-tree-spacer" />
                )}
                <button
                  type="button"
                  className="publish-tree-select"
                  aria-label={`Select ${kind.toLowerCase()} ${title}`}
                  aria-pressed={selected === item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <span
                    className={
                      "publish-tree-icon" + (collection ? " is-collection" : "")
                    }
                    style={
                      collection
                        ? ({ "--publish-color": item.color } as CSSProperties)
                        : undefined
                    }
                  >
                    <Icon size={19} />
                  </span>
                  <span className="publish-tree-title">
                    {title}
                    <small>
                      {kind}
                      {container
                        ? ` · ${files} ${files === 1 ? "file" : "files"}`
                        : ""}
                    </small>
                  </span>
                  {selected === item.id && (
                    <Check size={17} className="publish-tree-check" />
                  )}
                </button>
              </div>
              {open &&
                children.length > 0 &&
                render(
                  children,
                  ancestorMatches ||
                    item.title.toLocaleLowerCase().includes(search),
                )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Modal
      title="Publish to Discover"
      description="Choose a collection, folder, or file. Expand folders to explore what’s inside. Your originals stay private."
      onClose={onClose}
      wide
    >
      <div className="publish-picker">
        <label className="publish-picker-search">
          <Search size={18} />
          <input
            aria-label="Search collections, folders, and files"
            placeholder="Find a collection, folder, or file…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className="publish-picker-tree"
          aria-label="Workspace publication picker"
        >
          {branches.length && (!search || branches.some(matches)) ? (
            render(branches)
          ) : (
            <p className="publish-picker-empty">
              {search
                ? "No matching collections, folders, or files."
                : "Add a note to a collection to get started."}
            </p>
          )}
        </div>
        <div className="publish-picker-selection" aria-live="polite">
          {selection ? (
            <>
              <strong>{selectedItem?.title || "Untitled"}</strong>
              <span>{path}</span>
              <small>
                {selection.files
                  ? `${selection.files} ${selection.files === 1 ? "file" : "files"} selected for review. You can adjust what becomes public next.`
                  : "This folder or collection has no files to publish yet."}
              </small>
            </>
          ) : (
            <span>Select something to review before publishing.</span>
          )}
        </div>
        <div className="dialog-footer">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!selection?.files}
            onClick={() =>
              selectedItem &&
              onSelect(selectedItem.id, "parentId" in selectedItem)
            }
          >
            Review selection <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
