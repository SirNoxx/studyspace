"use client";
import { useEffect, useRef } from "react";
import { EditorState, Compartment, Transaction } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  Decoration,
  ViewPlugin,
  type DecorationSet,
} from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  syntaxTree,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
} from "@codemirror/autocomplete";
import { conceptMatches } from "@/lib/markdown";
import type { Definition } from "@/lib/model";
export interface EditorHandle {
  insert: (text: string) => void;
  wrap: (left: string, right: string) => void;
  selection: () => string;
  range: () => { from: number; to: number };
  focus: () => void;
}
export default function Editor({
  id,
  body,
  mode,
  onChange,
  onSelection,
  definitions,
  onDefinition,
  onAttach,
  handle,
  notes,
}: {
  id: string;
  body: string;
  mode: "source" | "live";
  onChange: (body: string) => void;
  onSelection: (text: string) => void;
  definitions: Definition[];
  onDefinition: (id: string) => void;
  onAttach: (files: File[]) => void;
  handle: React.MutableRefObject<EditorHandle | null>;
  notes: { id: string; title: string }[];
}) {
  const parent = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    states = useRef(new Map<string, EditorState>()),
    templateState = useRef<EditorState | null>(null),
    active = useRef(id);
  const callbacks = useRef({ onChange, onSelection, onDefinition, onAttach });
  callbacks.current = { onChange, onSelection, onDefinition, onAttach };
  const compartment = useRef(new Compartment());
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const extensions = () => {
    const visual = ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(v: EditorView) {
          this.decorations = this.build(v);
        }
        update(u: any) {
          if (u.docChanged || u.selectionSet || u.viewportChanged)
            this.decorations = this.build(u.view);
        }
        build(v: EditorView) {
          const marks: { from: number; to: number; value: Decoration }[] = [];
          if (modeRef.current === "live") {
            syntaxTree(v.state).iterate({
              from: v.viewport.from,
              to: v.viewport.to,
              enter(node) {
                if (/^ATXHeading[1-6]$/.test(node.name))
                  marks.push({
                    from: node.from,
                    to: node.to,
                    value: Decoration.mark({
                      class: "cm-heading cm-h" + node.name.at(-1),
                    }),
                  });
                if (node.name === "StrongEmphasis")
                  marks.push({
                    from: node.from,
                    to: node.to,
                    value: Decoration.mark({ class: "cm-strong" }),
                  });
                if (node.name === "Emphasis")
                  marks.push({
                    from: node.from,
                    to: node.to,
                    value: Decoration.mark({ class: "cm-emphasis" }),
                  });
                if (
                  ["HeaderMark", "EmphasisMark", "CodeMark"].includes(node.name)
                ) {
                  const line = v.state.doc.lineAt(node.from);
                  if (
                    !v.state.selection.ranges.some(
                      (r) => r.from <= line.to && r.to >= line.from,
                    )
                  )
                    marks.push({
                      from: node.from,
                      to: node.to,
                      value: Decoration.replace({}),
                    });
                }
              },
            });
          }
          const start = v.state.doc.lineAt(v.viewport.from).from,
            end = v.state.doc.lineAt(v.viewport.to).to;
          for (const m of conceptMatches(
            v.state.doc.sliceString(start, end),
            definitionsRef.current,
          ))
            marks.push({
              from: m.from + start,
              to: m.to + start,
              value: Decoration.mark({
                class: "cm-concept",
                attributes: {
                  "data-definition": m.entry.id,
                  title: m.entry.definition,
                },
              }),
            });
          return Decoration.set(
            marks.map((m) => m.value.range(m.from, m.to)),
            true,
          );
        }
      },
      { decorations: (v) => v.decorations },
    );
    return [visual];
  };
  useEffect(() => {
    if (!parent.current) return;
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: body,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          bracketMatching(),
          closeBrackets(),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(defaultHighlightStyle),
          autocompletion({
            override: [
              (ctx) => {
                const word = ctx.matchBefore(/\[\[[^\]]*/);
                return word
                  ? {
                      from: word.from + 2,
                      options: notesRef.current.map((n) => ({
                        label: n.title,
                        type: "text",
                        apply: n.title + "]]",
                      })),
                    }
                  : null;
              },
            ],
          }),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
            {
              key: "Mod-b",
              run: () => {
                handle.current?.wrap("**", "**");
                return true;
              },
            },
            {
              key: "Mod-i",
              run: () => {
                handle.current?.wrap("*", "*");
                return true;
              },
            },
            {
              key: "Mod-k",
              run: () => {
                handle.current?.wrap("[", "](https://)");
                return true;
              },
            },
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "Markdown editor",
            spellcheck: "true",
          }),
          compartment.current.of(extensions()),
          EditorView.updateListener.of((u) => {
            if (u.docChanged)
              callbacks.current.onChange(u.state.doc.toString());
            if (u.selectionSet) {
              const s = u.state.selection.main;
              callbacks.current.onSelection(u.state.sliceDoc(s.from, s.to));
            }
          }),
          EditorView.domEventHandlers({
            click: (e) => {
              const id = (e.target as HTMLElement)
                .closest("[data-definition]")
                ?.getAttribute("data-definition");
              if (id) callbacks.current.onDefinition(id);
            },
            paste: (e) => {
              const files = Array.from(e.clipboardData?.files ?? []);
              if (files.length) {
                e.preventDefault();
                callbacks.current.onAttach(files);
                return true;
              }
              return false;
            },
            drop: (e) => {
              const files = Array.from(e.dataTransfer?.files ?? []);
              if (files.length) {
                e.preventDefault();
                callbacks.current.onAttach(files);
                return true;
              }
              return false;
            },
          }),
          EditorView.theme({
            "&": { height: "100%", background: "transparent" },
            ".cm-scroller": {
              fontFamily: "inherit",
              lineHeight: "inherit",
              overflow: "visible",
            },
            ".cm-content": {
              padding: "0 0 140px",
              caretColor: "var(--accent)",
            },
            ".cm-line": { padding: "0" },
            ".cm-gutters": { display: "none" },
            ".cm-activeLine": { background: "transparent" },
            "&.cm-focused": { outline: "none" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              background: "var(--selection)",
            },
            ".cm-panels": { background: "var(--panel)", color: "var(--text)" },
            ".cm-tooltip": {
              background: "var(--panel)",
              border: "1px solid var(--border)",
            },
          }),
        ],
      }),
    });
    view.current = editor;
    templateState.current = editor.state;
    handle.current = {
      range: () => ({
        from: editor.state.selection.main.from,
        to: editor.state.selection.main.to,
      }),
      insert: (text) => {
        const s = editor.state.selection.main;
        editor.dispatch({
          changes: { from: s.from, to: s.to, insert: text },
          selection: { anchor: s.from + text.length },
        });
        editor.focus();
      },
      wrap: (left, right) => {
        const s = editor.state.selection.main;
        const text = editor.state.sliceDoc(s.from, s.to);
        editor.dispatch({
          changes: { from: s.from, to: s.to, insert: left + text + right },
          selection: {
            anchor: s.from + left.length,
            head: s.from + left.length + text.length,
          },
        });
        editor.focus();
      },
      selection: () => {
        const s = editor.state.selection.main;
        return editor.state.sliceDoc(s.from, s.to);
      },
      focus: () => editor.focus(),
    };
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (active.current !== id) {
      states.current.set(active.current, v.state);
      active.current = id;
      const cached = states.current.get(id);
      if (cached && cached.doc.toString() === body) v.setState(cached);
      else {
        const template = templateState.current!;
        v.setState(
          template.update({
            changes: { from: 0, to: template.doc.length, insert: body },
            selection: { anchor: 0 },
            annotations: Transaction.addToHistory.of(false),
          }).state,
        );
      }
      v.dispatch({ effects: compartment.current.reconfigure(extensions()) });
    } else if (v.state.doc.toString() !== body) {
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: body },
      });
    }
  }, [id, body]);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartment.current.reconfigure(extensions()),
    });
  }, [mode, definitions]);
  return <div className={"editor-host mode-" + mode} ref={parent} />;
}
