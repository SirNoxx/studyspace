"use client";
import { useEffect, useRef, useState } from "react";
import { codeBlockExtension } from "./EditorCodeBlocks";
import {
  newCodeBlock,
  type BlockAction,
  type StudyCodeBlock,
} from "@/lib/code-blocks";
import { newWhiteboard } from "@/lib/whiteboard";
import ModuleGallery from "./ModuleGallery";
import { EditorState, Compartment, Transaction } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  placeholder,
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
  HighlightStyle,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
} from "@codemirror/autocomplete";
import { conceptMatches } from "@/lib/markdown";
import type { Definition, Attachment } from "@/lib/model";
import { findAttachment } from "@/lib/attachments";
import { EditorImage } from "./EditorImage";
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
  attachments,
  demo,
  onChat,
  onYoutubePaste,
  onBlockAction,
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
  attachments: Attachment[];
  demo: boolean;
  onChat?: (text: string) => void;
  onYoutubePaste?: (url: string) => void;
  onBlockAction?: (action: BlockAction, block: StudyCodeBlock) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [modules, setModules] = useState(false);
  const parent = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    states = useRef(new Map<string, EditorState>()),
    templateState = useRef<EditorState | null>(null),
    active = useRef(id);
  const callbacks = useRef({
    onChange,
    onSelection,
    onDefinition,
    onAttach,
    onChat,
    onYoutubePaste,
    onBlockAction,
  });
  callbacks.current = {
    onChange,
    onSelection,
    onDefinition,
    onAttach,
    onChat,
    onYoutubePaste,
    onBlockAction,
  };
  const compartment = useRef(new Compartment());
  const embeddedBlocks = useRef<ReturnType<typeof codeBlockExtension> | null>(
    null,
  );
  if (!embeddedBlocks.current)
    embeddedBlocks.current = codeBlockExtension(
      (text) => callbacks.current.onChat?.(text),
      (action, block) => callbacks.current.onBlockAction?.(action, block),
    );
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
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
                if (node.name === "Image") {
                  const source = v.state.sliceDoc(node.from, node.to);
                  const target = /\]\((attachment:[^)]+)\)$/.exec(source)?.[1];
                  const asset =
                    target && findAttachment(attachmentsRef.current, target);
                  if (
                    asset &&
                    /^image\/(png|jpeg|webp|gif)$/.test(asset.mime)
                  ) {
                    marks.push({
                      from: node.from,
                      to: node.to,
                      value: Decoration.replace({
                        widget: new EditorImage(asset, demo),
                      }),
                    });
                    return false;
                  }
                }
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
    return [
      visual,
      ...(modeRef.current === "live" ? [embeddedBlocks.current!] : []),
    ];
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
          placeholder("Type here..."),
          highlightActiveLine(),
          highlightSelectionMatches(),
          bracketMatching(),
          closeBrackets(),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(defaultHighlightStyle),
          syntaxHighlighting(
            HighlightStyle.define([
              {
                tag: [tags.link, tags.url],
                color: "var(--note-link)",
                textDecoration: "underline",
              },
            ]),
          ),
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
              const text = e.clipboardData?.getData("text/plain").trim();
              if (text) callbacks.current.onYoutubePaste?.(text);
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
              caretColor: "var(--typing-caret)",
            },
            ".cm-cursor, .cm-dropCursor": {
              borderLeftColor: "var(--typing-caret)",
            },
            ".cm-placeholder": {
              color: "var(--placeholder)",
              fontStyle: "normal",
            },
            ".cm-line": { padding: "0" },
            ".cm-gutters": { display: "none" },
            ".cm-activeLine": { background: "transparent" },
            "&.cm-focused": { outline: "none" },
            "& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
              {
                background:
                  "color-mix(in srgb, var(--selection) 45%, transparent)",
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
          scrollIntoView: true,
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
      handle.current = null;
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
      // Preserve embedded editors and their focus when another pane or a save
      // refresh changes only part of the note. Replacing the entire document
      // unnecessarily removes every embedded widget from the view.
      const previous = v.state.doc.toString();
      let from = 0;
      while (
        from < previous.length &&
        from < body.length &&
        previous[from] === body[from]
      )
        from++;
      let oldEnd = previous.length,
        newEnd = body.length;
      while (
        oldEnd > from &&
        newEnd > from &&
        previous[oldEnd - 1] === body[newEnd - 1]
      ) {
        oldEnd--;
        newEnd--;
      }
      v.dispatch({
        changes: { from, to: oldEnd, insert: body.slice(from, newEnd) },
        annotations: Transaction.remote.of(true),
      });
    }
  }, [id, body]);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartment.current.reconfigure(extensions()),
    });
  }, [mode, definitions, attachments]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
    };
  }, [menu]);
  return (
    <>
      <div
        className={"editor-host mode-" + mode}
        ref={parent}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest(".code-cell-widget"))
            return;
          event.preventDefault();
          const position = view.current?.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          if (position != null)
            view.current?.dispatch({ selection: { anchor: position } });
          setMenu({
            x: Math.min(event.clientX, innerWidth - 200),
            y: Math.max(8, Math.min(event.clientY, innerHeight - 130)),
          });
        }}
      />
      {menu && (
        <div
          className="note-insert-menu"
          role="menu"
          aria-label="Insert into note"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setModules(true);
            }}
          >
            Add a module
          </button>
          <button
            role="menuitem"
            onClick={() => {
              handle.current?.insert(newCodeBlock());
              setMenu(null);
            }}
          >
            Add code block
          </button>
          <button
            role="menuitem"
            onClick={() => {
              handle.current?.insert(newWhiteboard());
              setMenu(null);
            }}
          >
            Add whiteboard
          </button>
        </div>
      )}
      {modules && (
        <ModuleGallery
          onInsert={(text) => handle.current?.insert(text)}
          onClose={() => setModules(false)}
        />
      )}
    </>
  );
}
