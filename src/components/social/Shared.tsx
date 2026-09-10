"use client";
import { useEffect, useMemo, useState } from "react";
import { socialQuery, type SocialRow } from "@/lib/social";
import { type Workspace, inContainer, ancestry } from "@/lib/model";
import { Modal } from "../ui";
import {
  DateLabel,
  OnlineStatus,
  Status,
  useAction,
  useSocial,
} from "./common";

export default function Shared({ workspace }: { workspace?: Workspace }) {
  const q = useSocial("shared", null, {}, true),
    a = useAction();
  const [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false);
  return (
    <section className="social-page">
      <OnlineStatus />
      {selected ? (
        <Collection
          key={selected}
          id={selected}
          back={() => setSelected(null)}
        />
      ) : (
        <>
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
          <div className="social-grid">
            {q.data?.items.map((c: SocialRow) => (
              <button
                className="social-card"
                key={c.id}
                onClick={() => setSelected(c.id)}
              >
                <h2>{c.title}</h2>
                <p>
                  {c.role} · Updated version {c.revision}
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
            setSelected(id);
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
function Collection({ id, back }: { id: string; back: () => void }) {
  const q = useSocial("collection", id, {}, true),
    a = useAction();
  const [selected, setSelected] = useState<string | null>(null),
    [members, setMembers] = useState(false),
    [trash, setTrash] = useState(false),
    [create, setCreate] = useState<"folder" | "note" | null>(null),
    [title, setTitle] = useState("");
  const d = q.data;
  const node = d?.nodes.find((n: SocialRow) => n.id === selected);
  const [dirty, setDirty] = useState(false);
  const navigate = (fn: () => void) => {
    if (
      !dirty ||
      window.confirm(
        "You have an unsaved draft. Discard it and leave this file?",
      )
    ) {
      setDirty(false);
      fn();
    }
  };
  function tree(parent: string | null, depth = 0): React.ReactNode {
    return d?.nodes
      .filter((n: SocialRow) => n.parent_id === parent && !n.deleted)
      .map((n: SocialRow) => (
        <div key={n.id}>
          <button
            style={{ paddingLeft: 12 + depth * 14 }}
            aria-pressed={n.id === selected}
            onClick={() => navigate(() => setSelected(n.id))}
          >
            {n.kind === "folder" ? "▱" : "▤"} {n.title}
          </button>
          {n.kind === "folder" && tree(n.id, depth + 1)}
        </div>
      ));
  }
  return (
    <>
      <button onClick={() => navigate(back)}>← Shared collections</button>
      <Status loading={q.loading} error={q.error || a.error} retry={q.reload} />
      {d && (
        <>
          <div className="social-heading">
            <div>
              <h1>{d.collection.title}</h1>
              <p>{d.role} access · Changes checked every 5 seconds</p>
            </div>
            <button onClick={() => setMembers(true)}>
              People & permissions
            </button>
          </div>
          <div className="social-row">
            {d.role !== "viewer" && (
              <>
                <button
                  onClick={() => {
                    setCreate("note");
                    setTitle("");
                  }}
                >
                  New shared note
                </button>
                <button
                  onClick={() => {
                    setCreate("folder");
                    setTitle("");
                  }}
                >
                  New shared folder
                </button>
              </>
            )}
            <button aria-pressed={trash} onClick={() => setTrash(!trash)}>
              Trash & recovery
            </button>
            {d.role !== "owner" && (
              <button
                disabled={a.busy}
                onClick={() =>
                  navigate(() => {
                    void a.run("leave", { collection: id }, back);
                  })
                }
              >
                Leave collection
              </button>
            )}
          </div>
          <div className="social-split">
            <nav className="social-tree" aria-label="Shared files">
              {trash
                ? d.nodes
                    .filter((n: SocialRow) => n.deleted)
                    .map((n: SocialRow) => (
                      <button
                        key={n.id}
                        onClick={() => navigate(() => setSelected(n.id))}
                      >
                        {n.title}
                      </button>
                    ))
                : tree(null)}
              {!d.nodes.length && <p>Add a note to start.</p>}
            </nav>
            {node ? (
              <SharedEditor
                key={node.id}
                node={node}
                nodes={d.nodes}
                role={d.role}
                viewerId={d.viewer}
                reload={q.reload}
                dirtyChanged={setDirty}
              />
            ) : (
              <div className="social-card">Choose a file to read or edit.</div>
            )}
          </div>
          <details>
            <summary>Collection activity</summary>
            {d.audit.map((e: SocialRow) => (
              <p key={e.id}>
                {e.action} · <DateLabel value={e.created_at} />
              </p>
            ))}
          </details>
          {members && (
            <Members
              data={d}
              onClose={() => setMembers(false)}
              reload={q.reload}
            />
          )}
          {create && (
            <Modal title={`New ${create}`} onClose={() => setCreate(null)}>
              <form
                className="social-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void a.run(
                    "node-create",
                    {
                      collection: id,
                      kind: create,
                      title,
                      body: "",
                      parent:
                        node?.kind === "folder" && !node.deleted
                          ? node.id
                          : null,
                    },
                    (r) => {
                      setCreate(null);
                      navigate(() => setSelected(r.id));
                      q.reload();
                    },
                  );
                }}
              >
                <label>
                  Name
                  <input
                    required
                    maxLength={240}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <Status error={a.error} />
                <button disabled={a.busy}>Create {create}</button>
              </form>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
function SharedEditor({
  node,
  nodes,
  role,
  reload,
  dirtyChanged,
  viewerId,
}: {
  node: SocialRow;
  nodes: SocialRow[];
  role: string;
  reload: () => void;
  dirtyChanged: (v: boolean) => void;
  viewerId: string;
}) {
  const draftKey = `studyspace:shared-draft:${viewerId}:${node.collection_id}:${node.id}`;
  const [draft, setDraft] = useState(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
        if (
          saved &&
          typeof saved.body === "string" &&
          typeof saved.title === "string" &&
          Number.isSafeInteger(saved.revision)
        )
          return { ...node, ...saved };
      } catch {}
      return { ...node };
    }),
    [history, setHistory] = useState(false),
    [review, setReview] = useState(false);
  const a = useAction();
  const versions = useSocial("versions", node.id);
  const [older, setOlder] = useState<SocialRow[]>([]);
  const dirty =
    draft.title !== node.title ||
    draft.body !== node.body ||
    draft.parent_id !== node.parent_id;
  const editable = role !== "viewer" && !node.deleted;
  useEffect(() => {
    dirtyChanged(dirty);
    try {
      if (dirty)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            title: draft.title,
            body: draft.body,
            parent_id: draft.parent_id,
            revision: draft.revision,
          }),
        );
      else sessionStorage.removeItem(draftKey);
    } catch {}
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, dirtyChanged, draft, draftKey]);
  // Adopt remote changes only when this editor has no local modifications.
  const [baseline, setBaseline] = useState({ ...node });
  useEffect(() => {
    if (node.revision !== baseline.revision) {
      if (
        draft.title === baseline.title &&
        draft.body === baseline.body &&
        draft.parent_id === baseline.parent_id
      )
        setDraft({ ...node });
      setBaseline({ ...node });
    }
  }, [node, draft, baseline]);
  const field = (k: string, v: string | null) => setDraft({ ...draft, [k]: v });
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 5242880) {
      a.setError("Attachments must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      void a.run(
        "asset",
        {
          collection: node.collection_id,
          id: node.id,
          filename: file.name,
          mime: file.type || "text/plain",
          content: String(reader.result).split(",")[1],
        },
        versions.reload,
      );
    reader.onerror = () => a.setError("The attachment could not be read.");
    reader.readAsDataURL(file);
  }
  const save = (revision = draft.revision) =>
    a.run(
      "node-save",
      {
        collection: node.collection_id,
        id: node.id,
        revision,
        title: draft.title,
        body: draft.body,
        parent: draft.parent_id,
      },
      (r) => {
        setDraft({ ...draft, revision: r.revision });
        setReview(false);
        dirtyChanged(false);
        reload();
        versions.reload();
      },
    );
  return (
    <article className="social-editor">
      <Status error={a.error} />
      {node.deleted && (
        <p className="social-error">
          This file is in Trash. Restore a version to recover it.
        </p>
      )}
      {draft.revision !== node.revision && dirty && (
        <div className="social-error">
          A collaborator changed this file. Your draft has been kept.
          <button onClick={() => setReview(true)}>Compare changes</button>
        </div>
      )}
      <label>
        File name
        <input
          readOnly={!editable}
          maxLength={240}
          value={draft.title}
          onChange={(e) => field("title", e.target.value)}
        />
      </label>
      <label>
        Folder
        <select
          disabled={!editable}
          value={draft.parent_id || ""}
          onChange={(e) => field("parent_id", e.target.value || null)}
        >
          <option value="">Collection root</option>
          {nodes
            .filter(
              (n) => n.kind === "folder" && !n.deleted && n.id !== node.id,
            )
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
        </select>
      </label>
      {node.kind === "note" && (
        <label>
          Note (Markdown)
          <textarea
            className="social-note-body"
            readOnly={!editable}
            maxLength={1000000}
            value={draft.body}
            onChange={(e) => field("body", e.target.value)}
          />
        </label>
      )}
      <div className="social-row">
        {editable && (
          <>
            <button
              className="primary"
              disabled={a.busy || !draft.title.trim()}
              onClick={() => void save()}
            >
              Save changes
            </button>
            <button
              disabled={a.busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Move this file to Trash? Its saved versions remain recoverable.",
                  )
                )
                  void a.run(
                    "node-delete",
                    {
                      collection: node.collection_id,
                      id: node.id,
                      revision: node.revision,
                    },
                    reload,
                  );
              }}
            >
              Move to Trash
            </button>
          </>
        )}
        <button onClick={() => setHistory(!history)}>Version history</button>
        <span>
          Version {node.revision}
          {dirty ? " · Unsaved draft" : " · Saved"}
        </span>
      </div>
      <h3>Attachments</h3>
      <Status error={versions.error} />
      {versions.data?.assets.map((s: SocialRow) => (
        <div className="social-row" key={s.id}>
          <a href={"/api/social/assets/" + s.id}>
            {s.filename} ({Math.ceil(s.size / 1024)} KB)
          </a>
          {editable && (
            <button
              disabled={a.busy}
              onClick={() =>
                a.run(
                  "asset-delete",
                  { collection: node.collection_id, id: s.id },
                  versions.reload,
                )
              }
            >
              Remove attachment
            </button>
          )}
        </div>
      ))}
      {editable && (
        <label>
          Add attachment (PDF, image or text, up to 5 MB)
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown"
            disabled={a.busy}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      )}
      {history && (
        <div>
          <h3>Saved versions</h3>
          {[...(versions.data?.items || []), ...older].map((v) => (
            <details key={v.revision}>
              <summary>
                Version {v.revision} · <DateLabel value={v.created_at} />
              </summary>
              <h4>{v.snapshot.title}</h4>
              <pre>{v.snapshot.body}</pre>
              {role !== "viewer" && (
                <button
                  disabled={a.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Restore this version into the collection root? Your current saved version remains in history.",
                      )
                    )
                      void a.run(
                        "node-restore",
                        {
                          collection: node.collection_id,
                          id: node.id,
                          revision: node.revision,
                          version: v.revision,
                        },
                        () => {
                          setDraft({
                            ...v.snapshot,
                            revision: node.revision + 1,
                            parent_id: null,
                            deleted: false,
                          });
                          reload();
                          versions.reload();
                        },
                      );
                  }}
                >
                  Restore this version
                </button>
              )}
            </details>
          ))}
          {(versions.data?.items.length || 0) + older.length >= 30 && (
            <button
              onClick={async () => {
                try {
                  const rows = [...(versions.data?.items || []), ...older];
                  const r = await socialQuery("versions", node.id, {
                    revision: String(rows.at(-1).revision),
                  });
                  setOlder([...older, ...r.items]);
                } catch (e) {
                  a.setError((e as Error).message);
                }
              }}
            >
              Older versions
            </button>
          )}
        </div>
      )}
      {review && (
        <Modal
          title="Compare before saving"
          onClose={() => setReview(false)}
          wide
          description="Review the latest saved content alongside your draft. Combine the changes in your draft, then explicitly save it against this version."
        >
          <div className="social-grid">
            <div>
              <h3>Latest saved · {node.title}</h3>
              <pre>{node.body}</pre>
            </div>
            <label>
              Your draft
              <textarea
                aria-label="Your draft"
                rows={15}
                value={draft.body}
                onChange={(e) => field("body", e.target.value)}
              />
            </label>
          </div>
          <Status error={a.error} />
          <div className="social-row">
            <button disabled={a.busy} onClick={() => void save(node.revision)}>
              Save reviewed draft against version {node.revision}
            </button>
            <button
              onClick={() => {
                setDraft({ ...node });
                setReview(false);
              }}
            >
              Discard draft and use latest
            </button>
          </div>
        </Modal>
      )}
    </article>
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
  const [search, setSearch] = useState(""),
    [target, setTarget] = useState(""),
    [role, setRole] = useState("viewer");
  const people = useSocial("people", null, { q: search }),
    a = useAction();
  const owner = d.role === "owner";
  return (
    <Modal title="People & permissions" onClose={onClose} wide>
      <div className="social-form">
        <p>
          Owner: {d.collection.owner_id}. Viewers can read; editors can change
          and remove files. Only the owner manages membership. Publishing is a
          separate action.
        </p>
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
                    "member",
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
            <h3>Invite a collaborator</h3>
            <label>
              Find public username
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="social-row">
              {search &&
                people.data?.items.map((p: SocialRow) => (
                  <button key={p.id} onClick={() => setTarget(p.id)}>
                    @{p.username}
                  </button>
                ))}
            </div>
            <label>
              Collaborator's account ID
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Paste the other person's account ID"
              />
            </label>
            <p className="muted">
              Ask them to open their profile and copy their account ID. They do
              not need to create a social profile or make it public.
            </p>
            <label>
              Permission
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">
                  Transfer ownership upon acceptance
                </option>
              </select>
            </label>
            {role === "owner" && (
              <p className="social-error">
                Once accepted, you become an editor and the new owner controls
                membership.
              </p>
            )}
            <button
              className="primary"
              disabled={a.busy || !target}
              onClick={() =>
                a.run(
                  "invite",
                  { collection: d.collection.id, target, role },
                  () => {
                    setTarget("");
                    reload();
                  },
                )
              }
            >
              Send invitation
            </button>
          </>
        )}
        <Status error={a.error || people.error} />
      </div>
    </Modal>
  );
}
