"use client";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Copy,
  Download,
  MessageSquare,
  Lock,
  Globe,
  GitBranch,
  ArrowRight,
  Check,
  Flag,
} from "lucide-react";
import type { Snapshot } from "@/lib/model";
import { uid } from "@/lib/model";
import Markdown from "./Markdown";
import { focusPassage } from "@/lib/focus-passage";
import PdfViewer from "./study/PdfViewer";
import VersionHistory from "./study/VersionHistory";
import { Modal, Field } from "./ui";
export default function PublicReader({
  snapshot: p,
  authorId,
  signedIn,
  initialNote,
}: {
  snapshot: Snapshot;
  authorId: string;
  signedIn: boolean;
  initialNote?: string;
}) {
  const [noteId, setNoteId] = useState(initialNote ?? p.notes[0]?.id),
    [dialog, setDialog] = useState(""),
    [quote, setQuote] = useState(""),
    [body, setBody] = useState(""),
    [category, setCategory] = useState("Unclear explanation"),
    [message, setMessage] = useState(""),
    [threads, setThreads] = useState<any[]>([]),
    [definition, setDefinition] = useState(""),
    [actionId, setActionId] = useState(uid()),
    [read, setRead] = useState<string[]>([]);
  const note = p.notes.find((n) => n.id === noteId) ?? p.notes[0];
  useEffect(() => {
    fetch("/api/community?publicationId=" + p.publicationId)
      .then((r) => r.json())
      .then((d) => setThreads(d.threads ?? []));
    if (signedIn)
      fetch("/api/workspace")
        .then((r) => r.json())
        .then((w) => setRead(w.progress?.[p.publicationId] ?? []));
  }, [p.publicationId, signedIn]);
  const auth = () => {
    if (signedIn) return true;
    location.href = "/auth?next=" + encodeURIComponent(location.pathname);
    return false;
  };
  const savePersonal = async (action: string) => {
    if (!auth()) return;
    const response = await fetch("/api/reader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        publicationId: p.publicationId,
        versionId: p.id,
        noteId: note.id,
        quote,
        body,
        idempotencyKey: actionId,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    if (action === "progress")
      setRead((old) => [...new Set([...old, note.id])]);
    setMessage(
      action === "bookmark"
        ? "Saved to your library."
        : action === "annotation"
          ? "Private note saved."
          : "Reading progress saved.",
    );
    setDialog("");
    setActionId(uid());
  };
  return (
    <div className="public-shell">
      <header className="public-header">
        <a className="brand" href="/">
          studyspace<span className="brand-dot">.</span>
        </a>
        <nav>
          <a href="/discover">Discover</a>
          <a href={signedIn ? "/w" : "/auth"}>
            {signedIn ? "My workspace" : "Sign in"}
          </a>
        </nav>
      </header>
      <div className="public-layout">
        <aside className="public-toc">
          <h3>IN THIS COLLECTION</h3>
          {p.notes.map((n) => (
            <button
              key={n.id}
              className={n.id === noteId ? "active" : ""}
              onClick={() => {
                setNoteId(n.id);
                history.replaceState({}, "", `/p/${p.publicationId}/${n.id}`);
                scrollTo({ top: 0 });
              }}
            >
              <BookOpen size={14} />
              {n.title}
              {read.includes(n.id) && <Check size={12} />}
            </button>
          ))}
          <button onClick={() => setDialog("dictionary")}>
            Dictionary · {p.definitions.length}
          </button>
          <button onClick={() => setDialog("sources")}>
            Sources · {p.sources.length}
          </button>
          <button onClick={() => setDialog("lineage")}>
            <GitBranch size={14} /> Attribution
          </button>
          <button onClick={() => setDialog("versions")}>
            Version & change summary
          </button>
        </aside>
        <main className="public-article">
          <span className="eyebrow">
            <Globe size={12} />
            PUBLISHED RESEARCH · VERSION {p.version}
          </span>
          <h1>{p.title}</h1>
          <p className="muted">{p.description}</p>
          <div className="public-author">
            <a href={"/author/" + authorId}>{p.author}</a>
            <span>{new Date(p.createdAt).toLocaleDateString()}</span>
            <span>{p.notes.length} notes</span>
          </div>
          <div className="public-actions">
            <button
              className="secondary"
              onClick={() => void savePersonal("bookmark")}
            >
              <Bookmark size={14} />
              Save to library
            </button>
            {p.allowCopies && (
              <button
                className="primary"
                onClick={() => {
                  if (auth()) setDialog("copy");
                }}
              >
                <Copy size={14} /> Make a study copy
              </button>
            )}
            {p.allowDownload && (
              <a
                className="secondary"
                href={"/api/publications?id=" + p.publicationId + "&download=1"}
              >
                <Download size={14} /> Download
              </a>
            )}
            <button
              className="text-button"
              onClick={() => {
                if (auth()) {
                  setDialog("clarification");
                  setActionId(uid());
                }
              }}
            >
              Request clarification
            </button>
          </div>
          <div className="public-note-heading">{note.title}</div>
          <article
            onMouseUp={() => setQuote(window.getSelection()?.toString() ?? "")}
          >
            <Markdown
              notes={p.notes.map((n) => ({
                ...n,
                originalPath: n.path + "/" + n.title + ".md",
              }))}
              attachments={p.attachments}
              publicAssetBase={
                "/api/public-assets/" + p.publicationId + "/" + p.id + "/"
              }
              onAttachment={(id) => {
                setDefinition(id);
                setDialog("pdf");
              }}
              body={note.body}
              definitions={p.definitions}
              onDefinition={(id) => {
                setDefinition(id);
                setDialog("definition");
              }}
              onLink={(target) => {
                const n = p.notes.find((n) => n.title === target.split("#")[0]);
                if (n) setNoteId(n.id);
                else
                  setMessage(
                    "This reference is not included in the publication.",
                  );
              }}
              onCitation={(id) => {
                const a = p.anchors.find((a) => a.id === id);
                if (a) {
                  setDefinition(a.id);
                  setQuote(a.quote);
                  setDialog("evidence");
                }
              }}
            />
          </article>
          <section className="author-annotations">
            {p.annotations
              .filter((a) => a.noteId === note.id)
              .map((a) => (
                <aside key={a.id}>
                  <span className="badge">Author annotation</span>
                  <blockquote>{a.quote}</blockquote>
                  <Markdown body={a.body} />
                </aside>
              ))}
          </section>
          <div className="public-actions">
            <button
              className="secondary"
              onClick={() => void savePersonal("progress")}
            >
              <Check size={15} />
              {read.includes(note.id) ? "Read" : "Mark as read"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (auth()) {
                  setBody("");
                  setDialog("annotation");
                  setActionId(uid());
                }
              }}
            >
              <Lock size={14} /> Private study note
            </button>
            {p.allowQA && (
              <button
                className="secondary"
                onClick={() => {
                  if (auth()) {
                    setBody("");
                    setDialog("question");
                    setActionId(uid());
                  }
                }}
              >
                <MessageSquare size={14} /> Ask a public question
              </button>
            )}
          </div>
          {message && (
            <p role="status" className="quiet-callout">
              {message}
            </p>
          )}
          {p.allowQA && (
            <section className="public-questions">
              <h2>Questions in the margins</h2>
              <p className="muted">
                Select a passage to give your question a precise home.
              </p>
              {threads
                .filter((t) => t.note_id === note.id)
                .map((t) => (
                  <div className="question-row" key={t.id}>
                    <span className="badge">
                      {t.resolved ? "Resolved question" : "Public question"}
                    </span>
                    <small>
                      {t.anchorState === "attached"
                        ? "Passage matched"
                        : t.anchorState === "changed"
                          ? "Passage changed / ambiguous"
                          : "Passage unavailable in this version"}
                    </small>
                    <small>{new Date(t.created_at).toLocaleDateString()}</small>
                    <blockquote>
                      {t.anchor.quote ? (
                        <button
                          className="text-button"
                          onClick={() => {
                            if (
                              !focusPassage(
                                document.querySelector(
                                  ".public-article > article",
                                ),
                                t.anchor.quote,
                                t.anchor.prefix,
                                t.anchor.suffix,
                              )
                            )
                              setMessage(
                                "This passage is unavailable or ambiguous in this version. Use the original published version to inspect its context.",
                              );
                          }}
                        >
                          {t.anchor.quote}
                        </button>
                      ) : (
                        "About this note"
                      )}
                    </blockquote>
                    <Markdown body={t.body} />
                    {t.version_id !== p.id && (
                      <a
                        className="text-button"
                        href={
                          "/p/" +
                          p.publicationId +
                          "/" +
                          t.note_id +
                          "?version=" +
                          t.version_id
                        }
                      >
                        Open original published passage
                      </a>
                    )}
                    {t.thread_replies?.map((r: any) => (
                      <blockquote key={r.id}>
                        <Markdown body={r.body} />
                      </blockquote>
                    ))}
                    <button
                      className="text-button"
                      onClick={() => {
                        if (auth()) {
                          setDefinition(t.id);
                          setBody("");
                          setDialog("reply");
                        }
                      }}
                    >
                      Reply
                    </button>
                    {signedIn && (
                      <>
                        <button
                          className="text-button"
                          onClick={async () => {
                            const r = await fetch("/api/community", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "thread-update",
                                threadId: t.id,
                                operation: t.resolved ? "reopen" : "resolve",
                              }),
                            });
                            if (r.ok)
                              setThreads((ts) =>
                                ts.map((x) =>
                                  x.id === t.id
                                    ? { ...x, resolved: !x.resolved }
                                    : x,
                                ),
                              );
                            else
                              setMessage(
                                "Only the question author, publication author, or moderator may change its status.",
                              );
                          }}
                        >
                          {t.resolved ? "Reopen" : "Resolve"}
                        </button>
                        <button
                          className="text-button"
                          onClick={async () => {
                            const r = await fetch("/api/community", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "thread-update",
                                threadId: t.id,
                                operation: "delete",
                              }),
                            });
                            if (r.ok)
                              setThreads((ts) =>
                                ts.filter((x) => x.id !== t.id),
                              );
                            else
                              setMessage(
                                "Only an authorized participant may remove this question.",
                              );
                          }}
                        >
                          Remove question
                        </button>
                      </>
                    )}
                  </div>
                ))}
              {!threads.length && <p className="muted">No questions yet.</p>}
            </section>
          )}
          <button
            className="text-button"
            onClick={() => {
              if (auth()) {
                setDialog("report");
                setBody("");
                setActionId(uid());
              }
            }}
          >
            <Flag size={13} /> Report this publication
          </button>
        </main>
      </div>
      {dialog && (
        <Modal
          title={
            dialog === "annotation"
              ? "Your private study note"
              : dialog === "question"
                ? "Ask a public question"
                : dialog === "clarification"
                  ? "Request clarification privately"
                  : dialog === "copy"
                    ? "Make this research your own"
                    : dialog === "report"
                      ? "Report a concern"
                      : dialog === "reply"
                        ? "Reply publicly"
                        : dialog === "dictionary"
                          ? "Published dictionary"
                          : dialog === "sources"
                            ? "Published sources"
                            : dialog === "lineage"
                              ? "Attribution"
                              : dialog === "versions"
                                ? "Published version"
                                : "A closer look"
          }
          description={
            ["annotation", "clarification"].includes(dialog)
              ? "Visible only to the defined participants. Never added to public comments."
              : undefined
          }
          onClose={() => setDialog("")}
          wide={[
            "dictionary",
            "sources",
            "versions",
            "pdf",
            "evidence",
          ].includes(dialog)}
        >
          {[
            "annotation",
            "question",
            "clarification",
            "report",
            "reply",
          ].includes(dialog) && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (dialog === "annotation") {
                  await savePersonal("annotation");
                  return;
                }
                const payload =
                  dialog === "reply"
                    ? {
                        action: "reply",
                        threadId: definition,
                        body,
                        idempotencyKey: actionId,
                      }
                    : {
                        action: dialog,
                        publicationId: p.publicationId,
                        versionId: p.id,
                        noteId: note.id,
                        quote,
                        body,
                        category,
                        idempotencyKey: actionId,
                      };
                const r = await fetch("/api/community", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const d = await r.json();
                if (!r.ok) {
                  setMessage(d.error);
                  return;
                }
                setMessage(
                  dialog === "report"
                    ? "Report submitted to the moderator queue."
                    : "Your " + dialog + " was saved.",
                );
                setDialog("");
                setActionId(uid());
                const response = await fetch(
                  "/api/community?publicationId=" + p.publicationId,
                );
                setThreads((await response.json()).threads ?? []);
              }}
            >
              {quote && <blockquote>{quote}</blockquote>}
              {["clarification", "report"].includes(dialog) && (
                <Field label="Category">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {(dialog === "report"
                      ? [
                          "Spam",
                          "Harassment",
                          "Attribution/reuse concern",
                          "Other",
                        ]
                      : [
                          "Broken link",
                          "Missing definition",
                          "Unclear explanation",
                          "Outdated information",
                          "Other",
                        ]
                    ).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field
                label={
                  dialog === "question"
                    ? "Your public question"
                    : dialog === "annotation"
                      ? "Your private note"
                      : "Message"
                }
              >
                <textarea
                  required
                  autoFocus
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
              <div className="dialog-footer">
                <button className="primary">
                  {dialog === "annotation"
                    ? "Save private note"
                    : dialog === "question"
                      ? "Post public question"
                      : "Submit"}
                </button>
              </div>
            </form>
          )}
          {dialog === "copy" && (
            <>
              <p>
                Create an independently editable, private collection from{" "}
                <strong>{p.title}</strong>, version {p.version}, by {p.author}.
              </p>
              <p className="muted">
                Published notes, definitions, sources, and permitted evidence
                are included. Attribution stays connected to this version. Other
                readers’ private notes and conversations are never copied.
              </p>
              <button
                className="primary"
                onClick={async () => {
                  const r = await fetch("/api/publications", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "copy",
                      publicationId: p.publicationId,
                      idempotencyKey: actionId,
                    }),
                  });
                  const d = await r.json();
                  if (!r.ok) {
                    setMessage(d.error);
                    return;
                  }
                  location.href = d.jobId
                    ? "/w/jobs"
                    : "/w/collection/" + d.containerId;
                }}
              >
                Create study copy <ArrowRight size={16} />
              </button>
            </>
          )}
          {dialog === "dictionary" &&
            p.definitions.map((d) => (
              <section key={d.id}>
                <h2>{d.term}</h2>
                <Markdown body={d.definition} />
              </section>
            ))}
          {dialog === "definition" && (
            <Markdown
              body={
                p.definitions.find((d) => d.id === definition)?.definition ??
                "Definition unavailable."
              }
            />
          )}
          {dialog === "sources" &&
            p.sources.map((s) => (
              <p key={s.id}>
                <a href={s.canonical} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
                <br />
                <small>
                  {s.authors.join(", ")} {s.publisher}
                </small>
              </p>
            ))}
          {dialog === "lineage" && (
            <div className="lineage-tree" role="list">
              {[
                ...p.lineage,
                {
                  title: p.title,
                  author: p.author,
                  version: p.version,
                  publicationId: p.publicationId,
                },
              ].map((n, i) => (
                <div role="listitem" key={i}>
                  <GitBranch size={18} />
                  <span>
                    {n.author}
                    <strong>
                      <a href={"/p/" + n.publicationId}>
                        {n.title} · v{n.version}
                      </a>
                    </strong>
                  </span>
                </div>
              ))}
            </div>
          )}
          {dialog === "versions" && (
            <VersionHistory publicationId={p.publicationId} current={p} />
          )}
          {dialog === "evidence" && (
            <>
              <blockquote className="large-quote">{quote}</blockquote>
              {(() => {
                const anchor = p.anchors.find((a) => a.id === definition),
                  source = p.sources.find((s) => s.id === anchor?.sourceId),
                  asset = p.attachments?.find(
                    (a) => a.id === source?.attachmentId,
                  );
                return asset && anchor ? (
                  <PdfViewer
                    attachmentId={asset.id}
                    publicAttachment={asset}
                    publicAnchors={p.anchors}
                    anchorId={anchor.id}
                    publicUrl={
                      "/api/public-assets/" +
                      p.publicationId +
                      "/" +
                      p.id +
                      "/" +
                      asset.id
                    }
                  />
                ) : (
                  <p className="field-hint">
                    Published excerpt · {anchor?.locator}. Only the explicitly
                    published evidence is available.
                  </p>
                );
              })()}
            </>
          )}
          {dialog === "pdf" &&
            (() => {
              const asset = p.attachments?.find((a) => a.id === definition);
              return asset ? (
                <PdfViewer
                  attachmentId={asset.id}
                  publicAttachment={asset}
                  publicAnchors={p.anchors}
                  publicUrl={
                    "/api/public-assets/" +
                    p.publicationId +
                    "/" +
                    p.id +
                    "/" +
                    asset.id
                  }
                />
              ) : (
                <p>File unavailable.</p>
              );
            })()}
        </Modal>
      )}
    </div>
  );
}
