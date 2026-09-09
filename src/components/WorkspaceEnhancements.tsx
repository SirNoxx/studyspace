"use client";
import { useState, useEffect } from "react";
import {
  BookOpen,
  Feather,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Paperclip,
  MessageCircle,
  Link2,
  Plus,
  Check,
} from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import { Modal, Field, SymbolIcon } from "./ui";
import {
  methods,
  extraThemes,
  calendarDays,
  dateParts,
  shiftPeriod,
  scopedAttachments,
  stableNoteLink,
} from "@/lib/enhancements";
import { ancestry, localDate, now, type Theme } from "@/lib/model";
import AttachmentMedia from "./AttachmentMedia";
import AIStudy from "./study/AIStudy";
import { saveNote } from "@/lib/domain";

export function JournalIcon({ size = 20 }: { size?: number }) {
  return (
    <span
      className="journal-symbol"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <BookOpen size={size} />
      <Feather size={size * 0.7} />
    </span>
  );
}
function MethodArt({ kind }: { kind: string }) {
  return (
    <svg className="method-art" viewBox="0 0 220 90" aria-hidden="true">
      <rect
        x="24"
        y="10"
        width="172"
        height="70"
        rx="12"
        fill="var(--accent-soft)"
      />
      {kind === "visual" ? (
        <g stroke="var(--accent)" fill="var(--panel-raised)" strokeWidth="2">
          <path d="M65 45H150M110 30V65" />
          <circle cx="65" cy="45" r="12" />
          <circle cx="150" cy="45" r="16" />
          <circle cx="110" cy="25" r="10" />
          <circle cx="110" cy="65" r="10" />
        </g>
      ) : kind === "cards" ? (
        <g fill="var(--panel-raised)" stroke="var(--accent)" strokeWidth="2">
          <rect
            x="55"
            y="24"
            width="62"
            height="43"
            rx="5"
            transform="rotate(-8 55 24)"
          />
          <rect x="102" y="26" width="62" height="43" rx="5" />
          <text x="77" y="52" fill="var(--accent)" stroke="none" fontSize="24">
            ?
          </text>
          <path d="m122 47 7 7 15-17" fill="none" />
        </g>
      ) : (
        <g stroke="var(--accent)" strokeWidth="3" strokeLinecap="round">
          <path d="M55 30h105M55 45h75M55 60h90" />
          {kind === "steps" && <path d="m174 35 10 10-10 10" fill="none" />}
          {kind === "mixed" && (
            <circle cx="160" cy="58" r="13" fill="var(--panel-raised)" />
          )}
        </g>
      )}
    </svg>
  );
}
export function MethodPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = methods.find((m) => m.id === value) ?? methods[0];
  return (
    <>
      <button
        type="button"
        className="method-choice"
        onClick={() => setOpen(true)}
      >
        <MethodArt kind={chosen.symbol} />
        <span>
          <strong>{chosen.name}</strong>
          <small>{chosen.description}</small>Choose study method
        </span>
      </button>
      {open && (
        <Modal
          title="How would you like to study?"
          description="Choose a method to guide your work. You can combine approaches; these are preferences, not fixed learning types."
          wide
          onClose={() => setOpen(false)}
        >
          <div className="method-grid">
            {methods.map((m) => (
              <button
                type="button"
                key={m.id}
                aria-pressed={value === m.id}
                className={
                  "method-option " + (value === m.id ? "selected" : "")
                }
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <MethodArt kind={m.symbol} />
                <strong>
                  {m.name}
                  {value === m.id && <Check size={16} />}
                </strong>
                <p>{m.description}</p>
                <small>Useful for: {m.use}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
export function ThemeExtras({ ctx }: { ctx: AppContext }) {
  return (
    <div className="theme-options seasonal-themes">
      {extraThemes.map((t) => (
        <button
          key={t.id}
          className={
            "theme-option " + (ctx.w.settings.theme === t.id ? "selected" : "")
          }
          aria-pressed={ctx.w.settings.theme === t.id}
          onClick={() =>
            ctx.mutate((w) => {
              w.settings.theme = t.id;
            })
          }
        >
          <span
            className="theme-swatch"
            style={{
              background: `linear-gradient(135deg,${t.colors.join(",")})`,
            }}
          />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
export function GroupSelect({
  ctx,
  value,
  onChange,
  label = "Study group",
}: {
  ctx: AppContext;
  value?: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Automatic / ungrouped</option>
        {ctx.w.settings.cardGroups?.map((g) => (
          <option value={g.id} key={g.id}>
            {g.title}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function JournalCalendar({
  ctx,
  date,
  onDate,
  isDream,
}: {
  ctx: AppContext;
  date: string;
  onDate: (date: string) => void;
  isDream: boolean;
}) {
  const [mode, setMode] = useState("week");
  const days = calendarDays(date, mode),
    today = localDate(ctx.w.settings.timezone),
    entries = ctx.w.notes.filter(
      (n) => !n.trashed && n.kind === (isDream ? "dream" : "journal"),
    );
  return (
    <section className="journal-calendar" aria-label="Journal calendar">
      <div className="calendar-controls">
        <button
          aria-label="Previous calendar period"
          onClick={() => onDate(shiftPeriod(date, mode, -1))}
        >
          <ChevronLeft size={17} />
        </button>
        <strong>
          {dateParts(date).toLocaleDateString(undefined, {
            timeZone: "UTC",
            year: "numeric",
            ...(mode === "year" ? {} : { month: "long" }),
          })}
        </strong>
        <button
          aria-label="Next calendar period"
          onClick={() => onDate(shiftPeriod(date, mode, 1))}
        >
          <ChevronRight size={17} />
        </button>
        <button className="text-button" onClick={() => onDate(today)}>
          Today
        </button>
        <select
          aria-label="Calendar view"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
      </div>
      <div className={"calendar-grid calendar-" + mode}>
        {days.map((day) => {
          const count = entries.filter((n) => n.journalDate === day).length;
          return (
            <button
              key={day}
              className={
                (date === day ? "selected " : "") +
                (today === day ? "today " : "") +
                (count ? "has-entries " : "") +
                (mode === "month" && day.slice(0, 7) !== date.slice(0, 7)
                  ? "outside"
                  : "")
              }
              aria-label={
                day + (count ? ` · ${count} entries` : " · no entries")
              }
              aria-pressed={date === day}
              title={day + (count ? ` · ${count} entries` : "")}
              onClick={() => onDate(day)}
            >
              {mode !== "year" && (
                <>
                  <small>
                    {dateParts(day).toLocaleDateString(undefined, {
                      timeZone: "UTC",
                      weekday: "short",
                    })}
                  </small>
                  <span>{Number(day.slice(8))}</span>
                  {count > 0 && (
                    <small>
                      {count} {count === 1 ? "entry" : "entries"}
                    </small>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
      <small className="muted">
        {mode === "year" ? "One dot per day. " : ""}Filled dates contain
        entries; the outlined date is today. {ctx.w.settings.timezone}
      </small>
    </section>
  );
}
export function AttachmentsPanel({
  ctx,
  id,
  onClose,
}: {
  ctx: AppContext;
  id: string;
  onClose: () => void;
}) {
  const rows = scopedAttachments(ctx.w, id);
  return (
    <Modal
      wide
      title="Folder attachments"
      description={ancestry(ctx.w, id)
        .map((c) => c.title)
        .join(" / ")}
      onClose={onClose}
    >
      <p className="muted">
        Files referenced by notes in this folder and its descendants. Repeated
        references are grouped by file identity.
      </p>
      <div className="attachment-manager">
        {rows.map(({ asset, notes }) => (
          <article key={asset.id}>
            <button
              className="text-button"
              onClick={() =>
                ctx.setDialog({
                  type: asset.mime === "application/pdf" ? "pdf" : "attachment",
                  id: asset.id,
                })
              }
            >
              <Paperclip size={15} />
              {asset.filename}
            </button>
            {asset.mime.startsWith("image/") ? (
              <AttachmentMedia asset={asset} image demo={ctx.demo} />
            ) : (
              <span className="file-type-preview">
                <FileText size={24} />
                {asset.mime.split("/").at(-1)} ·{" "}
                {(asset.size / 1024).toFixed(1)} KB
              </span>
            )}
            <div>
              {notes.map((n) => (
                <button
                  className="attachment-origin text-button"
                  key={n.id}
                  onClick={() => {
                    ctx.openNote(n.id);
                    onClose();
                  }}
                >
                  {n.title}
                  <small>
                    {ancestry(ctx.w, n.containerId)
                      .map((c) => c.title)
                      .join(" / ")}
                  </small>
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p>
          No referenced attachments in this folder yet. Add a file to one of its
          notes to see it here.
        </p>
      )}
    </Modal>
  );
}
export function HyperlinkDialog({
  ctx,
  onClose,
}: {
  ctx: AppContext;
  onClose: () => void;
}) {
  const selected = ctx.selection || ctx.editor.current?.selection() || "",
    match = selected.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
  const [text, setText] = useState(match?.[1] ?? selected),
    [url, setUrl] = useState(match?.[2] ?? ""),
    [kind, setKind] = useState(
      match?.[2]?.startsWith("#note:") ? "internal" : "external",
    ),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const [origin] = useState(() => {
    const note = ctx.active,
      range = ctx.editor.current?.range();
    const index = note?.body.indexOf(selected) ?? -1;
    const exact =
      range && note?.body.slice(range.from, range.to) === selected
        ? range
        : index >= 0 &&
            note?.body.indexOf(selected, index + selected.length) === -1
          ? { from: index, to: index + selected.length }
          : null;
    return { noteId: note?.id, revision: note?.revision, range: exact };
  });
  return (
    <Modal
      title="Insert or edit link"
      description="Select an existing Markdown link to edit it, or link the selected text."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (
              !ctx.active ||
              ctx.active.id !== origin.noteId ||
              ctx.active.revision !== origin.revision ||
              !origin.range
            )
              throw Error("The note changed. Select the passage again.");
            if (!text.trim()) throw Error("Enter meaningful link text.");
            let link: string;
            if (kind === "internal") {
              const id = url.replace(/^#note:/, "");
              if (!ctx.w.notes.some((n) => n.id === id && !n.trashed))
                throw Error("Choose an available note.");
              link = stableNoteLink(id, text);
            } else {
              const u = new URL(url);
              if (!["https:", "http:", "mailto:"].includes(u.protocol))
                throw Error("Use an HTTP, HTTPS, or email URL.");
              link = `[${text.replace(/[\\\[\]]/g, "\\$&")}](${u.toString().replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
            }
            const range = origin.range;
            ctx.mutate((w) => {
              const n = w.notes.find((n) => n.id === origin.noteId)!;
              saveNote(
                w,
                n.id,
                origin.revision!,
                {
                  body:
                    n.body.slice(0, range.from) + link + n.body.slice(range.to),
                },
                "Insert or edit hyperlink",
              );
            });
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <Field label="Link text">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label="Destination type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setUrl("");
            }}
          >
            <option value="external">External page</option>
            <option value="internal">Studyspace note</option>
          </select>
        </Field>
        {kind === "external" ? (
          <Field label="URL">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              required
            />
          </Field>
        ) : (
          <>
            <Field label="Find a note">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles or folders"
              />
            </Field>
            <div className="link-picker">
              {ctx.w.notes
                .filter(
                  (n) =>
                    !n.trashed &&
                    (
                      n.title +
                      " " +
                      ancestry(ctx.w, n.containerId)
                        .map((c) => c.title)
                        .join("/")
                    )
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .slice(0, 100)
                .map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    aria-pressed={url === "#note:" + n.id}
                    className={url === "#note:" + n.id ? "selected" : ""}
                    onClick={() => setUrl("#note:" + n.id)}
                  >
                    <FileText size={14} />
                    <span>
                      {n.title}
                      <small>
                        {ancestry(ctx.w, n.containerId)
                          .map((c) => c.title)
                          .join(" / ")}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
            <small>Showing up to 100 matches; refine your search.</small>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="primary">Save link</button>
        </div>
      </form>
    </Modal>
  );
}
export function ChatLauncher({ ctx }: { ctx: AppContext }) {
  const [open, setOpen] = useState(false);
  if (ctx.w.settings.chatHidden) return null;
  return (
    <>
      <div className="chat-launcher">
        <button
          className="secondary"
          onClick={() => setOpen(true)}
          aria-label="Open AI Chat"
        >
          <MessageCircle size={18} />
          <span>AI Chat</span>
        </button>
        <button
          aria-label="Hide AI Chat launcher"
          title="Restore in Settings → Appearance"
          onClick={() =>
            ctx.mutate((w) => {
              w.settings.chatHidden = true;
            })
          }
        >
          <X size={13} />
        </button>
      </div>
      {open && (
        <Modal
          title="AI Chat"
          description="A little help thinking things through. Explore a topic, clarify your notes, or practice what you know. You choose the context each time."
          onClose={() => setOpen(false)}
        >
          <AIStudy ctx={ctx} />
        </Modal>
      )}
    </>
  );
}
export const toolDescriptions: Record<string, string> = {
  dictionary:
    "Dictionary keeps meanings close to your writing. Add a term or explore definitions in this subject.",
  sources:
    "Sources connects your notes to research, articles, books, and PDF evidence.",
  outline:
    "Outline turns your headings into a map. Select a heading to jump to it.",
  backlinks:
    "Backlinks shows notes that refer to your current note, revealing useful connections.",
  annotations:
    "Annotations holds private reflections and draft author comments. Public questions belong to published versions.",
  ai: "AI Study Guide helps explain, summarize, and practice selected material, after your explicit consent.",
};
export function Onboarding({
  ctx,
  step,
  onStep,
  onClose,
}: {
  ctx: AppContext;
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const finish = () => {
    ctx.mutate((w) => {
      w.settings.onboardingComplete = true;
    });
    onClose();
  };
  return (
    <section
      className="onboarding-card"
      aria-label="Studyspace walkthrough"
      role="region"
    >
      <span className="eyebrow">WELCOME TO STUDYSPACE · {step + 1} / 3</span>
      <h3>
        {
          [
            "Make yourself at home",
            "A place for each part of your work",
            "Choose a tool that interests you",
          ][step]
        }
      </h3>
      <p>
        {
          [
            "The far-left navigation starts with labels. Use its chevron to make it compact, and click again to expand it. Collections reopens the file explorer whenever you need it.",
            "Collections is your writing space. Search finds notes, Bookmarks keeps favorites, Journal captures your days, Review practices study cards, and Discover explores published research.",
            "Try any tab in Notes & Sources. Its description appears beneath the buttons. You can show compact icons with the label toggle and reopen the panel from the top bar.",
          ][step]
        }
      </p>
      <div>
        <button className="text-button" onClick={finish}>
          Skip walkthrough
        </button>
        {step > 0 && (
          <button className="secondary" onClick={() => onStep(step - 1)}>
            Back
          </button>
        )}
        <button
          className="primary"
          onClick={() => (step === 2 ? finish() : onStep(step + 1))}
        >
          {step === 2 ? "Finish" : "Next"}
        </button>
      </div>
    </section>
  );
}
