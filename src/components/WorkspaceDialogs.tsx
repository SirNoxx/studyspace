"use client";
import { locateQuote } from "@/lib/anchors";
import { focusPassage } from "@/lib/focus-passage";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookA,
  Search,
  Plus,
  ArrowRight,
  ArrowLeft,
  Check,
  FileText,
  Folder,
  Globe,
  Lock,
  Layers,
  Link2,
  Download,
  Upload,
  ExternalLink,
  Trash2,
  AlertCircle,
  History,
  Copy,
  Sparkles,
  Paperclip,
} from "lucide-react";
import { type AppContext, type DialogState } from "./WorkspaceApp";
import { Modal, Field, IconButton, SymbolIcon, icons } from "./ui";
import Markdown from "./Markdown";
import {
  uid,
  now,
  general,
  subjectOf,
  ancestry,
  inContainer,
  type Definition,
  type Snapshot,
  type Source,
} from "@/lib/model";
import {
  createContainer,
  createNote,
  saveNote,
  moveItems,
  addReview,
  prepareSnapshot,
  fingerprint,
} from "@/lib/domain";
import { identifySource } from "@/lib/markdown";
import {
  prepareImport,
  commitImport,
  assetMime,
  type ImportPlan,
  downloadBytes,
} from "@/lib/transfer";
import { localDB } from "@/lib/store";
import {
  MethodPicker,
  GroupSelect,
  AttachmentsPanel,
  HyperlinkDialog,
} from "./WorkspaceEnhancements";
import { categories, publicationCounts } from "@/lib/enhancements";
import AISuggestion from "./study/AISuggestion";
import AttachmentMedia from "./AttachmentMedia";
const PdfViewer = dynamic(() => import("./study/PdfViewer"), { ssr: false });
export default function Dialogs({
  ctx,
  dialog,
  onClose,
}: {
  ctx: AppContext;
  dialog: NonNullable<DialogState>;
  onClose: () => void;
}) {
  const { w, mutate, active } = ctx;
  const existingDefinition = w.definitions.find((d) => d.id === dialog.id),
    existingSource = w.sources.find((s) => s.id === dialog.id);
  const previousPublication =
    dialog.type === "publish"
      ? w.publications.find(
          (p) =>
            p.containerId ===
            (dialog.container ? dialog.id : active?.containerId),
        )?.current
      : undefined;
  const [name, setName] = useState(
      String(dialog.value ?? existingDefinition?.term ?? ""),
    ),
    [body, setBody] = useState(
      String(dialog.answer ?? existingDefinition?.definition ?? ""),
    ),
    [parent, setParent] = useState(
      String(
        dialog.destination ??
          dialog.parentId ??
          (dialog.type === "quick"
            ? general(w).id
            : dialog.type === "container"
              ? ""
              : (active?.containerId ?? ctx.focus ?? "")),
      ),
    ),
    [color, setColor] = useState("#739b8e"),
    [icon, setIcon] = useState("book"),
    [groupId, setGroupId] = useState(String(dialog.groupId ?? "")),
    [category, setCategory] = useState(
      previousPublication?.category ?? "General research",
    ),
    [tags, setTags] = useState(previousPublication?.topics.join(", ") ?? ""),
    [approach, setApproach] = useState(
      previousPublication?.studyMethod ??
        w.containers.find((c) => c.id === dialog.id)?.approach ??
        "mixed",
    ),
    [dictionary, setDictionary] = useState(true),
    [description, setDescription] = useState(""),
    [aliases, setAliases] = useState(
      existingDefinition?.aliases.join(", ") ?? "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [scope, setScope] = useState("subject"),
    [index, setIndex] = useState(0),
    [plan, setPlan] = useState<ImportPlan | null>(null),
    [report, setReport] = useState<{
      imported: number;
      skipped: number;
      warnings: string[];
    } | null>(null),
    [step, setStep] = useState(0),
    [selectedNotes, setSelectedNotes] = useState<string[]>(() =>
      w.notes
        .filter(
          (n) =>
            !n.trashed &&
            !["journal", "dream"].includes(n.kind) &&
            (dialog.container
              ? inContainer(w, n.containerId, dialog.id!)
              : n.id === dialog.id),
        )
        .map((n) => n.id),
    ),
    [allowCopies, setAllowCopies] = useState(false),
    [publicationExtras, setPublicationExtras] = useState({
      attachmentIds: [] as string[],
      anchorIds: [] as string[],
      annotationIds: [] as string[],
      definitionIds: w.definitions.filter((d) => !d.trashed).map((d) => d.id),
      sourceIds: w.sources.map((s) => s.id),
    }),
    [allowDownload, setAllowDownload] = useState(false),
    [allowQA, setAllowQA] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [previewFingerprint, setPreviewFingerprint] = useState(""),
    [annotationKind, setAnnotationKind] = useState<"private" | "author">(
      "private",
    ),
    [sourceId, setSourceId] = useState(w.sources[0]?.id ?? ""),
    [locator, setLocator] = useState(""),
    [quote, setQuote] = useState(String(dialog.value ?? "")),
    [sourceTitle, setSourceTitle] = useState(existingSource?.title ?? ""),
    [authors, setAuthors] = useState(existingSource?.authors.join(", ") ?? ""),
    [attachmentUrl, setAttachmentUrl] = useState("");
  useEffect(() => {
    if (dialog.type === "quick") {
      void localDB().then(async (db) => {
        const draft = await db.get("drafts", ctx.account + ":quick");
        if (draft) {
          setBody(draft.body ?? "");
          setName(draft.name ?? "");
        }
      });
    }
  }, []);
  useEffect(() => {
    if (dialog.type === "quick" && (body || name))
      void localDB().then((db) =>
        db.put("drafts", { body, name }, ctx.account + ":quick"),
      );
  }, [body, name]);
  const destinations = w.containers.filter((c) => !c.trashed && !c.archived);
  const options = (
    <>
      <option value="">All Collections · new root</option>
      {destinations.map((c) => (
        <option key={c.id} value={c.id}>
          {ancestry(w, c.id)
            .map((x) => x.title)
            .join(" / ")}
        </option>
      ))}
    </>
  );
  const submit = (fn: () => void) => {
    try {
      setError("");
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const formFooter = (label = "Save") => (
    <div className="dialog-footer">
      <button type="button" className="secondary" onClick={onClose}>
        Cancel
      </button>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Working…" : label}
        <Check size={15} />
      </button>
    </div>
  );
  const errors = error && (
    <p role="alert" className="form-error">
      <AlertCircle size={15} />
      {error}
    </p>
  );
  if (["palette", "switcher", "dictionary"].includes(dialog.type)) {
    const defs = w.definitions.filter(
      (d) =>
        !d.trashed &&
        (scope === "all" ||
          !active ||
          d.subjectIds.some((id) =>
            scope === "collection"
              ? ancestry(w, active.containerId)[0]?.id ===
                ancestry(w, id)[0]?.id
              : ancestry(w, active.containerId).some((c) => c.id === id),
          )) &&
        (d.term + " " + d.aliases + " " + d.definition)
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const commands = [
      {
        title: "Quick note",
        detail: "Capture in General",
        action: () => ctx.setDialog({ type: "quick" }),
        key: "Ctrl Shift Q",
      },
      {
        title: "New note",
        detail: "Start writing here",
        action: () => {
          ctx.addNote(active?.containerId ?? ctx.focus ?? general(w).id);
          onClose();
        },
        key: "",
      },
      {
        title: "New collection or subject",
        detail: "Make room for a new topic",
        action: () => ctx.setDialog({ type: "container" }),
        key: "",
      },
      {
        title: "Look up a definition",
        detail: "Your personal dictionary",
        action: () => ctx.setDialog({ type: "dictionary" }),
        key: "Ctrl Shift D",
      },
      {
        title: "Import Obsidian notes",
        detail: "Markdown, folders, or ZIP",
        action: () => ctx.setDialog({ type: "import" }),
        key: "",
      },
      {
        title: "Export personal backup",
        detail: "Markdown, assets, and study data",
        action: () => {
          void ctx.exportData({ full: true });
          onClose();
        },
        key: "",
      },
      ...["Journal", "Review", "Discover", "Bookmarks", "Settings"].map(
        (title) => ({
          title,
          detail: "Open " + title.toLowerCase(),
          action: () => {
            ctx.setView(title.toLowerCase());
            onClose();
          },
          key: "",
        }),
      ),
    ];
    const results =
      dialog.type === "dictionary"
        ? defs.map((d) => ({
            title: d.term,
            detail: d.definition,
            action: () =>
              ctx.setDialog({ type: "definition-detail", id: d.id }),
            key:
              w.containers.find((c) => c.id === d.subjectIds[0])?.title ?? "",
          }))
        : dialog.type === "switcher"
          ? w.notes
              .filter(
                (n) =>
                  !n.trashed &&
                  (n.title + " " + n.tags)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((n) => ({
                title: n.title,
                detail: ancestry(w, n.containerId)
                  .map((c) => c.title)
                  .join(" / "),
                action: () => {
                  ctx.openNote(n.id);
                  onClose();
                },
                key: "",
              }))
          : commands.filter((c) =>
              (c.title + " " + c.detail)
                .toLowerCase()
                .includes(query.toLowerCase()),
            );
    return (
      <Modal
        title={
          dialog.type === "dictionary"
            ? "A quick definition"
            : dialog.type === "switcher"
              ? "Find a note"
              : "What would you like to do?"
        }
        onClose={onClose}
      >
        <div className="palette-search">
          <Search size={20} />
          <input
            autoFocus
            placeholder={
              dialog.type === "dictionary"
                ? "A word, a phrase, an idea…"
                : "Type to search…"
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(results.length - 1, i + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                results[index]?.action();
              }
            }}
          />
        </div>
        {dialog.type === "dictionary" && (
          <div className="segmented">
            {[
              ["subject", "This subject"],
              ["collection", "This collection"],
              ["all", "All my definitions"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={scope === value ? "active" : ""}
                onClick={() => setScope(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="palette-results">
          {results.slice(0, 100).map((r, i) => (
            <button
              key={i}
              className={"palette-result " + (index === i ? "selected" : "")}
              onMouseEnter={() => setIndex(i)}
              onClick={r.action}
            >
              {dialog.type === "dictionary" ? (
                <BookA size={18} />
              ) : (
                <FileText size={18} />
              )}
              <span>
                <strong>{r.title}</strong>
                <small>{r.detail.slice(0, 150)}</small>
              </span>
              <kbd>{r.key}</kbd>
            </button>
          ))}
          {!results.length && (
            <p className="empty-caption">No matches. Try another phrase.</p>
          )}
        </div>
        <div className="palette-footer">
          <span>↑ ↓ to navigate · Enter to open · Esc to close</span>
          {dialog.type === "dictionary" && (
            <button
              onClick={() =>
                ctx.setDialog({ type: "definition", value: query })
              }
            >
              <Plus size={14} /> Add term
            </button>
          )}
        </div>
      </Modal>
    );
  }
  if (dialog.type === "folder-attachments")
    return <AttachmentsPanel ctx={ctx} id={dialog.id!} onClose={onClose} />;
  if (dialog.type === "hyperlink")
    return <HyperlinkDialog ctx={ctx} onClose={onClose} />;
  if (dialog.type === "attachment") {
    const asset = w.attachments.find((a) => a.id === dialog.id);
    return (
      <Modal
        title={asset?.filename ?? "Attachment unavailable"}
        onClose={onClose}
      >
        {asset && <AttachmentMedia asset={asset} image demo={ctx.demo} />}
      </Modal>
    );
  }
  if (dialog.type === "publish-picker")
    return (
      <Modal
        title="Publish to Discover"
        description="Choose a collection or folder, then review its exact public scope. Your originals stay private."
        onClose={onClose}
      >
        <div className="link-picker">
          {w.containers
            .filter((c) => !c.trashed && !c.archived)
            .map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  ctx.setDialog({ type: "publish", id: c.id, container: true })
                }
              >
                <SymbolIcon name={c.icon} />
                <span>
                  {c.title}
                  <small>
                    {ancestry(w, c.id)
                      .map((c) => c.title)
                      .join(" / ")}
                  </small>
                </span>
              </button>
            ))}
        </div>
      </Modal>
    );
  if (dialog.type === "container")
    return (
      <Modal
        title={dialog.kind === "folder" ? "New folder" : "A new space to learn"}
        description={
          dialog.kind === "folder"
            ? "Organize your notes without adding a study profile."
            : "Start with a name. Make the rest your own."
        }
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(() => {
              if (!name.trim()) throw new Error("Give your space a name.");
              mutate(
                (s) =>
                  createContainer(s, {
                    title: name.trim(),
                    parentId: parent || null,
                    kind:
                      dialog.kind === "folder"
                        ? "folder"
                        : parent
                          ? "subject"
                          : "collection",
                    color,
                    icon,
                    approach,
                    dictionary,
                    description,
                  }),
                "Created " + name + ".",
              );
              onClose();
            });
          }}
        >
          <div
            className="subject-preview"
            style={{ "--collection-color": color } as React.CSSProperties}
          >
            <SymbolIcon name={icon} size={27} />
            <span>
              {name || "Your next big idea"}
              <small>
                {parent
                  ? ancestry(w, parent)
                      .map((c) => c.title)
                      .join(" / ")
                  : "A new root collection"}
              </small>
            </span>
          </div>
          <Field label="Name">
            <input
              autoFocus
              required
              maxLength={240}
              placeholder="e.g. Cognitive science"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Connect to a parent">
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {options}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Color">
              <div className="color-options">
                {[
                  "#739b8e",
                  "#b49a68",
                  "#b48087",
                  "#9189b0",
                  "#7797b3",
                  "#8d98a3",
                ].map((c) => (
                  <button
                    type="button"
                    aria-label={"Choose color " + c}
                    aria-pressed={color === c}
                    key={c}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  >
                    {color === c && <Check size={14} />}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Custom color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Icon">
              <div className="icon-picker">
                {Object.keys(icons).map((i) => (
                  <button
                    type="button"
                    key={i}
                    title={i}
                    aria-label={"Choose icon " + i}
                    aria-pressed={icon === i}
                    onClick={() => setIcon(i)}
                  >
                    <SymbolIcon name={i} />
                    <small>{i}</small>
                  </button>
                ))}
              </div>
            </Field>
          </div>
          {dialog.kind !== "folder" && (
            <>
              <Field label="How would you like to study?">
                <MethodPicker value={approach} onChange={setApproach} />
              </Field>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={dictionary}
                  onChange={(e) => setDictionary(e.target.checked)}
                />
                <span>
                  Create a dictionary for this subject
                  <small>
                    A home for words and ideas you want to understand.
                  </small>
                </span>
              </label>
            </>
          )}
          <Field label="Description · optional">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you curious about?"
            />
          </Field>
          {errors}
          {formFooter(
            dialog.kind === "folder"
              ? "Create folder"
              : parent
                ? "Create subject"
                : "Create collection",
          )}
        </form>
      </Modal>
    );
  if (dialog.type === "quick")
    return (
      <Modal
        title="Catch a thought"
        description="A quick note, safely captured in General."
        onClose={onClose}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim() && !name.trim()) {
              setError("Write a thought before saving.");
              return;
            }
            let id = "";
            mutate((s) => {
              id = createNote(s, parent || general(s).id, {
                id: String(dialog.captureId ?? uid()),
                title:
                  name.trim() ||
                  body
                    .replace(/^#+\s*/, "")
                    .split("\n")[0]
                    .slice(0, 80) ||
                  "Quick note",
                body,
                kind: "quick",
              }).id;
            }, "Quick note saved.");
            await (await localDB()).delete("drafts", ctx.account + ":quick");
            ctx.openNote(id);
            onClose();
          }}
        >
          <input
            className="quick-title"
            aria-label="Quick note title"
            placeholder="A title, if you like…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="quick-body"
            aria-label="Quick note body"
            autoFocus
            rows={9}
            placeholder="What’s on your mind?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Field label="Save to">
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {destinations.map((c) => (
                <option value={c.id} key={c.id}>
                  {ancestry(w, c.id)
                    .map((x) => x.title)
                    .join(" / ")}
                </option>
              ))}
            </select>
          </Field>
          {errors}
          {formFooter("Save & open")}
        </form>
      </Modal>
    );
  if (dialog.type === "definition")
    return (
      <Modal
        title={
          existingDefinition ? "Edit a definition" : "Give an idea a meaning"
        }
        description="Your note stays right where you left it."
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !body.trim()) {
              setError("A term and definition are required.");
              return;
            }
            mutate((s) => {
              if (existingDefinition) {
                const d = s.definitions.find(
                  (d) => d.id === existingDefinition.id,
                )!;
                Object.assign(d, {
                  term: name.trim(),
                  definition: body,
                  noteId:
                    existingDefinition?.noteId ??
                    String(dialog.sourceId ?? active?.id ?? ""),
                  aliases: aliases
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean),
                  subjectIds: [
                    parent ||
                      subjectOf(s, active?.containerId ?? general(s).id)!.id,
                  ],
                  updatedAt: now(),
                });
                for (const r of s.review.filter((r) => r.sourceId === d.id))
                  r.contentChanged = true;
              } else
                s.definitions.push({
                  id: uid(),
                  noteId: String(dialog.sourceId ?? active?.id ?? ""),
                  term: name.trim(),
                  definition: body,
                  aliases: aliases
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean),
                  subjectIds: [
                    parent ||
                      subjectOf(s, active?.containerId ?? general(s).id)!.id,
                  ],
                  createdAt: now(),
                  updatedAt: now(),
                });
            }, "Definition saved.");
            onClose();
          }}
        >
          <Field label="Word or phrase">
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tool calling"
            />
          </Field>
          {!existingDefinition &&
            w.definitions.some(
              (d) => d.term.toLowerCase() === name.toLowerCase(),
            ) && (
              <p className="field-hint">
                This term already has a definition. You can keep a separate
                meaning for this subject.
              </p>
            )}
          <Field label="Definition">
            <textarea
              required
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Explain it in your own words. Markdown is welcome."
            />
          </Field>
          <Field label="Aliases · comma separated">
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Other names for the same idea"
            />
          </Field>
          <Field label="Subject">
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {options}
            </select>
          </Field>
          {errors}
          {!existingDefinition && active && (
            <AISuggestion
              ctx={ctx}
              kind="definition"
              passage={name}
              onResult={(_q, a) => setBody(a)}
            />
          )}
          {formFooter("Save definition")}
        </form>
      </Modal>
    );
  if (dialog.type === "definition-detail" && existingDefinition)
    return (
      <Modal
        title={existingDefinition.term}
        description={existingDefinition.subjectIds
          .map((id) => w.containers.find((c) => c.id === id)?.title)
          .join(" · ")}
        onClose={onClose}
      >
        <Markdown body={existingDefinition.definition} />
        {existingDefinition.aliases.length > 0 && (
          <p className="muted">
            Also known as {existingDefinition.aliases.join(", ")}
          </p>
        )}
        <div className="dialog-footer spread">
          <button
            className="text-button danger"
            onClick={() => {
              mutate((s) => {
                s.definitions.find(
                  (d) => d.id === existingDefinition.id,
                )!.trashed = true;
              }, "Definition moved to Trash.");
              onClose();
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
          <div className="inline-actions">
            <IconButton
              label="Copy definition"
              onClick={() => {
                void navigator.clipboard.writeText(
                  existingDefinition.definition,
                );
                ctx.toast("Definition copied.");
              }}
            >
              <Copy size={15} />
            </IconButton>
            <button
              className="secondary"
              onClick={() =>
                ctx.setDialog({
                  type: "definition",
                  id: existingDefinition.id,
                  parentId: existingDefinition.subjectIds[0],
                })
              }
            >
              Edit
            </button>
            <button
              className="primary"
              onClick={() =>
                ctx.setDialog({
                  type: "review-card",
                  value: existingDefinition.term,
                  answer: existingDefinition.definition,
                  sourceId: existingDefinition.id,
                  sourceType: "definition",
                  parentId: existingDefinition.subjectIds[0],
                })
              }
            >
              <Layers size={15} /> Need to review
            </button>
          </div>
        </div>
      </Modal>
    );
  if (dialog.type === "rename" || dialog.type === "tags")
    return (
      <Modal
        title={dialog.type === "tags" ? "Edit tags" : "Rename"}
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate((s) => {
              const n = s.notes.find((n) => n.id === dialog.id);
              if (dialog.type === "tags" && n)
                n.tags = name
                  .split(",")
                  .map((s) => s.trim().replace(/^#/, ""))
                  .filter(Boolean);
              else if (n)
                saveNote(s, n.id, n.revision, { title: name.trim() }, "Rename");
              else {
                const c = s.containers.find((c) => c.id === dialog.id);
                if (c) c.title = name.trim();
              }
            });
            onClose();
          }}
        >
          <Field
            label={dialog.type === "tags" ? "Tags · comma separated" : "Name"}
          >
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {formFooter()}
        </form>
      </Modal>
    );
  if (dialog.type === "move")
    return (
      <Modal
        title="Move to a new home"
        description="Links, citations, and the note’s identity stay intact."
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const dest = w.containers.find((c) => c.id === parent);
            if (!dest) {
              setError("Choose a destination.");
              return;
            }
            if (
              dialog.id === parent ||
              (w.containers.some((c) => c.id === dialog.id) &&
                inContainer(w, parent, dialog.id!))
            ) {
              setError("A container cannot move into itself or a descendant.");
              return;
            }
            mutate(
              (s) => moveItems(s, [dialog.id!], parent),
              "Moved to " + dest.title + ".",
            );
            onClose();
          }}
        >
          <Field label="Destination">
            <select
              autoFocus
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">Choose a destination</option>
              {destinations.map((c) => (
                <option key={c.id} value={c.id}>
                  {ancestry(w, c.id)
                    .map((x) => x.title)
                    .join(" / ")}
                </option>
              ))}
            </select>
          </Field>
          <p className="move-preview">
            <Folder size={16} />
            {parent
              ? ancestry(w, parent)
                  .map((c) => c.title)
                  .join(" → ")
              : "Choose where this belongs"}
          </p>
          {errors}
          {formFooter("Move here")}
        </form>
      </Modal>
    );
  if (dialog.type === "review-card")
    return (
      <Modal
        title="Keep this idea with you"
        description="Edit your recall question and answer before adding it to your private review queue."
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              (s) =>
                addReview(s, {
                  front: name,
                  back: body,
                  groupId: groupId || undefined,
                  sourceType: (dialog.sourceType as "definition") ?? "note",
                  sourceId: String(dialog.sourceId ?? active?.id ?? ""),
                  sourceRevision: active?.revision,
                  subjectId: parent || undefined,
                }),
              "Added to your review queue.",
            );
            onClose();
          }}
        >
          <Field label="Question">
            <textarea
              required
              autoFocus
              rows={3}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What would you like to remember?"
            />
          </Field>
          <Field label="Answer">
            <textarea
              required
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Explain the answer in your own words."
            />
          </Field>
          <GroupSelect ctx={ctx} value={groupId} onChange={setGroupId} />
          {active && (
            <AISuggestion
              ctx={ctx}
              kind="card"
              passage={String(dialog.passage ?? dialog.value ?? body)}
              onResult={(q, a) => {
                setName(q);
                setBody(a);
              }}
            />
          )}
          {formFooter("Add to review")}
        </form>
      </Modal>
    );
  if (dialog.type === "annotation")
    return (
      <Modal
        title="A note in the margin"
        description="This visibility choice remains fixed while you write."
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!active) return;
            mutate((s) => {
              const start = active.body.indexOf(quote);
              s.annotations.push({
                id: uid(),
                noteId: active.id,
                revision: active.revision,
                quote,
                prefix: active.body.slice(Math.max(0, start - 50), start),
                suffix: active.body.slice(
                  start + quote.length,
                  start + quote.length + 50,
                ),
                body,
                kind: annotationKind,
                createdAt: now(),
                state: "attached",
              });
            });
            onClose();
          }}
        >
          <Field label="Visibility">
            <select
              value={annotationKind}
              onChange={(e) =>
                setAnnotationKind(e.target.value as typeof annotationKind)
              }
            >
              <option value="private">Private study note · only you</option>
              <option value="author">
                Author draft · publish only when selected
              </option>
            </select>
          </Field>
          <Field label="Passage">
            <textarea
              rows={2}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
          </Field>
          <Field label="Your annotation">
            <textarea
              required
              autoFocus
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          {formFooter("Save annotation")}
        </form>
      </Modal>
    );
  if (dialog.type === "source")
    return (
      <Modal
        title={existingSource ? "Edit source" : "Follow the evidence"}
        description="Add a link, DOI, arXiv identifier, or checksum-valid ISBN."
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = name || existingSource?.input || "";
            const info = identifySource(input);
            if (!info) {
              setError("Enter a valid web URL, DOI, arXiv ID, or ISBN.");
              return;
            }
            mutate((s) => {
              const old = existingSource
                ? s.sources.find((x) => x.id === existingSource.id)
                : s.sources.find((x) => x.canonical === info.canonical);
              if (old) {
                if (sourceTitle) {
                  old.title = sourceTitle;
                  if (!old.overrides.includes("title"))
                    old.overrides.push("title");
                }
                if (authors) {
                  old.authors = authors.split(",").map((s) => s.trim());
                  if (!old.overrides.includes("authors"))
                    old.overrides.push("authors");
                }
                old.manual = true;
                if (parent && !old.subjectIds.includes(parent))
                  old.subjectIds.push(parent);
                if (active && !old.noteIds.includes(active.id))
                  old.noteIds.push(active.id);
              } else
                s.sources.push({
                  id: uid(),
                  input,
                  canonical: info.canonical,
                  kind: info.kind,
                  title: sourceTitle || input,
                  authors: authors
                    ? authors.split(",").map((s) => s.trim())
                    : [],
                  overrides: sourceTitle ? ["title"] : [],
                  manual: true,
                  status: "pending",
                  subjectIds: [parent || general(s).id],
                  noteIds: active ? [active.id] : [],
                  createdAt: now(),
                });
            }, "Source saved.");
            onClose();
          }}
        >
          <Field label="Link or identifier">
            <input
              required
              autoFocus
              value={name || existingSource?.input || ""}
              onChange={(e) => setName(e.target.value)}
              placeholder="https://doi.org/10.…"
            />
          </Field>
          <Field label="Title · optional">
            <input
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
            />
          </Field>
          <Field label="Authors · optional, comma separated">
            <input
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
            />
          </Field>
          <Field label="Subject">
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {options}
            </select>
          </Field>
          {errors}
          {formFooter("Save source")}
        </form>
      </Modal>
    );
  if (dialog.type === "source-detail" && existingSource)
    return (
      <Modal
        title={existingSource.title}
        description="Source metadata and evidence"
        onClose={onClose}
      >
        <div className="source-details">
          <span className="badge">{existingSource.kind.toUpperCase()}</span>
          <a
            href={
              existingSource.canonical.startsWith("isbn:")
                ? "https://openlibrary.org/isbn/" +
                  existingSource.canonical.slice(5)
                : existingSource.canonical
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Open original <ExternalLink size={14} />
          </a>
          <p>{existingSource.authors.join(", ") || "Authors unavailable"}</p>
          {existingSource.publisher && (
            <p>
              {existingSource.publisher} · {existingSource.date}
            </p>
          )}
          <p className="muted">
            {existingSource.provider
              ? "Metadata from " + existingSource.provider
              : "Metadata has not been enriched."}
          </p>
          {existingSource.description && <p>{existingSource.description}</p>}
          {existingSource.error && (
            <p className="form-error">{existingSource.error}</p>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/metadata", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ input: existingSource.input }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                mutate((s) => {
                  const source = s.sources.find(
                    (x) => x.id === existingSource.id,
                  )!;
                  for (const [key, value] of Object.entries(data))
                    if (
                      !source.overrides.includes(key) &&
                      !["id", "ownerId", "subjectIds", "noteIds"].includes(key)
                    )
                      (source as any)[key] = value;
                });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Looking up metadata…" : "Enrich / retry metadata"}
          </button>
          <div className="panel-divider" />
          <h3>Evidence passages</h3>
          {w.anchors
            .filter((a) => a.sourceId === existingSource.id)
            .map((a) => (
              <button
                className="evidence-preview"
                key={a.id}
                onClick={() =>
                  ctx.setDialog({ type: "citation-detail", id: a.id })
                }
              >
                <blockquote>{a.quote}</blockquote>
                <small>
                  {a.locator} · {a.state}
                </small>
              </button>
            ))}
          <div className="stack-actions">
            <button
              className="secondary"
              onClick={() =>
                ctx.setDialog({ type: "citation", sourceId: existingSource.id })
              }
            >
              Add a quote / citation
            </button>
            {existingSource.kind === "url" && (
              <button
                className="secondary"
                onClick={() =>
                  ctx.setDialog({ type: "web-source", id: existingSource.id })
                }
              >
                Open supported article reader
              </button>
            )}
          </div>
        </div>
        {errors}
        <div className="dialog-footer">
          <button
            className="secondary"
            onClick={() =>
              ctx.setDialog({
                type: "source",
                id: existingSource.id,
                parentId: existingSource.subjectIds[0],
              })
            }
          >
            Edit metadata
          </button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  if (dialog.type === "citation")
    return (
      <Modal
        title="Connect a claim to evidence"
        description="A durable reference with the source, passage, and location."
        onClose={onClose}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const source = w.sources.find(
              (s) => s.id === (dialog.sourceId ?? sourceId),
            );
            if (!source) {
              setError("Add a source first, then select it.");
              return;
            }
            const id = uid();
            mutate((s) => {
              s.anchors.push({
                id,
                sourceId: source.id,
                noteId: active?.id,
                noteRevision: active?.revision,
                quote,
                prefix: "",
                suffix: "",
                locator,
                state: "attached",
              });
              if (active) {
                const n = s.notes.find((n) => n.id === active.id)!;
                saveNote(
                  s,
                  n.id,
                  n.revision,
                  {
                    body:
                      n.body +
                      `\n\n[Evidence: ${source.title}](#citation:${id})\n\n[^${id.slice(0, 8)}]: ${source.title}. ${locator}. ${source.canonical}\n`,
                  },
                  "Citation",
                );
              }
            });
            onClose();
          }}
        >
          <Field label="Source">
            <select
              value={String(dialog.sourceId ?? sourceId)}
              onChange={(e) => setSourceId(e.target.value)}
            >
              {w.sources.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="text-button"
            onClick={() => ctx.setDialog({ type: "source" })}
          >
            + Add source
          </button>
          <Field label="Exact quote">
            <textarea
              rows={5}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
          </Field>
          <Field label="Page, section, or locator">
            <input
              required
              value={locator}
              onChange={(e) => setLocator(e.target.value)}
              placeholder="e.g. Page 12, second paragraph"
            />
          </Field>
          {errors}
          {formFooter("Save citation")}
        </form>
      </Modal>
    );
  if (dialog.type === "citation-detail") {
    const a = w.anchors.find((a) => a.id === dialog.id),
      s = w.sources.find((s) => s.id === a?.sourceId);
    return (
      <Modal
        title="Evidence passage"
        description={s?.title ?? "Source unavailable"}
        onClose={onClose}
      >
        {a && (
          <>
            <blockquote className="large-quote">{a.quote}</blockquote>
            <p>{a.locator}</p>
            <span className="badge">{a.state}</span>
            <div className="dialog-footer">
              <button
                className="secondary"
                onClick={() =>
                  ctx.setDialog({
                    type: "review-card",
                    value: "What does this evidence show?",
                    answer: a.quote,
                    sourceId: a.id,
                    sourceType: "citation",
                  })
                }
              >
                Need to review
              </button>
              {s?.attachmentId ? (
                <button
                  className="primary"
                  onClick={() =>
                    ctx.setDialog({
                      type: "pdf",
                      id: s.attachmentId,
                      anchorId: a.id,
                    })
                  }
                >
                  Open highlight
                </button>
              ) : (
                <a
                  className="primary"
                  href={s?.canonical}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open original <ExternalLink size={14} />
                </a>
              )}
            </div>
          </>
        )}
      </Modal>
    );
  }
  if (dialog.type === "attachments")
    return (
      <Modal
        title="Attachments"
        description="Files remain private. Uploads must finish before a note reference is added."
        onClose={onClose}
      >
        <label className="upload-zone">
          <Upload size={24} />
          <strong>Choose files to attach</strong>
          <span>PDFs, images, audio, video, and text · up to 50 MB each</span>
          <input
            type="file"
            multiple
            onChange={(e) => {
              void ctx.attach(Array.from(e.target.files ?? []));
            }}
          />
        </label>
        {w.attachments
          .filter((a) => !a.trashed)
          .map((a) => (
            <div className="attachment-row" key={a.id}>
              <button
                onClick={() =>
                  ctx.setDialog({
                    type:
                      a.mime === "application/pdf"
                        ? "pdf"
                        : "attachment-detail",
                    id: a.id,
                  })
                }
              >
                <Paperclip size={16} />
                {a.filename}
                <small>{(a.size / 1024).toFixed(0)} KB</small>
              </button>
              <IconButton
                label={"Move " + a.filename + " to Trash"}
                onClick={() =>
                  mutate((s) => {
                    s.attachments.find((x) => x.id === a.id)!.trashed = true;
                  }, "Attachment moved to Trash.")
                }
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
      </Modal>
    );
  if (dialog.type === "attachment-detail") {
    const a = w.attachments.find((a) => a.id === dialog.id);
    return (
      <Modal title={a?.filename ?? "Attachment"} onClose={onClose}>
        <p>
          {a?.mime} · {((a?.size ?? 0) / 1024).toFixed(0)} KB
        </p>
        <button
          className="primary"
          onClick={async () => {
            if (!a) return;
            const blob = ctx.demo
              ? await (await localDB()).get("assets", a.id)
              : await fetch("/api/attachments/" + a.id).then((r) => r.blob());
            if (blob)
              downloadBytes(
                new Uint8Array(await blob.arrayBuffer()),
                a.filename,
                a.mime,
              );
          }}
        >
          Download file <Download size={15} />
        </button>
      </Modal>
    );
  }
  if (dialog.type === "pdf")
    return (
      <Modal
        title="PDF evidence"
        description="Select text or draw a region to save an exact, versioned highlight."
        onClose={onClose}
        wide
      >
        <PdfViewer
          ctx={ctx}
          attachmentId={dialog.id!}
          anchorId={dialog.anchorId as string | undefined}
        />
      </Modal>
    );
  if (dialog.type === "web-source")
    return <WebReader ctx={ctx} source={existingSource!} onClose={onClose} />;
  if (dialog.type === "history") {
    const n = w.notes.find((n) => n.id === dialog.id);
    return (
      <Modal
        title="Note history"
        description="Restoring creates a new revision. The current text stays in history."
        onClose={onClose}
        wide
      >
        <div className="history-layout">
          <div>
            {n?.history
              .slice()
              .reverse()
              .map((r, i) => (
                <button
                  key={r.revision}
                  className={index === i ? "selected" : ""}
                  onClick={() => setIndex(i)}
                >
                  <History size={15} />
                  <span>
                    Revision {r.revision}
                    <small>
                      {new Date(r.at).toLocaleString()} · {r.reason}
                    </small>
                  </span>
                </button>
              ))}
            {!n?.history.length && (
              <p className="muted">
                Your first meaningful change will appear here.
              </p>
            )}
          </div>
          <div>
            {n?.history.slice().reverse()[index] && (
              <>
                <Markdown body={n.history.slice().reverse()[index].body} />
                <button
                  className="primary"
                  onClick={() => {
                    const r = n.history.slice().reverse()[index];
                    mutate((s) => {
                      const current = s.notes.find((x) => x.id === n.id)!;
                      saveNote(
                        s,
                        n.id,
                        current.revision,
                        { body: r.body, title: r.title },
                        "Restore revision " + r.revision,
                      );
                    }, "Restored as a new revision.");
                    onClose();
                  }}
                >
                  Restore this revision
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>
    );
  }
  if (dialog.type === "import")
    return (
      <Modal
        title={
          report ? "Your notes have arrived" : "Bring your knowledge with you"
        }
        description="Import Markdown directly from Obsidian. Your original files stay untouched."
        onClose={onClose}
        wide
      >
        {!plan && !report ? (
          <>
            <label className="upload-zone">
              <Upload size={30} />
              <strong>Choose Markdown files or a vault ZIP</strong>
              <span>
                UTF-8 Markdown · 25 MB compressed / 100 MB expanded · 2,000
                files
              </span>
              <input
                type="file"
                multiple
                accept=".md,.zip,.pdf,.png,.jpg,.jpeg,.gif,.webp"
                onChange={async (e) => {
                  setBusy(true);
                  setError("");
                  try {
                    setPlan(
                      await prepareImport(Array.from(e.target.files ?? [])),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <label className="folder-upload">
              Or choose a folder
              <input
                type="file"
                multiple
                {...({ webkitdirectory: "" } as any)}
                onChange={async (e) => {
                  try {
                    setPlan(
                      await prepareImport(Array.from(e.target.files ?? [])),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
            {busy && (
              <p role="status">
                Checking files, paths, encoding, and checksums…
              </p>
            )}
          </>
        ) : report ? (
          <>
            <div className="import-summary">
              <Check size={28} />
              <h2>{report.imported} notes imported</h2>
              <p>
                {report.skipped} identical files skipped ·{" "}
                {report.warnings.length} items need attention
              </p>
            </div>
            <div className="import-file-list">
              {report.warnings.map((warning, i) => (
                <p key={i}>
                  <AlertCircle size={14} />
                  {warning}
                </p>
              ))}
            </div>
            <button className="primary" onClick={onClose}>
              Back to your workspace <ArrowRight size={15} />
            </button>
          </>
        ) : (
          plan && (
            <>
              <div className="import-counts">
                <span>
                  <strong>
                    {plan.files.filter((f) => f.kind === "note").length}
                  </strong>{" "}
                  Markdown notes
                </span>
                <span>
                  <strong>
                    {plan.files.filter((f) => f.kind === "asset").length}
                  </strong>{" "}
                  attachments
                </span>
                <span>
                  <strong>
                    {plan.files.filter((f) => f.kind === "excluded").length}
                  </strong>{" "}
                  excluded files
                </span>
              </div>
              <Field label="Import into">
                <select
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                >
                  <option value="">New collection</option>
                  {destinations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {ancestry(w, c.id)
                        .map((c) => c.title)
                        .join(" / ")}
                    </option>
                  ))}
                </select>
              </Field>
              {!parent && (
                <Field label="Collection name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Imported notes"
                  />
                </Field>
              )}
              <div className="import-file-list">
                {plan.files.map((f, i) => (
                  <div key={i}>
                    <FileText size={14} />
                    <span>{f.path}</span>
                    <small>{f.reason ?? f.kind}</small>
                  </div>
                ))}
                {plan.warnings.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              </div>
              <p className="field-hint">
                Identical path + checksum matches are skipped. Other files are
                kept independently. Plugin code stays inert.
              </p>
              <div className="dialog-footer">
                <button className="secondary" onClick={() => setPlan(null)}>
                  Back
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      if (!ctx.demo) {
                        const { zipSync } = await import("fflate"),
                          { browserClient } =
                            await import("@/lib/supabase/browser");
                        const id = uid(),
                          key = ctx.account + "/imports/" + id + ".zip";
                        const bytes = zipSync(
                          Object.fromEntries(
                            plan.files
                              .filter((f) => f.kind !== "excluded")
                              .map((f) => [f.path, f.bytes]),
                          ),
                        );
                        const upload = await browserClient()
                          .storage.from("attachments")
                          .upload(key, bytes, {
                            contentType: "application/zip",
                          });
                        if (upload.error) throw upload.error;
                        const r = await fetch("/api/jobs", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            kind: "import",
                            payload: {
                              objectKey: key,
                              filename: "import.zip",
                              destination: parent || undefined,
                              title: name.trim() || "Imported notes",
                            },
                            idempotencyKey: id,
                          }),
                        });
                        const data = await r.json();
                        if (!r.ok) throw new Error(data.error);
                        ctx.setView("jobs");
                        onClose();
                        ctx.toast(
                          "Import queued. Your configured worker will validate and commit it.",
                        );
                        return;
                      }
                      const assets = plan.files.filter(
                        (f) => f.kind === "asset",
                      );
                      const importedAssets: import("@/lib/model").Attachment[] =
                        [];
                      for (const file of assets) {
                        const id = uid(),
                          key =
                            ctx.account +
                            "/" +
                            id +
                            "/" +
                            file.path.split("/").at(-1);
                        const mime = assetMime(file.path);
                        const blob = new Blob([Uint8Array.from(file.bytes)], {
                          type: mime,
                        });
                        if (ctx.demo)
                          await (await localDB()).put("assets", blob, id);
                        else {
                          const { browserClient } =
                            await import("@/lib/supabase/browser");
                          const { error } = await browserClient()
                            .storage.from("attachments")
                            .upload(key, blob);
                          if (error) throw error;
                        }
                        importedAssets.push({
                          id,
                          filename: file.path,
                          mime,
                          size: file.bytes.length,
                          hash: file.hash,
                          key,
                          createdAt: now(),
                        });
                      }
                      mutate((s) => {
                        const destination =
                          parent ||
                          createContainer(s, {
                            title: name.trim() || "Imported notes",
                          }).id;
                        s.attachments.push(...importedAssets);
                        const r = commitImport(s, plan, destination);
                        setReport(r);
                        ctx.setFocus(destination);
                      });
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Importing…" : "Import notes"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </>
          )
        )}
        {errors}
      </Modal>
    );
  if (dialog.type === "publish") {
    const candidates = w.notes.filter(
      (n) =>
        !n.trashed &&
        (dialog.container
          ? inContainer(w, n.containerId, dialog.id!)
          : n.id === dialog.id),
    );
    const existing = w.publications.find(
      (p) =>
        p.containerId === (dialog.container ? dialog.id : active?.containerId),
    );
    return (
      <Modal
        title={
          step === 0
            ? "Share a little understanding"
            : step === 1
              ? "Review exactly what will be public"
              : "Publication saved"
        }
        description={
          ctx.demo
            ? "Local demo publication · this does not publish anything to the internet."
            : "Only the reviewed snapshot becomes public. Private edits remain private."
        }
        onClose={onClose}
        wide
      >
        {step === 0 ? (
          <>
            <div className="publish-selection">
              {candidates.map((n) => (
                <label className="checkbox-field" key={n.id}>
                  <input
                    type="checkbox"
                    checked={selectedNotes.includes(n.id)}
                    onChange={(e) =>
                      setSelectedNotes((ids) =>
                        e.target.checked
                          ? [...ids, n.id]
                          : ids.filter((id) => id !== n.id),
                      )
                    }
                  />
                  <FileText size={16} />
                  <span>
                    {n.title}
                    {["journal", "dream"].includes(n.kind) && (
                      <small className="danger">
                        Personal {n.kind} · excluded by default; check only to
                        explicitly publish this entry
                      </small>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <Field label="Public title">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  w.containers.find((c) => c.id === dialog.id)?.title ??
                  active?.title ??
                  "Research collection"
                }
              />
            </Field>
            <details className="publication-manifest">
              <summary>
                Choose dictionary, sources, evidence & attachments
              </summary>
              <p className="field-hint">
                Review every selected file and excerpt. A published attachment
                contains the entire original file, including any embedded
                metadata.
              </p>
              {(
                [
                  [
                    "definitionIds",
                    "Definitions",
                    w.definitions
                      .filter(
                        (d) =>
                          !d.trashed &&
                          d.subjectIds.some((id) =>
                            w.notes.some(
                              (n) =>
                                selectedNotes.includes(n.id) &&
                                inContainer(w, n.containerId, id),
                            ),
                          ),
                      )
                      .map((d) => ({ id: d.id, label: d.term })),
                  ],
                  [
                    "sourceIds",
                    "Sources",
                    w.sources
                      .filter((s) =>
                        s.noteIds.some((id) => selectedNotes.includes(id)),
                      )
                      .map((s) => ({ id: s.id, label: s.title })),
                  ],
                  [
                    "attachmentIds",
                    "Whole attachments · explicit opt-in",
                    w.attachments
                      .filter(
                        (a) =>
                          !a.trashed &&
                          w.notes.some(
                            (n) =>
                              selectedNotes.includes(n.id) &&
                              (n.body.includes(a.id) ||
                                n.body.includes(a.filename)),
                          ),
                      )
                      .map((a) => ({
                        id: a.id,
                        label:
                          a.filename +
                          " · " +
                          (a.size / 1048576).toFixed(2) +
                          " MB",
                      })),
                  ],
                  [
                    "anchorIds",
                    "Evidence excerpts · explicit opt-in",
                    w.anchors
                      .filter(
                        (a) => a.noteId && selectedNotes.includes(a.noteId),
                      )
                      .map((a) => ({
                        id: a.id,
                        label: a.locator + " — " + a.quote.slice(0, 140),
                      })),
                  ],
                  [
                    "annotationIds",
                    "Author annotations · explicit opt-in",
                    w.annotations
                      .filter(
                        (a) =>
                          a.kind === "author" &&
                          selectedNotes.includes(a.noteId),
                      )
                      .map((a) => ({ id: a.id, label: a.body.slice(0, 140) })),
                  ],
                ] as [
                  keyof typeof publicationExtras,
                  string,
                  { id: string; label: string }[],
                ][]
              ).map(([key, label, items]) => (
                <section key={key}>
                  <h3>{label}</h3>
                  {items.length ? (
                    items.map((item) => (
                      <label className="checkbox-field" key={item.id}>
                        <input
                          type="checkbox"
                          checked={publicationExtras[key].includes(item.id)}
                          onChange={(e) =>
                            setPublicationExtras((p) => ({
                              ...p,
                              [key]: e.target.checked
                                ? [...p[key], item.id]
                                : p[key].filter((id) => id !== item.id),
                            }))
                          }
                        />
                        {item.label}
                      </label>
                    ))
                  ) : (
                    <p className="muted">None associated with these notes.</p>
                  )}
                </section>
              ))}
            </details>
            <Field label="Description">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Help a reader know where to begin."
              />
            </Field>
            <div className="form-row">
              <Field label="Research category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags · comma separated">
                <input value={tags} onChange={(e) => setTags(e.target.value)} />
              </Field>
            </div>
            <Field label="Study method">
              <MethodPicker value={approach} onChange={setApproach} />
            </Field>
            <p className="muted">
              Author: {w.settings.displayName}. Change your public attribution
              in Settings → Profile.
            </p>
            <Field label="Change summary">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What’s new in this version?"
              />
            </Field>
            <div className="publication-permissions">
              {[
                [allowCopies, setAllowCopies, "Allow independent study copies"],
                [allowDownload, setAllowDownload, "Allow Markdown downloads"],
                [allowQA, setAllowQA, "Allow public questions"],
              ].map(([value, setter, label]) => (
                <label className="checkbox-field" key={String(label)}>
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) =>
                      (setter as (v: boolean) => void)(e.target.checked)
                    }
                  />
                  {label as string}
                </label>
              ))}
            </div>
            <div className="dialog-footer">
              <button className="secondary" onClick={onClose}>
                Keep private
              </button>
              <button
                className="primary"
                disabled={!selectedNotes.length}
                onClick={() =>
                  submit(() => {
                    const prepared = prepareSnapshot(
                      w,
                      selectedNotes,
                      {
                        title:
                          name ||
                          w.containers.find((c) => c.id === dialog.id)?.title ||
                          active?.title ||
                          "Research collection",
                        description,
                        category,
                        studyMethod: approach,
                        topics: tags
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean)
                          .slice(0, 20),
                        summary: body || "Published research",
                        allowCopies,
                        allowDownload,
                        allowQA,
                        publicationId: existing?.id ?? uid(),
                        version: (existing?.current.version ?? 0) + 1,
                      },
                      publicationExtras,
                    );
                    setSnapshot(prepared);
                    setPreviewFingerprint(fingerprint(w, selectedNotes));
                    setStep(1);
                  })
                }
              >
                Review privacy & preview <ArrowRight size={15} />
              </button>
            </div>
          </>
        ) : step === 1 && snapshot ? (
          <>
            <div className="privacy-preview">
              <Lock size={19} />
              <div>
                <strong>
                  {snapshot.notes.length} notes · {snapshot.definitions.length}{" "}
                  definitions · {snapshot.sources.length} sources
                </strong>
                <p>
                  Frontmatter, hidden comments, private links, and personal
                  annotations are excluded. Explicitly selected:{" "}
                  {snapshot.attachments?.length ?? 0} whole attachments,{" "}
                  {snapshot.anchors.length} evidence excerpts, and{" "}
                  {snapshot.annotations.length} author annotations.
                </p>
                {selectedNotes.some((id) =>
                  ["journal", "dream"].includes(
                    w.notes.find((n) => n.id === id)!.kind,
                  ),
                ) && (
                  <p className="danger">
                    You explicitly selected a personal journal or dream entry.
                  </p>
                )}
              </div>
            </div>
            <div className="publication-reader-preview">
              <h2>{snapshot.title}</h2>
              <p>
                {snapshot.author} · {snapshot.category} · {snapshot.studyMethod}
              </p>
              <p>
                {publicationCounts(snapshot).folders} folders ·{" "}
                {publicationCounts(snapshot).files} files ·{" "}
                {publicationCounts(snapshot).sources} identifiable sources ·{" "}
                {publicationCounts(snapshot).annotations} author annotations
              </p>
              <small>
                Sources are unique structured source identifiers; annotations
                are explicitly selected author comments. Private study notes are
                excluded.
              </small>
              <p>{snapshot.description}</p>
              {snapshot.notes.map((n) => (
                <section key={n.id}>
                  <h3>{n.title}</h3>
                  <Markdown
                    body={n.body}
                    notes={snapshot.notes}
                    attachments={w.attachments.filter((a) =>
                      snapshot.attachments?.some((x) => x.id === a.id),
                    )}
                    demo={ctx.demo}
                  />
                </section>
              ))}
            </div>
            <div className="dialog-footer">
              <button className="secondary" onClick={() => setStep(0)}>
                Back to selection
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (fingerprint(w, selectedNotes) !== previewFingerprint) {
                    setError(
                      "The selected content changed. Review the updated preview.",
                    );
                    setStep(0);
                    return;
                  }
                  setBusy(true);
                  try {
                    if (ctx.demo)
                      mutate((s) => {
                        const old = s.publications.find(
                          (p) => p.id === snapshot.publicationId,
                        );
                        if (old) {
                          old.versions.push(snapshot);
                          old.current = snapshot;
                          old.status = "published";
                        } else
                          s.publications.push({
                            id: snapshot.publicationId,
                            containerId: String(
                              dialog.container
                                ? dialog.id
                                : active?.containerId,
                            ),
                            current: snapshot,
                            versions: [snapshot],
                            status: "published",
                          });
                      });
                    else {
                      const r = await fetch("/api/publications", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "publish",
                          ids: selectedNotes,
                          expectedRevision: w.revision,
                          fingerprint: previewFingerprint,
                          containerId: dialog.container
                            ? dialog.id
                            : active?.containerId,
                          fields: snapshot,
                          selection: publicationExtras,
                        }),
                      });
                      const data = await r.json();
                      if (!r.ok) throw new Error(data.error);
                      if (data.jobId) {
                        ctx.toast(
                          "Publication queued. The current public version stays intact until assembly completes.",
                        );
                        ctx.setView("jobs");
                        onClose();
                        return;
                      }
                      setSnapshot(data.snapshot);
                    }
                    setStep(2);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Globe size={15} />
                {ctx.demo
                  ? "Save local publication"
                  : existing
                    ? "Publish updates"
                    : "Publish"}
              </button>
            </div>
          </>
        ) : (
          <div className="publication-success">
            <Check size={36} />
            <h2>
              {ctx.demo
                ? "Your local reader preview is ready."
                : "Your research is published."}
            </h2>
            <p>
              Version {snapshot?.version} is a fixed snapshot. Your workspace
              remains independently editable.
            </p>
            <button
              className="primary"
              onClick={() => {
                ctx.setDialog({
                  type: "reader",
                  publicationId: snapshot?.publicationId,
                });
              }}
            >
              Open reader <ArrowRight size={16} />
            </button>
          </div>
        )}
        {errors}
      </Modal>
    );
  }
  if (dialog.type === "reader") {
    const p = w.publications.find((p) => p.id === dialog.publicationId);
    return (
      <Modal title={p?.current.title ?? "Publication"} onClose={onClose} wide>
        {p ? (
          <>
            <div className="public-version-line">
              <Globe size={15} />
              {ctx.demo ? "LOCAL DEMO · " : ""}Version {p.current.version} ·{" "}
              {p.current.author}
            </div>
            <Markdown body={p.current.description} />
            {p.current.notes.map((n) => (
              <section key={n.id} id={"published-" + n.id}>
                <h2>{n.title}</h2>
                <Markdown
                  body={n.body}
                  definitions={p.current.definitions}
                  notes={p.current.notes}
                  onLink={(target) => {
                    const n = p.current.notes.find(
                      (n) => n.id === target || n.title === target,
                    );
                    if (n)
                      document
                        .getElementById("published-" + n.id)
                        ?.scrollIntoView({ block: "start" });
                    else
                      ctx.toast("Linked note unavailable in this publication.");
                  }}
                />
              </section>
            ))}
            <div className="dialog-footer">
              <button
                className="secondary"
                onClick={() => {
                  ctx.setView("discover");
                  onClose();
                }}
              >
                Open Discover
              </button>
              {!ctx.demo && (
                <a className="primary" href={"/p/" + p.id} target="_blank">
                  Open public page <ExternalLink size={15} />
                </a>
              )}
            </div>
          </>
        ) : (
          <a href={"/p/" + dialog.publicationId} className="primary">
            Open published reader
          </a>
        )}
      </Modal>
    );
  }
  if (dialog.type === "ai-evidence") {
    const record = w.ai.find((r) => r.id === dialog.id),
      evidence = record?.evidence?.find((e) => e.id === dialog.reference);
    return (
      <Modal title="Evidence supplied to the study guide" onClose={onClose}>
        <p className="field-hint">
          {evidence?.title ?? evidence?.locator ?? "Saved context passage"}
        </p>
        <Markdown
          body={
            evidence?.text ??
            "This reference was not included in the saved session."
          }
        />
      </Modal>
    );
  }
  if (dialog.type === "ai-preview") {
    const text = String(dialog.output ?? "");
    const targetNote = w.notes.find((n) => n.id === dialog.noteId) ?? active;
    const fresh =
      targetNote?.id === active?.id &&
      Number(dialog.revision) === targetNote?.revision;
    return (
      <Modal
        title="Review the proposed text"
        description="Your original remains unchanged until you choose an action."
        onClose={onClose}
        wide
      >
        <div className="diff-columns">
          <section>
            <h3>Current note · revision {active?.revision}</h3>
            <Markdown body={active?.body ?? ""} />
          </section>
          <section>
            <h3>AI proposal</h3>
            <Markdown body={text} />
          </section>
        </div>
        {!fresh && (
          <p className="form-error">
            The note changed during generation. Save as a new note or generate a
            fresh proposal.
          </p>
        )}
        <div className="dialog-footer">
          <button className="secondary" onClick={onClose}>
            Reject
          </button>
          <button
            className="secondary"
            onClick={() => {
              let id = "";
              mutate((s) => {
                id = createNote(s, active?.containerId ?? general(s).id, {
                  title: (active?.title ?? "Study guide") + " · AI study",
                  body: text,
                  metadata: { aiAssisted: true },
                }).id;
              });
              ctx.openNote(id);
              onClose();
            }}
          >
            Save as new note
          </button>
          <button
            className="primary"
            disabled={!fresh}
            onClick={() => {
              if (!active || active.revision !== Number(dialog.revision))
                return;
              mutate((s) =>
                saveNote(
                  s,
                  active.id,
                  active.revision,
                  { body: active.body + "\n\n" + text },
                  "Accepted AI addition",
                ),
              );
              onClose();
            }}
          >
            Insert below
          </button>
          <button
            className="secondary"
            disabled={!fresh}
            onClick={() => {
              if (!fresh || !targetNote) return;
              const selection =
                typeof dialog.selection === "string" ? dialog.selection : "";
              if (selection && !targetNote.body.includes(selection)) {
                setError(
                  "The selected passage changed. Generate a fresh proposal.",
                );
                return;
              }
              mutate((s) =>
                saveNote(
                  s,
                  targetNote.id,
                  targetNote.revision,
                  {
                    body: selection
                      ? targetNote.body.replace(selection, text)
                      : text,
                  },
                  "Accepted AI rewrite",
                ),
              );
              onClose();
            }}
          >
            {dialog.selection
              ? "Replace selected passage"
              : "Replace note text"}
          </button>
        </div>
      </Modal>
    );
  }
  if (dialog.type === "delete-account")
    return (
      <Modal
        title="Delete your account"
        description="Revalidate your password, then confirm removal of your active data and public access."
        onClose={onClose}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (ctx.demo) {
              setError(
                "This is a local demo, not an account. Export your work before clearing browser site data.",
              );
              return;
            }
            setBusy(true);
            try {
              const response = await fetch("/api/account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: body, confirmation: name }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              const { clearAccountCache } = await import("@/lib/store");
              await clearAccountCache(ctx.account);
              location.href = "/auth";
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Private notes, sources, study history, and active publications will
            be removed. Previously made independent copies and expired-backup
            schedules are outside this action.
          </p>
          <Field label="Your current password">
            <input
              type="password"
              autoComplete="current-password"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </Field>
          <Field label="Type DELETE MY ACCOUNT">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          {errors}
          <div className="dialog-footer">
            <button type="button" className="secondary" onClick={onClose}>
              Keep my account
            </button>
            <button
              className="secondary danger"
              disabled={busy || name !== "DELETE MY ACCOUNT" || !body}
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </form>
      </Modal>
    );
  if (dialog.type === "conflict")
    return (
      <Modal
        title="Your draft is retained"
        description="Export a copy before reloading the latest saved workspace."
        onClose={onClose}
      >
        <p>
          A different browser session saved after this session loaded. Automatic
          saving has paused to protect both versions.
        </p>
        <div className="stack-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await ctx.recoverDraft(
                  dialog.draft as import("@/lib/model").Workspace | undefined,
                );
                onClose();
                ctx.toast(
                  "Recovery applied. Differing notes were kept as separate recovered drafts.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Keep both versions & resume saving
          </button>
          {errors}
          <button
            className="primary"
            onClick={() => void ctx.exportData({ full: true })}
          >
            Export this draft as a backup
          </button>
          <button className="secondary" onClick={() => location.reload()}>
            Reload the saved workspace
          </button>
        </div>
      </Modal>
    );
  return (
    <Modal title="Workspace action" onClose={onClose}>
      <p>
        This item is no longer available. Close this dialog and refresh its
        source.
      </p>
    </Modal>
  );
}
function WebReader({
  ctx,
  source,
  onClose,
}: {
  ctx: AppContext;
  source: Source;
  onClose: () => void;
}) {
  const [text, setText] = useState(""),
    [hash, setHash] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [quote, setQuote] = useState("");
  return (
    <Modal
      title="Source reader"
      description={source?.title}
      onClose={onClose}
      wide
    >
      <p className="field-hint">
        Fetch a publicly accessible article. Blocked pages can still be cited
        with a manual quote and section.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/extract", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: source.canonical }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setText(data.text);
            setHash(data.hash);
            ctx.mutate((w) => {
              for (const a of w.anchors.filter(
                (a) => a.sourceId === source.id && a.contentHash,
              )) {
                a.state =
                  a.contentHash === data.hash
                    ? "attached"
                    : locateQuote(data.text, a.quote, a.prefix, a.suffix)
                          .state === "unresolved"
                      ? "unresolved"
                      : "changed";
              }
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Retrieving article…" : "Fetch supported article"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error} Use the manual excerpt workflow below.
        </p>
      )}
      <article
        className="web-reader-text"
        onMouseUp={() => setQuote(window.getSelection()?.toString() ?? "")}
      >
        {text.split("\n").map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </article>
      {ctx.w.anchors
        .filter((a) => a.sourceId === source.id)
        .map((a) => (
          <div className="saved-excerpt" key={a.id}>
            <button
              className="text-button"
              onClick={() => {
                setQuote(a.quote);
                if (
                  text &&
                  !focusPassage(
                    document.querySelector(".web-reader-text"),
                    a.quote,
                    a.prefix,
                    a.suffix,
                  )
                )
                  setError(
                    "The old excerpt is unavailable in the current extraction. The saved quote remains intact.",
                  );
              }}
            >
              {a.quote.slice(0, 180)}
            </button>
            <small>
              {a.state === "attached"
                ? "Saved evidence"
                : a.state === "changed"
                  ? "Source changed · inspect before saving a new version"
                  : "Unresolved in current source"}
            </small>
          </div>
        ))}
      <Field label="Selected or manually entered quote">
        <textarea
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          rows={4}
        />
      </Field>
      <div className="dialog-footer">
        <a
          href={source.canonical}
          target="_blank"
          rel="noopener noreferrer"
          className="secondary"
        >
          Open original
        </a>
        <button
          className="primary"
          disabled={!quote.trim()}
          onClick={() => {
            ctx.mutate((w) => {
              const start = text.indexOf(quote);
              w.anchors.push({
                id: uid(),
                sourceId: source.id,
                noteId: ctx.active?.id,
                noteRevision: ctx.active?.revision,
                quote,
                prefix:
                  start >= 0 ? text.slice(Math.max(0, start - 60), start) : "",
                suffix:
                  start >= 0
                    ? text.slice(
                        start + quote.length,
                        start + quote.length + 60,
                      )
                    : "",
                locator: text
                  ? "Retrieved article excerpt · " +
                    new Date().toLocaleDateString()
                  : "Manual excerpt",
                contentHash: hash || undefined,
                state: "attached",
              });
            }, "Evidence excerpt saved.");
            onClose();
          }}
        >
          Save evidence excerpt
        </button>
      </div>
    </Modal>
  );
}
