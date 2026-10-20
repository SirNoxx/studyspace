"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { SharedSession } from "@/lib/shared/session";
import { emptyWorkspace, type Workspace } from "@/lib/model";
const WorkspaceApp = dynamic(() => import("../WorkspaceApp"), { ssr: false });
export default function SharedLiveWorkspace({
  id,
  account,
  workspace,
  back,
  members,
}: {
  id: string;
  account: string;
  workspace?: Workspace;
  back: () => void;
  members: () => void;
}) {
  const [session, setSession] = useState<SharedSession | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const personal = emptyWorkspace();
    if (workspace) personal.settings = { ...workspace.settings };
    personal.settings.onboardingComplete = true;
    const connection = new SharedSession(id, account, personal, back, members);
    let alive = true;
    connection
      .load()
      .then(() => {
        if (alive) setSession(connection);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      connection.dispose();
    };
  }, [id, account]);
  useEffect(() => {
    if (!session) return;
    const parent = document.querySelector<HTMLElement>(
      ".app-shell:not(.shared-note-workspace)",
    );
    const wasInert = parent?.inert ?? false;
    if (parent) parent.inert = true;
    return () => {
      if (parent) parent.inert = wasInert;
    };
  }, [session]);
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button onClick={back}>Back to shared collections</button>
      </div>
    );
  if (!session) return <p role="status">Opening shared workspace…</p>;
  return createPortal(
    <div className="shared-workspace-overlay">
      <WorkspaceApp
        account={session.account + ":shared:" + id}
        collaboration={session}
      />
    </div>,
    document.body,
  );
}
