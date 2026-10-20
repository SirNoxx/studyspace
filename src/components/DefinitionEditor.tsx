"use client";

import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
} from "@codemirror/view";
import { conceptMatches } from "@/lib/markdown";
import type { Definition } from "@/lib/model";

export default function DefinitionEditor({
  value,
  onChange,
  definitions,
  onDefine,
  onDefinition,
  autoFocus = false,
  readOnly = false,
  onSave,
  label = "Definition",
  hint = "Explain it in your own words. Markdown is welcome.",
}: {
  value: string;
  onChange: (value: string) => void;
  definitions: Definition[];
  onDefine: (term: string) => void;
  onDefinition: (id: string) => void;
  autoFocus?: boolean;
  readOnly?: boolean;
  onSave?: () => void;
  label?: string;
  hint?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onDefine, onDefinition, onSave });
  callbacks.current = { onChange, onDefine, onDefinition, onSave };
  const entries = useRef(definitions);
  entries.current = definitions;
  const [selected, setSelected] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const decoration = ViewPlugin.fromClass(
      class {
        decorations;
        constructor(editor: EditorView) {
          this.decorations = this.build(editor);
        }
        update(update: { view: EditorView }) {
          this.decorations = this.build(update.view);
        }
        build(editor: EditorView) {
          return Decoration.set(
            conceptMatches(editor.state.doc.toString(), entries.current).map(
              (match) =>
                Decoration.mark({
                  class: "definition-term",
                  attributes: {
                    "data-definition": match.entry.id,
                    title: match.entry.definition,
                  },
                }).range(match.from, match.to),
            ),
            true,
          );
        }
      },
      { decorations: (plugin) => plugin.decorations },
    );
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          keymap.of([
            { key: "Shift-Enter", run: insertNewlineAndIndent },
            {
              key: "Enter",
              run: () => {
                if (readOnly || !callbacks.current.onSave) return false;
                callbacks.current.onSave();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": label,
            "aria-multiline": "true",
            spellcheck: "true",
          }),
          placeholder(hint),
          decoration,
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const range = update.state.selection.main;
              const text = update.state.sliceDoc(range.from, range.to).trim();
              if (!text) {
                setSelected(null);
                return;
              }
              // Read coordinates after CodeMirror has completed the update.
              requestAnimationFrame(() => {
                if (
                  !host.current ||
                  view.current !== editor ||
                  !editor.state.selection.main.eq(range)
                )
                  return;
                const position = editor.coordsAtPos(range.from);
                const bounds = host.current.getBoundingClientRect();
                setSelected({
                  text,
                  left: Math.max(
                    0,
                    Math.min(
                      bounds.width - 80,
                      (position?.left ?? bounds.left) - bounds.left,
                    ),
                  ),
                  top: (position?.top ?? bounds.top) - bounds.top - 34,
                });
              });
            }
          }),
          EditorView.domEventHandlers({
            contextmenu: (event, editor) => {
              if (readOnly) return false;
              const range = editor.state.selection.main;
              const text = editor.state.sliceDoc(range.from, range.to).trim();
              if (!text) return false;
              event.preventDefault();
              event.stopPropagation();
              callbacks.current.onDefine(text);
              setSelected(null);
              return true;
            },
            click: (event, editor) => {
              if (!editor.state.selection.main.empty) return false;
              const id = (event.target as HTMLElement)
                .closest("[data-definition]")
                ?.getAttribute("data-definition");
              if (id) {
                callbacks.current.onDefinition(id);
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => {
      view.current = null;
      editor.destroy();
    };
    // The editor owns selection/history; live props are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({});
  }, [definitions]);

  return (
    <div className="definition-composer">
      <div ref={host} />
      {selected && !readOnly && (
        <button
          type="button"
          aria-label="Define"
          className="definition-selection-action"
          style={{ left: selected.left, top: selected.top }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onDefine(selected.text);
            setSelected(null);
          }}
        >
          Define
        </button>
      )}
    </div>
  );
}
