"use client";
import { useState } from "react";
import { FolderOpen, Plus, Settings2, Layers } from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import { Field, Modal } from "./ui";
import { ancestry } from "@/lib/model";
import {
  cardsInGroup,
  createCardGroup,
  removeCardGroup,
} from "@/lib/enhancements";

export default function StudyGroups({
  ctx,
  value,
  onChange,
}: {
  ctx: AppContext;
  value: string;
  onChange: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(""),
    [containerId, setContainerId] = useState(""),
    [error, setError] = useState("");
  const groups = ctx.w.settings.cardGroups ?? [],
    selected = groups.find((g) => g.id === value);
  const destinations = ctx.w.containers.filter(
    (c) => !c.trashed && ancestry(ctx.w, c.id).every((p) => !p.trashed),
  );
  const path = (id: string) =>
    ancestry(ctx.w, id)
      .map((c) => c.title)
      .join(" / ");
  const linked = destinations.find((c) => c.id === selected?.containerId);
  const edit = (id: string) => {
    const g = groups.find((g) => g.id === id);
    setName(g?.title ?? "");
    setContainerId(g?.containerId ?? "");
    setError("");
    setEditing(id);
  };
  return (
    <section className="study-groups" aria-label="Study groups">
      <div className="study-groups-heading">
        <div>
          <Layers size={17} />
          <h2>Study groups</h2>
        </div>
        <button className="secondary" onClick={() => edit("new")}>
          <Plus size={14} />
          New study group
        </button>
      </div>
      <div className="study-group-controls">
        <Field label="Study group">
          <select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="all">All study cards · {ctx.w.review.length}</option>
            <option value="">
              Ungrouped · {cardsInGroup(ctx.w, "").length}
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} · {cardsInGroup(ctx.w, g.id).length}
              </option>
            ))}
          </select>
        </Field>
        {selected && (
          <button className="secondary" onClick={() => edit(selected.id)}>
            <Settings2 size={14} />
            Edit group
          </button>
        )}
      </div>
      {selected?.containerId ? (
        linked ? (
          <button
            className="group-linked-location"
            onClick={() => ctx.setFocus(linked.id)}
          >
            <FolderOpen size={14} />
            <span>
              Linked to <strong>{path(linked.id)}</strong>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <p className="group-hint">
            Linked location is unavailable. Edit the group to reconnect it.
          </p>
        )
      ) : (
        <p className="group-hint">
          {selected
            ? "A personal set of cards. Link a folder to include its source cards automatically."
            : "Choose a group to focus your review, or connect one to a collection or folder."}
        </p>
      )}
      {editing !== null && (
        <Modal
          title={editing === "new" ? "New study group" : "Edit study group"}
          onClose={() => setEditing(null)}
          description="Organize cards for a subject, project, or part of your workspace."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const title = name.trim();
              if (
                !title ||
                groups.some(
                  (g) =>
                    g.id !== editing &&
                    g.title.toLowerCase() === title.toLowerCase(),
                )
              ) {
                setError("Enter a unique study group name.");
                return;
              }
              if (
                containerId &&
                !destinations.some((c) => c.id === containerId)
              ) {
                setError(
                  "Choose an available collection or folder, or remove the link.",
                );
                return;
              }
              let id = editing;
              ctx.mutate((w) => {
                if (editing === "new")
                  id = createCardGroup(w, title, containerId || undefined).id;
                else {
                  const group = w.settings.cardGroups!.find(
                    (g) => g.id === editing,
                  )!;
                  group.title = title;
                  group.containerId = containerId || undefined;
                }
              });
              if (id !== "new") {
                onChange(id);
                setEditing(null);
              }
            }}
          >
            <Field label="Group name">
              <input
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Artificial intelligence"
              />
            </Field>
            <Field label="Link to a collection or folder">
              <select
                value={containerId}
                onChange={(e) => setContainerId(e.target.value)}
              >
                <option value="">
                  No linked location · choose cards manually
                </option>
                {containerId &&
                  !destinations.some((c) => c.id === containerId) && (
                    <option value={containerId}>Unavailable location</option>
                  )}
                {destinations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {path(c.id)}
                  </option>
                ))}
              </select>
            </Field>
            <p className="field-hint">
              Linked groups include cards from this location and its subfolders.
              Cards you explicitly assign to a group stay in that group. The
              link follows folder renames and moves.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="dialog-footer group-dialog-footer">
              {editing !== "new" && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => {
                    ctx.mutate(
                      (w) => removeCardGroup(w, editing),
                      "Study group removed. All cards and review history are kept.",
                    );
                    onChange("");
                    setEditing(null);
                  }}
                >
                  Delete group · keep cards
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary">
                {editing === "new" ? "Create group" : "Save group"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
