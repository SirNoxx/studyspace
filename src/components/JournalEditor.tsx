"use client";
import { useState } from "react";
import { Code2, Eye, PenLine, X, Globe, LayoutTemplate } from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import type { Note, JournalTemplate } from "@/lib/model";
import { saveNote } from "@/lib/domain";
import { formatJournalDate, noteDisplayTitle } from "@/lib/journal-date";
import Editor from "./Editor";
import Markdown from "./Markdown";
import { IconButton, Modal } from "./ui";
import JournalTemplates from "./JournalTemplates";

export default function JournalEditor({
  ctx,
  note,
  onClose,
}: {
  ctx: AppContext;
  note: Note;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"live" | "source" | "reading">("live");
  const [templateId, setTemplateId] = useState("default");
  const [library, setLibrary] = useState<"saved" | "public" | null>(null);
  const [pending, setPending] = useState<JournalTemplate | null>(null);
  const kind = note.kind === "dream" ? "dream" : "journal";
  const defaultBody =
    kind === "dream"
      ? ctx.w.settings.dreamTemplate
      : ctx.w.settings.journalTemplate;
  const templates: JournalTemplate[] = [
    { id: "default", title: "Default template", kind, body: defaultBody },
    ...(ctx.w.settings.journalTemplates ?? []).filter((t) => t.kind === kind),
  ];
  const chosen = templates.find((t) => t.id === templateId) ?? templates[0];
  const update = (fields: Partial<Note>, reason?: string) =>
    ctx.mutate((w) => {
      const current = w.notes.find((n) => n.id === note.id);
      if (current) saveNote(w, current.id, current.revision, fields, reason);
    });
  const apply = (template: JournalTemplate, append = false) => {
    ctx.mutate((w) => {
      const current = w.notes.find((n) => n.id === note.id);
      if (!current) return;
      saveNote(
        w,
        current.id,
        current.revision,
        {
          body:
            append && current.body.trim()
              ? current.body + "\n\n" + template.body
              : template.body,
        },
        "Apply journal template",
      );
    }, "Template applied. Previous text is retained in version history.");
    setPending(null);
    setMode("live");
  };
  const requestTemplate = (template: JournalTemplate) => {
    setLibrary(null);
    if (!note.body.trim()) apply(template);
    else setPending(template);
  };
  return (
    <section className="journal-entry-editor" aria-label="Journal entry editor">
      <header className="journal-editor-header">
        <span>{formatJournalDate(note.journalDate!)}</span>
        <div className="inline-actions">
          {(
            [
              { id: "live", icon: PenLine, label: "Live" },
              { id: "source", icon: Code2, label: "Source" },
              { id: "reading", icon: Eye, label: "Reading" },
            ] as const
          ).map((item) => (
            <IconButton
              key={item.id}
              label={item.label}
              active={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              <item.icon size={15} />
            </IconButton>
          ))}
          <IconButton label="Close journal editor" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
      </header>
      <input
        className="journal-entry-title"
        aria-label="Journal entry title"
        maxLength={240}
        value={noteDisplayTitle(note)}
        readOnly={mode === "reading"}
        onChange={(e) => update({ title: e.target.value })}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            mode !== "reading"
          ) {
            e.preventDefault();
            ctx.editor.current?.focus();
          }
        }}
      />
      <div className="journal-template-bar">
        <LayoutTemplate size={16} />
        <select
          aria-label="Journal template"
          value={chosen.id}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={() => requestTemplate(chosen)}>
          Apply template
        </button>
        <button className="text-button" onClick={() => setLibrary("saved")}>
          My templates
        </button>
        <button className="text-button" onClick={() => setLibrary("public")}>
          <Globe size={13} /> Public templates
        </button>
        <button
          className="text-button"
          onClick={() =>
            ctx.mutate((w) => {
              if (kind === "dream") w.settings.dreamTemplate = chosen.body;
              else w.settings.journalTemplate = chosen.body;
            }, "Default template updated for new entries.")
          }
        >
          Use for new entries
        </button>
      </div>
      <div className="journal-writing-area">
        {mode === "reading" && (
          <Markdown
            body={note.body}
            demo={ctx.demo}
            attachments={ctx.w.attachments}
            notes={ctx.w.notes}
            remoteImages={ctx.w.settings.remoteImages}
          />
        )}
        <div hidden={mode === "reading"}>
          <Editor
            id={note.id}
            body={note.body}
            mode={mode === "source" ? "source" : "live"}
            definitions={[]}
            attachments={ctx.w.attachments}
            demo={ctx.demo}
            notes={ctx.w.notes}
            handle={ctx.editor}
            onChange={(body) => update({ body })}
            onSelection={ctx.setSelection}
            onDefinition={() => {}}
            onAttach={(files) => void ctx.attach(files)}
          />
        </div>
      </div>
      <footer className="journal-editor-footer">
        <span>Private entry · changes save automatically</span>
        <button
          className="text-button"
          onClick={() => ctx.setDialog({ type: "history", id: note.id })}
        >
          Version history
        </button>
      </footer>
      {library && (
        <JournalTemplates
          ctx={ctx}
          kind={kind}
          initialTab={library}
          onClose={() => setLibrary(null)}
          onUse={(template) => {
            setTemplateId(template.id);
            requestTemplate(template);
          }}
        />
      )}
      {pending && (
        <Modal
          title={"Apply “" + pending.title + "”"}
          description="Choose how to apply this template to your current entry. Replaced text stays in version history."
          onClose={() => setPending(null)}
        >
          <div className="journal-template-preview">
            <Markdown body={pending.body} />
          </div>
          <div className="dialog-footer">
            <button className="secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button className="secondary" onClick={() => apply(pending, true)}>
              Append to entry
            </button>
            <button className="primary" onClick={() => apply(pending)}>
              Replace entry
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
