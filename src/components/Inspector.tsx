"use client";
import { useState, memo } from "react";
import {
  Plus,
  Search,
  BookA,
  ChevronDown,
  ArrowUpRight,
  Link2,
  FileText,
  MessageSquare,
  Layers,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import { contextDefinitions, subjectOf, inContainer } from "@/lib/model";
import { Empty, IconButton } from "./ui";
import AIStudy from "./study/AIStudy";
function Inspector({ ctx, panel }: { ctx: AppContext; panel: string }) {
  const { w, active, setDialog, openNote } = ctx;
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [scope, setScope] = useState("subject");
  const subject = active
    ? subjectOf(w, active.containerId)
    : w.containers.find((c) => c.id === ctx.focus);
  let defs =
    scope === "all"
      ? w.definitions.filter((d) => !d.trashed)
      : active
        ? contextDefinitions(w, active.containerId)
        : w.definitions.filter(
            (d) => !d.trashed && d.subjectIds.includes(subject?.id ?? ""),
          );
  defs = defs.filter((d) =>
    (d.term + " " + d.definition + " " + d.aliases.join(" "))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const sources = w.sources.filter((s) =>
    active
      ? s.noteIds.includes(active.id)
      : subject
        ? s.subjectIds.some((id) => inContainer(w, id, subject.id))
        : true,
  );
  return (
    <div className="inspector-content">
      {panel === "dictionary" && (
        <>
          <div className="inspector-section-title">
            <h2>
              Dictionary <span>{defs.length}</span>
            </h2>
            <IconButton
              label="Add definition"
              onClick={() =>
                setDialog({
                  type: "definition",
                  parentId: subject?.id,
                  value: ctx.selection,
                })
              }
            >
              <Plus size={16} />
            </IconButton>
          </div>
          <p className="panel-description">The ideas behind your notes.</p>
          <div className="scope-select">
            <BookA size={13} />
            <select
              aria-label="Dictionary scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="subject">
                {subject?.title ?? "This subject"}
              </option>
              <option value="all">All my definitions</option>
            </select>
          </div>
          <div className="compact-search">
            <Search size={14} />
            <input
              aria-label="Find a definition"
              placeholder="Find a definition…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <kbd>⌘ D</kbd>
          </div>
          <div className="definition-list">
            {defs
              .sort((a, b) => a.term.localeCompare(b.term))
              .slice(page * 40, (page + 1) * 40)
              .map((d) => (
                <button
                  key={d.id}
                  className="definition-preview"
                  onClick={() =>
                    setDialog({ type: "definition-detail", id: d.id })
                  }
                >
                  <div>
                    <span className="definition-initial">{d.term[0]}</span>
                    <strong>{d.term}</strong>
                    <ArrowUpRight size={14} />
                  </div>
                  <p>{d.definition.replace(/[#*_`]/g, "")}</p>
                  {d.aliases.length > 0 && (
                    <small>Also: {d.aliases.join(", ")}</small>
                  )}
                </button>
              ))}
          </div>
          {defs.length > 40 && (
            <div className="tree-pagination">
              <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                Previous definitions
              </button>
              <span>
                {page + 1} / {Math.ceil(defs.length / 40)}
              </span>
              <button
                disabled={(page + 1) * 40 >= defs.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next definitions
              </button>
            </div>
          )}
          {!defs.length && (
            <Empty icon={BookA} title="A place for new concepts">
              Select a phrase in your note or add your first definition.
            </Empty>
          )}
          <button
            className="dashed-button"
            onClick={() =>
              setDialog({ type: "definition", parentId: subject?.id })
            }
          >
            <Plus size={15} /> Add a definition
          </button>
          <div className="quiet-callout">
            <Sparkles size={16} />
            <p>
              Your terms are subtly highlighted as you write. Click one to
              reconnect with its meaning.
            </p>
          </div>
          <button
            className="panel-link"
            onClick={() => ctx.setView("dictionary")}
          >
            Open dictionary <ArrowRight size={14} />
          </button>
        </>
      )}
      {panel === "sources" && (
        <>
          <div className="inspector-section-title">
            <h2>
              Sources <span>{sources.length}</span>
            </h2>
            <IconButton
              label="Add source"
              onClick={() =>
                setDialog({ type: "source", parentId: subject?.id })
              }
            >
              <Plus size={16} />
            </IconButton>
          </div>
          <p className="panel-description">
            Follow an idea back to its evidence.
          </p>
          {sources.map((s) => (
            <button
              key={s.id}
              className="source-preview"
              onClick={() => setDialog({ type: "source-detail", id: s.id })}
            >
              <span className="source-icon">
                <Link2 size={16} />
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.authors.join(", ") || s.kind.toUpperCase()}</small>
                <span>
                  {s.status === "pending"
                    ? "Metadata not enriched"
                    : s.status === "error"
                      ? "Metadata unavailable"
                      : (s.provider ?? "Manually saved")}
                </span>
              </div>
              <ArrowUpRight size={13} />
            </button>
          ))}
          {!sources.length && (
            <Empty icon={Link2} title="Keep the evidence close">
              Paste a research link into your note to capture it here, or add a
              DOI, arXiv ID, or ISBN.
            </Empty>
          )}
          <button
            className="dashed-button"
            onClick={() => setDialog({ type: "source", parentId: subject?.id })}
          >
            <Plus size={15} /> Add a source
          </button>
          <div className="panel-divider" />
          <h3>Attachments</h3>
          {w.attachments
            .filter(
              (a) => !a.trashed && (!active || active.body.includes(a.id)),
            )
            .map((a) => (
              <button
                key={a.id}
                className="panel-list-row"
                onClick={() =>
                  setDialog({
                    type:
                      a.mime === "application/pdf"
                        ? "pdf"
                        : "attachment-detail",
                    id: a.id,
                  })
                }
              >
                <FileText size={15} />
                {a.filename}
              </button>
            ))}
          <button
            className="panel-link"
            onClick={() => setDialog({ type: "attachments" })}
          >
            Upload or manage attachments <ArrowRight size={14} />
          </button>
        </>
      )}
      {panel === "outline" && (
        <>
          <h2>Outline</h2>
          <p className="panel-description">
            A little perspective on your thinking.
          </p>
          {active?.body
            .split("\n")
            .filter((line) => /^#{1,6} /.test(line))
            .map((line, i) => (
              <button
                key={i}
                className="outline-row"
                style={{
                  paddingLeft: (line.match(/^#+/)?.[0].length ?? 1) * 12,
                }}
                onClick={() => {
                  const slug = line
                    .replace(/^#+ /, "")
                    .toLowerCase()
                    .replace(/\s+/g, "-");
                  document
                    .getElementById(slug)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  if (!document.getElementById(slug))
                    ctx.toast("Switch to Reading mode to navigate headings.");
                }}
              >
                {line.replace(/^#+ /, "")}
              </button>
            ))}
        </>
      )}
      {panel === "backlinks" && (
        <>
          <h2>Backlinks</h2>
          <p className="panel-description">Other notes that connect here.</p>
          {w.notes
            .filter(
              (n) =>
                !n.trashed &&
                active &&
                n.id !== active.id &&
                (n.body.includes("[[" + active.title) ||
                  Object.values(n.linkMap ?? {}).includes(active.id)),
            )
            .map((n) => (
              <button
                className="backlink-preview"
                key={n.id}
                onClick={() => openNote(n.id)}
              >
                <FileText size={15} />
                <div>
                  <strong>{n.title}</strong>
                  <small>
                    {w.containers.find((c) => c.id === n.containerId)?.title}
                  </small>
                </div>
                <ArrowUpRight size={13} />
              </button>
            ))}
          <div className="quiet-callout">
            <Link2 size={15} />
            <p>Type [[ in your note to connect it to another idea.</p>
          </div>
        </>
      )}
      {panel === "annotations" && (
        <>
          <div className="inspector-section-title">
            <h2>Annotations</h2>
            <IconButton
              label="Add annotation"
              onClick={() =>
                setDialog({ type: "annotation", value: ctx.selection })
              }
            >
              <Plus size={16} />
            </IconButton>
          </div>
          <p className="panel-description">
            Private notes and draft author comments.
          </p>
          {w.annotations
            .filter((a) => a.noteId === active?.id)
            .map((a) => (
              <div className="annotation-preview" key={a.id}>
                <span className="badge">
                  {a.kind === "private"
                    ? "Private study note"
                    : "Author draft · unpublished"}
                </span>
                <blockquote>{a.quote}</blockquote>
                <p>{a.body}</p>
                {a.state === "changed" && (
                  <small>
                    Changed passage · attached to revision {a.revision}
                  </small>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    ctx.mutate((s) => {
                      s.annotations = s.annotations.filter(
                        (x) => x.id !== a.id,
                      );
                    })
                  }
                >
                  Delete
                </button>
              </div>
            ))}
          <button
            className="dashed-button"
            onClick={() =>
              setDialog({ type: "annotation", value: ctx.selection })
            }
          >
            <MessageSquare size={15} /> Annotate a passage
          </button>
          <div className="quiet-callout">
            <MessageSquare size={16} />
            <p>
              Public questions live on the published version. Your private study
              notes stay yours.
            </p>
          </div>
        </>
      )}
      {panel === "ai" && <AIStudy ctx={ctx} />}
    </div>
  );
}

export default memo(
  Inspector,
  (a, b) =>
    a.panel === b.panel &&
    a.panel === "dictionary" &&
    a.ctx.active?.id === b.ctx.active?.id &&
    a.ctx.active?.containerId === b.ctx.active?.containerId &&
    a.ctx.focus === b.ctx.focus &&
    a.ctx.selection === b.ctx.selection &&
    a.ctx.w.definitions === b.ctx.w.definitions &&
    a.ctx.w.containers === b.ctx.w.containers,
);
