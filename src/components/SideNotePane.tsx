"use client";
import { useState, useLayoutEffect, useRef } from "react";
import {
  BookA,
  Layers,
  Link2,
  MessageCircle,
  X,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import type { Note } from "@/lib/model";
import { saveNote } from "@/lib/domain";
import { resolveLink } from "@/lib/markdown";
import Editor, { type EditorHandle } from "./Editor";
import { ModulesButton } from "./ModuleGallery";
import Markdown from "./Markdown";
import SelectionToolbar from "./SelectionToolbar";
import NoteTranscripts from "./NoteTranscripts";

export default function SideNotePane({
  ctx,
  note,
  handle,
  selection,
  onSelection,
  focused,
  onFocus,
  onClose,
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  ctx: AppContext;
  note: Note;
  handle: React.MutableRefObject<EditorHandle | null>;
  selection: string;
  onSelection: (text: string) => void;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"live" | "source" | "reading">("live");
  const scroll = useRef<HTMLDivElement>(null),
    positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const element = scroll.current;
    if (element) element.scrollTop = positions.current.get(note.id) ?? 0;
    return () => {
      if (element) positions.current.set(note.id, element.scrollTop);
    };
  }, [note.id]);
  const update = (fields: { body?: string; title?: string }) =>
    ctx.mutate((w) => {
      const current = w.notes.find((n) => n.id === note.id);
      if (current) saveNote(w, current.id, current.revision, fields);
    });
  return (
    <section
      className={"side-note-pane" + (focused ? " active-file-pane" : "")}
      aria-label="Right file pane"
      onFocusCapture={onFocus}
      onPointerDown={onFocus}
    >
      <header className="side-note-header">
        <div className="note-navigation">
          <button
            aria-label="Back to previous note"
            title="Previous note"
            disabled={!canBack}
            onClick={onBack}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            aria-label="Forward to next note"
            title="Next note"
            disabled={!canForward}
            onClick={onForward}
          >
            <ArrowRight size={16} />
          </button>
        </div>
        <span title={note.title}>{note.title || "Untitled"}</span>
        <button
          className="icon-button"
          aria-label="Close right file pane"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="side-note-modes">
        <ModulesButton
          onInsert={(text) => {
            if (handle.current && mode !== "reading")
              handle.current.insert(text);
            else update({ body: note.body + text });
            setMode("live");
          }}
        />
        {(["live", "source", "reading"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className="side-note-scroll" ref={scroll}>
        <input
          className="side-note-title"
          aria-label="Right note title"
          value={note.title}
          readOnly={mode === "reading"}
          maxLength={240}
          onChange={(e) => update({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") handle.current?.focus();
          }}
        />
        <div className="writing-area">
          {mode === "reading" ? (
            <Markdown
              body={note.body}
              notes={ctx.w.notes}
              attachments={ctx.w.attachments}
              demo={ctx.demo}
              remoteImages={ctx.w.settings.remoteImages}
              onLink={(target) => {
                const match = resolveLink(
                  target,
                  note.originalPath ?? note.title,
                  ctx.w.notes,
                );
                const id = note.linkMap?.[target] ?? match.id;
                if (id) ctx.openNote(id);
                else ctx.toast("Linked note not found or ambiguous.");
              }}
            />
          ) : (
            <Editor
              id={note.id}
              body={note.body}
              mode={mode}
              handle={handle}
              onChange={(body) => update({ body })}
              onSelection={onSelection}
              definitions={[]}
              onDefinition={() => {}}
              onAttach={(files) => void ctx.attach(files, note.id)}
              onChat={(text) => ctx.openChat(text, note.id)}
              onBlockAction={(action, block) =>
                ctx.blockAction?.(action, block, note.id)
              }
              onYoutubePaste={(url) => ctx.importYoutube?.(url, note.id)}
              notes={ctx.w.notes}
              attachments={ctx.w.attachments}
              demo={ctx.demo}
            />
          )}
          <NoteTranscripts
            ctx={ctx}
            note={note}
            onImport={(...args) => ctx.importYoutube?.(...args)}
          />
        </div>
      </div>
      {focused && (
        <SelectionToolbar selection={selection} reading={mode === "reading"}>
          {(text) => (
            <>
              <button
                onClick={() =>
                  ctx.setDialog({
                    type: "definition",
                    value: text,
                    sourceId: note.id,
                  })
                }
              >
                <BookA size={14} />
                Add to dictionary
              </button>
              <button
                onClick={() =>
                  ctx.setDialog({
                    type: "review-card",
                    value: "",
                    answer: text,
                    passage: text,
                    sourceId: note.id,
                  })
                }
              >
                <Layers size={14} />
                Create study card
              </button>
              <button
                onClick={() => {
                  onSelection(text);
                  ctx.setDialog({ type: "hyperlink" });
                }}
              >
                <Link2 size={14} />
                Insert / edit link
              </button>
              <button onClick={() => ctx.openChat(text, note.id)}>
                <MessageCircle size={14} />
                Add to Chat
              </button>
            </>
          )}
        </SelectionToolbar>
      )}
    </section>
  );
}
