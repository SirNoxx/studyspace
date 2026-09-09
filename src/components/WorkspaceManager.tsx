"use client";
import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { emptyWorkspace, uid, type Workspace } from "@/lib/model";
import { localDB, loadLocal } from "@/lib/store";
import type { AppContext } from "./WorkspaceApp";
import { Field, Modal } from "./ui";

export default function WorkspaceManager({
  ctx,
  localKey,
  switchWorkspace,
  onClose,
}: {
  ctx: AppContext;
  localKey: string;
  switchWorkspace: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(
    ctx.w.settings.workspaceName ?? "My workspace",
  );
  const [newName, setNewName] = useState("");
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadLocal();
      const db = await localDB();
      const keys = (await db.getAllKeys("workspaces")).filter(
        (k) => k === "demo" || String(k).startsWith("device:"),
      );
      const values = await Promise.all(
        keys.map(async (id) => {
          const w = (await db.get("workspaces", id)) as Workspace;
          return {
            id: String(id),
            name: w.settings.workspaceName ?? "My workspace",
          };
        }),
      );
      if (!cancelled) setItems(values);
    })().catch((e) => {
      if (!cancelled) setError((e as Error).message);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const open = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await switchWorkspace(id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Workspaces"
      description="Give each workspace its own name, notes, and collections."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          ctx.mutate((w) => {
            w.settings.workspaceName = name.trim();
          }, "Workspace renamed.");
          setItems((old) =>
            old.map((w) =>
              w.id === localKey && ctx.demo ? { ...w, name: name.trim() } : w,
            ),
          );
        }}
      >
        <Field label="Workspace name">
          <input
            value={name}
            maxLength={80}
            required
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <button className="secondary" disabled={busy || !name.trim()}>
          Save name
        </button>
      </form>
      <div className="workspace-list" aria-label="Device workspaces">
        {items.map((w) => (
          <button
            key={w.id}
            disabled={busy}
            aria-current={ctx.demo && w.id === localKey ? "true" : undefined}
            onClick={() => void open(w.id)}
          >
            <span>
              {w.name}
              <small> · On this device</small>
            </span>
            {ctx.demo && w.id === localKey && <Check size={16} />}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim() || busy) return;
          setBusy(true);
          setError("");
          try {
            const id = "device:" + uid(),
              workspace = emptyWorkspace();
            workspace.settings.workspaceName = newName.trim();
            workspace.settings.theme = ctx.w.settings.theme;
            workspace.settings.onboardingComplete = true;
            await (await localDB()).put("workspaces", workspace, id);
            setItems((old) => [...old, { id, name: newName.trim() }]);
            setNewName("");
            await open(id);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <Field label="New workspace name">
          <input
            value={newName}
            maxLength={80}
            required
            disabled={busy}
            placeholder="e.g. Personal research"
            onChange={(e) => setNewName(e.target.value)}
          />
        </Field>
        <button className="primary" disabled={busy || !newName.trim()}>
          <Plus size={15} /> Create workspace
        </button>
        <p className="muted">
          Additional workspaces are saved on this device. Export a backup from
          each workspace to move it elsewhere.
        </p>
      </form>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
