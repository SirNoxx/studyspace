"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Folder,
  FileText,
  FolderPlus,
  Plus,
  Library,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import SharedLiveWorkspace from "./SharedLiveWorkspace";
import CollaborationPanel from "./CollaborationPanel";
import { type SocialRow } from "@/lib/social";
import { type Workspace, inContainer, ancestry } from "@/lib/model";
import { Modal } from "../ui";
import {
  DateLabel,
  OnlineStatus,
  Status,
  useAction,
  useSocial,
} from "./common";

function SharedSidebar({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const element = document.getElementById("shared-explorer-slot");
    if (element !== target) setTarget(element);
  });
  return target ? (
    createPortal(children, target)
  ) : (
    <div className="shared-explorer-body shared-explorer-fallback">
      {children}
    </div>
  );
}

export default function Shared({ workspace }: { workspace?: Workspace }) {
  const q = useSocial("shared", null, {}, true),
    a = useAction();
  const [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false);
  const [liveMembers, setLiveMembers] = useState(false);
  const openCollection = (id: string) => {
    history.pushState(
      {},
      "",
      `${location.pathname.startsWith("/demo") ? "/demo" : "/w"}/shared/${id}`,
    );
    setSelected(id);
  };
  useEffect(() => {
    const path = location.pathname.split("/");
    if (path[2] === "shared" && /^[0-9a-f-]{36}$/i.test(path[3] ?? ""))
      setSelected(path[3]);
  }, []);
  return (
    <section className="social-page">
      <OnlineStatus />
      {selected ? (
        <>
          <SharedLiveWorkspace
            key={selected}
            id={selected}
            account={q.data?.viewer ?? "community"}
            workspace={workspace}
            back={() => {
              setSelected(null);
              history.pushState(
                {},
                "",
                location.pathname.startsWith("/demo")
                  ? "/demo/shared"
                  : "/w/shared",
              );
            }}
            members={() => setLiveMembers(true)}
          />
          {liveMembers && (
            <LiveMembers id={selected} close={() => setLiveMembers(false)} />
          )}
        </>
      ) : (
        <>
          <SharedSidebar>
            <div className="tree-heading">
              <span>SHARED COLLECTIONS</span>
              <button
                aria-label="New shared collection"
                onClick={() => setCreate(true)}
              >
                <Plus size={16} />
              </button>
            </div>
            <nav
              className="shared-explorer-tree tree-scroll"
              aria-label="Shared collections"
            >
              {q.data?.items.map((c: SocialRow) => (
                <button
                  className="tree-row root-row"
                  key={c.id}
                  onClick={() => openCollection(c.id)}
                >
                  <ChevronRight className="disclosure" size={12} />
                  <Library size={17} />
                  <span className="tree-title">{c.title}</span>
                  {(c.member_count > 0 || c.role !== "owner") && (
                    <Users
                      className="shared-people"
                      size={15}
                      aria-label="Has collaborators"
                    />
                  )}
                </button>
              ))}
            </nav>
          </SharedSidebar>
          <div className="social-heading">
            <div>
              <span className="eyebrow">A SPACE TO LEARN TOGETHER</span>
              <h1>Shared collections</h1>
              <p>
                Invite people to a separate collection. Your personal workspace
                stays private.
              </p>
            </div>
            <button className="primary" onClick={() => setCreate(true)}>
              New shared collection
            </button>
          </div>
          <Status
            loading={q.loading}
            error={q.error || a.error}
            retry={q.reload}
          />
          {q.data?.invitations.length > 0 && (
            <>
              <h2>Invitations</h2>
              {q.data?.invitations.map((i: SocialRow) => (
                <article className="social-card" key={i.id}>
                  <h3>{i.title}</h3>
                  <p>
                    You’re invited as {i.role}.
                    {i.role === "owner" &&
                      " Accepting transfers ownership and responsibility for this collection to you."}
                  </p>
                  <div className="social-row">
                    <button
                      disabled={a.busy}
                      onClick={() =>
                        a.run(
                          "invitation",
                          { id: i.id, accept: true },
                          q.reload,
                        )
                      }
                    >
                      Accept invitation
                    </button>
                    <button
                      disabled={a.busy}
                      onClick={() =>
                        a.run(
                          "invitation",
                          { id: i.id, accept: false },
                          q.reload,
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                </article>
              ))}
            </>
          )}
          <CollaborationPanel kind="collection" onChange={q.reload} />
          <div className="social-grid">
            {q.data?.items.map((c: SocialRow) => (
              <button
                className="shared-home-card"
                key={c.id}
                onClick={() => openCollection(c.id)}
              >
                <h2>
                  <Library size={20} />
                  {c.title}
                  {(c.member_count > 0 || c.role !== "owner") && (
                    <Users size={17} aria-label="Has collaborators" />
                  )}
                </h2>
                <p>
                  {c.role} access · {c.member_count ?? 0} collaborators
                </p>
              </button>
            ))}
          </div>
          {q.data && !q.data.items.length && (
            <p>
              No shared collections yet. Create one or accept an invitation.
            </p>
          )}
        </>
      )}
      {create && (
        <CreateCollection
          workspace={workspace}
          onClose={() => setCreate(false)}
          created={(id) => {
            setCreate(false);
            openCollection(id);
            q.reload();
          }}
        />
      )}
    </section>
  );
}
function CreateCollection({
  workspace: w,
  onClose,
  created,
}: {
  workspace?: Workspace;
  onClose: () => void;
  created: (id: string) => void;
}) {
  const [title, setTitle] = useState(""),
    [source, setSource] = useState("");
  const a = useAction();
  const preview = useMemo(() => {
    if (!w || !source) return [];
    const folders = w.containers.filter(
      (c) =>
        c.id !== source &&
        inContainer(w, c.id, source) &&
        !c.trashed &&
        !c.archived &&
        !c.system &&
        ancestry(w, c.id).every(
          (parent) => !parent.trashed && !parent.archived && !parent.system,
        ),
    );
    const ids = new Set([source, ...folders.map((c) => c.id)]);
    const notes = w.notes.filter(
      (n) =>
        ids.has(n.containerId) &&
        !n.trashed &&
        !n.archived &&
        n.kind === "note",
    );
    return [
      ...folders.map((c) => ({
        id: c.id,
        parent_id: c.parentId === source ? null : c.parentId,
        kind: "folder",
        title: c.title,
        body: "",
      })),
      ...notes.map((n) => ({
        id: n.id,
        parent_id: n.containerId === source ? null : n.containerId,
        kind: "note",
        title: n.title || "Untitled note",
        body: n.body,
      })),
    ];
  }, [source, w]);
  // Stable IDs also make retries safe after an uncertain network result.
  const copied = useMemo(() => {
    const ids = new Map(preview.map((n) => [n.id, crypto.randomUUID()]));
    return preview.map((n) => ({
      ...n,
      id: ids.get(n.id),
      parent_id: n.parent_id ? ids.get(n.parent_id) || null : null,
    }));
  }, [preview]);
  return (
    <Modal title="Create shared collection" onClose={onClose} wide>
      <form
        className="social-form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run("collection", { title, nodes: copied }, (r) =>
            created(r.id),
          );
        }}
      >
        <label>
          Collection name
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {w && (
          <label>
            Start with an explicit copy
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Empty collection</option>
              {w.containers
                .filter(
                  (c) =>
                    c.kind === "collection" &&
                    !c.system &&
                    !c.trashed &&
                    !c.archived,
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </label>
        )}
        {source && (
          <>
            <p>
              The following {preview.length} folders and notes will be copied.
              Review their contents before sharing. Attachments and private
              metadata are excluded; upload any desired attachments separately.
            </p>
            <ul className="social-preview">
              {preview.map((n) => (
                <li key={n.id}>
                  {n.kind}: {n.title}
                </li>
              ))}
            </ul>
            {preview.length > 200 && (
              <p role="alert">Choose a collection with at most 200 items.</p>
            )}
          </>
        )}
        <p>
          No one else has access until they accept an invitation. This does not
          publish your work to Discover.
        </p>
        <Status error={a.error} />
        <button className="primary" disabled={a.busy || preview.length > 200}>
          Create shared collection
        </button>
      </form>
    </Modal>
  );
}
function Members({
  data: d,
  onClose,
  reload,
}: {
  data: SocialRow;
  onClose: () => void;
  reload: () => void;
}) {
  const a = useAction();
  const owner = d.role === "owner";
  return (
    <Modal title="People & permissions" onClose={onClose} wide>
      <div className="social-form">
        <p>
          Owner: {d.collection.owner_id}. Viewers can read; editors can change
          and remove files. Only the owner manages membership. Publishing is a
          separate action.
        </p>
        <CollaborationPanel
          kind="collection"
          collection={d.collection.id}
          canInvite={owner}
          onChange={reload}
        />
        {d.members.map((m: SocialRow) => (
          <div className="social-row" key={m.user_id}>
            <span>@{m.username || "Member"}</span>
            {owner ? (
              <select
                aria-label={`Role for ${m.username}`}
                value={m.role}
                disabled={a.busy}
                onChange={(e) =>
                  void a.run(
                    e.target.value === "owner" ? "invite" : "member",
                    {
                      collection: d.collection.id,
                      target: m.user_id,
                      role: e.target.value,
                    },
                    reload,
                  )
                }
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Offer ownership transfer</option>
              </select>
            ) : (
              <span>{m.role}</span>
            )}
            {owner && (
              <button
                disabled={a.busy}
                onClick={() =>
                  a.run(
                    "member",
                    {
                      collection: d.collection.id,
                      target: m.user_id,
                      role: "remove",
                    },
                    reload,
                  )
                }
              >
                Revoke access
              </button>
            )}
          </div>
        ))}
        {owner && (
          <>
            <h3>Pending invitations</h3>
            {d.invitations.map((i: SocialRow) => (
              <div className="social-row" key={i.id}>
                <span>
                  {i.username || i.recipient_id} · {i.role}
                </span>
                <button
                  disabled={a.busy}
                  onClick={() =>
                    a.run(
                      "member",
                      {
                        collection: d.collection.id,
                        target: i.recipient_id,
                        role: "remove",
                      },
                      reload,
                    )
                  }
                >
                  Revoke invitation
                </button>
              </div>
            ))}
          </>
        )}
        <Status error={a.error} />
      </div>
    </Modal>
  );
}

function LiveMembers({ id, close }: { id: string; close: () => void }) {
  const q = useSocial("collection", id);
  return q.data ? (
    <Members data={q.data} onClose={close} reload={q.reload} />
  ) : (
    <Modal title="People & permissions" onClose={close}>
      <Status loading={q.loading} error={q.error} retry={q.reload} />
    </Modal>
  );
}
