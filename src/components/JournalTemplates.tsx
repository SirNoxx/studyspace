"use client";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import { uid, type JournalTemplate } from "@/lib/model";
import { Field, Modal } from "./ui";
import Markdown from "./Markdown";

export default function JournalTemplates({
  ctx,
  kind,
  initialTab,
  onUse,
  onClose,
}: {
  ctx: AppContext;
  kind: "journal" | "dream";
  initialTab: "saved" | "public";
  onUse: (template: JournalTemplate) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab),
    [edit, setEdit] = useState<JournalTemplate | null>(null);
  const [preview, setPreview] = useState<JournalTemplate | null>(null);
  const [publish, setPublish] = useState<JournalTemplate | null>(null);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<JournalTemplate[]>([]),
    [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const local = (ctx.w.settings.journalTemplates ?? []).filter(
    (t) => t.kind === kind,
  );
  useEffect(() => {
    if (tab !== "public") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRemote([]);
    void fetch(
      `/api/journal-templates?kind=${kind}&q=${encodeURIComponent(search)}&page=${page}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRemote(data.templates);
          setHasMore(data.hasMore);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, kind, search, page, retry]);
  const save = (template: JournalTemplate) =>
    ctx.mutate((w) => {
      const templates = (w.settings.journalTemplates ??= []);
      const index = templates.findIndex((t) => t.id === template.id);
      if (index < 0) templates.push(template);
      else templates[index] = template;
    });
  const use = (template: JournalTemplate) => {
    if (tab === "saved") {
      onUse(template);
      return;
    }
    const existing = local.find((t) => t.publicId === template.id);
    const copy = existing ?? { ...template, id: uid(), publicId: template.id };
    if (!existing) save(copy);
    onUse(copy);
  };
  return (
    <Modal
      title={kind === "dream" ? "Dream journal templates" : "Journal templates"}
      description="Keep your own writing prompts or save a public template to this workspace."
      onClose={onClose}
      wide
    >
      <div className="segmented">
        <button
          className={tab === "saved" ? "active" : ""}
          onClick={() => {
            setTab("saved");
            setError("");
          }}
        >
          My templates
        </button>
        <button
          className={tab === "public" ? "active" : ""}
          onClick={() => {
            setTab("public");
            setError("");
          }}
        >
          Public templates
        </button>
      </div>
      {tab === "saved" ? (
        <button
          className="secondary"
          onClick={() => setEdit({ id: uid(), title: "", body: "", kind })}
        >
          <Plus size={15} /> Create template
        </button>
      ) : (
        <form
          className="template-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
            setPage(0);
          }}
        >
          <input
            aria-label="Search public templates"
            placeholder="Find a template…"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="secondary" aria-label="Search templates">
            <Search size={16} />
          </button>
        </form>
      )}
      {loading && <p role="status">Loading public templates…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          {tab === "public" && (
            <button
              className="text-button"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry
            </button>
          )}
        </p>
      )}
      <div className="journal-template-grid">
        {(tab === "saved" ? local : remote).map((t) => (
          <article key={t.id}>
            <h3>{t.title}</h3>
            {t.author && <small>By {t.author}</small>}
            <p>{t.body.replace(/[#*_`>]/g, "").slice(0, 160)}</p>
            <div className="template-card-actions">
              <button className="secondary" onClick={() => setPreview(t)}>
                Preview
              </button>
              <button className="primary" onClick={() => use(t)}>
                Use template
              </button>
              {tab === "saved" && (
                <>
                  <button
                    className="text-button"
                    onClick={() => setEdit({ ...t })}
                  >
                    Edit
                  </button>
                  {!t.publishedId && (
                    <button
                      className="text-button"
                      disabled={ctx.demo || busy}
                      title={
                        ctx.demo
                          ? "Publishing requires a signed-in cloud workspace"
                          : "Preview before publishing"
                      }
                      onClick={() => setPublish(t)}
                    >
                      Publish publicly
                    </button>
                  )}
                  {t.publishedId && !ctx.demo && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const r = await fetch(
                            "/api/journal-templates?id=" + t.publishedId,
                            { method: "DELETE" },
                          );
                          if (!r.ok) throw new Error((await r.json()).error);
                          const copy = { ...t };
                          delete copy.publishedId;
                          save(copy);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Unpublish
                    </button>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      ctx.mutate((w) => {
                        w.settings.journalTemplates = (
                          w.settings.journalTemplates ?? []
                        ).filter((x) => x.id !== t.id);
                      }, "Removed from saved templates. Your entries are unchanged.")
                    }
                  >
                    Remove saved template
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!loading && !error && !(tab === "saved" ? local : remote).length && (
        <p className="muted">
          {tab === "saved"
            ? "No custom templates yet. Create one with the prompts you like."
            : "No public templates match this search yet."}
        </p>
      )}
      {tab === "saved" && ctx.demo && (
        <p className="muted">
          Your templates stay on this device. Sign in to a connected cloud
          workspace to publish publicly.
        </p>
      )}
      {tab === "public" && (
        <div className="template-pagination">
          <button
            className="secondary"
            disabled={loading || page === 0}
            onClick={() => setPage((n) => n - 1)}
          >
            Previous page
          </button>
          <span>Page {page + 1}</span>
          <button
            className="secondary"
            disabled={loading || !hasMore || !!error}
            onClick={() => setPage((n) => n + 1)}
          >
            Next page
          </button>
        </div>
      )}
      {edit && (
        <Modal
          title="Edit journal template"
          description="Write reusable Markdown prompts. This edits the template, not any existing journal entry."
          wide
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!edit.title.trim() || !edit.body.trim()) return;
              save({ ...edit, title: edit.title.trim() });
              setEdit(null);
            }}
          >
            <Field label="Template name">
              <input
                autoFocus
                required
                maxLength={100}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label="Template content">
              <textarea
                className="template-source"
                required
                rows={12}
                maxLength={50000}
                placeholder="## What happened today?"
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              />
            </Field>
            <div className="dialog-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="primary">Save template</button>
            </div>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          <div className="journal-template-preview">
            <Markdown body={preview.body} />
          </div>
          <div className="dialog-footer">
            <button className="primary" onClick={() => use(preview)}>
              Use template
            </button>
          </div>
        </Modal>
      )}
      {publish && (
        <Modal
          title="Publish journal template"
          description="Only the template below will become public under your profile name. Your journal entries remain private."
          onClose={() => !busy && setPublish(null)}
        >
          <h3>{publish.title}</h3>
          <div className="journal-template-preview">
            <Markdown body={publish.body} />
          </div>
          <div className="dialog-footer">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setPublish(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/journal-templates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: publish.title,
                      body: publish.body,
                      kind: publish.kind,
                    }),
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error);
                  save({ ...publish, publishedId: data.template.id });
                  setPublish(null);
                  ctx.toast("Template published.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Publishing…" : "Publish template"}
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </Modal>
  );
}
