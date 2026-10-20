"use client";
import { useEffect, useRef, useState } from "react";
import {
  yCollab,
  yUndoManagerKeymap,
  ySyncAnnotation,
} from "y-codemirror.next";
import type { Text as SharedText } from "yjs";
import { codeBlockExtension } from "./EditorCodeBlocks";
import {
  newCodeBlock,
  type BlockAction,
  type StudyCodeBlock,
} from "@/lib/code-blocks";
import { newWhiteboard } from "@/lib/whiteboard";
import ModuleGallery from "./ModuleGallery";
import PastedLink from "./PastedLink";
import { newModule } from "@/lib/modules";
import { studyCodeBlocks } from "@/lib/code-blocks";
import { wordAtPosition } from "@/lib/spelling";
import SpellingSuggestions from "./SpellingSuggestions";
import { spellingExtension, grammarAtPosition } from "./EditorSpelling";
import { EditorState, Compartment, Transaction, type StateEffect } from "@codemirror/state";
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
  ensureSyntaxTree,
  HighlightStyle,
  foldedRanges,
  unfoldEffect,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
} from "@codemirror/autocomplete";
import { conceptMatches, definitionLinks } from "@/lib/markdown";
import type { Definition, Attachment } from "@/lib/model";
import { findAttachment } from "@/lib/attachments";
import { EditorImage, imageDropHandlers } from "./EditorImage";
import { taskListExtension, insertTaskShortcut } from "./EditorTasks";
import { headingFoldExtension } from "./EditorHeadingFolds";
import type { AttachmentPlacement } from "@/lib/attachment-placement";
import { formatClipboard } from "@/lib/clipboard-formatting";
export interface EditorHandle {
  insert: (text: string) => void;
  wrap: (left: string, right: string) => void;
  selection: () => string;
  range: () => { from: number; to: number };
  focus: () => void;
  revealRange: (noteId: string, from: number, to: number, expected: string) => boolean;
  replaceRange?: (
    from: number,
    to: number,
    expected: string,
    text: string,
  ) => boolean;
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
  sharedText,
  readOnly = false,
}: {
  sharedText?: SharedText;
  readOnly?: boolean;
  id: string;
  body: string;
  mode: "source" | "live";
  onChange: (body: string) => void;
  onSelection: (text: string) => void;
  definitions: Definition[];
  onDefinition: (id: string) => void;
  onAttach: (files: File[], placement?: AttachmentPlacement) => void;
  handle: React.MutableRefObject<EditorHandle | null>;
  notes: { id: string; title: string; originalPath?:string }[];
  attachments: Attachment[];
  demo: boolean;
  onChat?: (text: string) => void;
  onYoutubePaste?: (url: string) => void;
  onBlockAction?: (action: BlockAction, block: StudyCodeBlock) => void;
}) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    word?: {
      from: number;
      to: number;
      word: string;
      grammar?: { suggestions: string[]; reason: string };
      noteId: string;
      body: string;
    };
  } | null>(null);
  const [modules, setModules] = useState(false);
  const [pastedLink, setPastedLink] = useState<{
    url: string;
    id: string;
    body: string;
    from: number;
    to: number;
  } | null>(null);
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
  useEffect(() => {
    const insert = (event: Event) => {
      const point = (event as CustomEvent<{ x: number; y: number }>).detail;
      const rect = parent.current?.getBoundingClientRect();
      if (
        !rect ||
        !point ||
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < rect.top ||
        point.y > rect.bottom
      )
        return;
      const pos = view.current?.posAtCoords(point);
      if (pos != null) view.current?.dispatch({ selection: { anchor: pos } });
      setModules(true);
    };
    window.addEventListener("studyspace:add-module", insert);
    return () => window.removeEventListener("studyspace:add-module", insert);
  }, []);
  const embeddedBlocks = useRef<ReturnType<typeof codeBlockExtension> | null>(
    null,
  );
  if (!embeddedBlocks.current)
    embeddedBlocks.current = codeBlockExtension(
      (text) => callbacks.current.onChat?.(text),
      (action, block) => callbacks.current.onBlockAction?.(action, block),
      () => ({attachments:attachmentsRef.current,demo,fromPath:notesRef.current.find(n=>n.id===active.current)?.originalPath,
        onImport:(file,blockId)=>{
          const editor=view.current;
          if(!editor || editor.state.readOnly)return;
          const block=studyCodeBlocks(editor.state.doc.toString()).find(b=>b.id===blockId);
          if(block)callbacks.current.onAttach([file],{body:editor.state.doc.toString(),position:block.from,replaceBlockId:block.id});
        }}),
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
                        widget: new EditorImage(
                          asset,
                          demo,
                          v.state.selection.main.from === node.from &&
                            v.state.selection.main.to === node.to,
                        ),
                      }),
                    });
                    return false;
                  }
                }
                if (/^(?:ATX|Setext)Heading[1-6]$/.test(node.name))
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
          for (const link of definitionLinks(v.state.doc.toString())) {
            if (link.to < start || link.from > end) continue;
            const entry = definitionsRef.current.find(
              (d) => d.id === link.id && !d.trashed,
            );
            marks.push({
              from: link.labelFrom,
              to: link.labelTo,
              value: Decoration.mark({
                class: "cm-concept",
                attributes: entry
                  ? { "data-definition": entry.id, title: entry.definition }
                  : { title: "Definition unavailable" },
              }),
            });
            const line = v.state.doc.lineAt(link.from);
            if (
              modeRef.current === "live" &&
              !v.state.selection.ranges.some(
                (r) =>
                  r.from <= v.state.doc.lineAt(link.to).to && r.to >= line.from,
              )
            ) {
              marks.push({
                from: link.from,
                to: link.labelFrom,
                value: Decoration.replace({}),
              });
              marks.push({
                from: link.labelTo,
                to: link.to,
                value: Decoration.replace({}),
              });
            }
          }
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
      headingFoldExtension,
      ...(modeRef.current === "live"
        ? [embeddedBlocks.current!, taskListExtension]
        : []),
    ];
  };
  useEffect(() => {
    if (!parent.current) return;
    const editor = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: body,
        extensions: [
          ...(sharedText
            ? [yCollab(sharedText, null), keymap.of(yUndoManagerKeymap)]
            : [history()]),
          EditorView.editable.of(!readOnly),
          spellingExtension,
          drawSelection(),
          placeholder("Type here..."),
          highlightActiveLine(),
          highlightSelectionMatches(),
          bracketMatching(),
          closeBrackets(),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(
            HighlightStyle.define(
              defaultHighlightStyle.specs.map((spec) =>
                spec.tag === tags.heading
                  ? { ...spec, textDecoration: "none", fontWeight: "700" }
                  : spec,
              ),
            ),
          ),
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
            { key: "Space", run: insertTaskShortcut },
            {
              key: "Enter",
              run: (editor) => {
                if (
                  modeRef.current !== "live" ||
                  !editor.state.selection.main.empty
                )
                  return false;
                const cursor = editor.state.selection.main.head,
                  line = editor.state.doc.lineAt(cursor);
                const match = /^\s*(def|uses):\s*$/.exec(line.text);
                if (!match || cursor !== line.to) return false;
                const parsed = ensureSyntaxTree(editor.state, cursor, 50);
                if (!parsed) return false;
                for (
                  let node: ReturnType<
                    ReturnType<typeof syntaxTree>["resolveInner"]
                  > | null = parsed.resolveInner(cursor, -1);
                  node;
                  node = node.parent
                )
                  if (
                    ["FencedCode", "CodeBlock", "CodeText"].includes(node.name)
                  )
                    return false;
                const text = newModule(
                    match[1] === "def" ? "definition" : "uses",
                  ),
                  block = studyCodeBlocks(text)[0];
                editor.dispatch({
                  changes: { from: line.from, to: line.to, insert: text },
                  selection: { anchor: line.from + text.length },
                  scrollIntoView: true,
                });
                let attempts = 0;
                const focus = () => {
                  const field = editor.dom.querySelector<
                    HTMLInputElement | HTMLTextAreaElement
                  >(
                    `[data-block-id="${block.id}"] ${match[1] === "def" ? 'input[aria-label="Term to define"]' : 'textarea[aria-label="Use cases"]'}`,
                  );
                  if (field) field.focus();
                  else if (attempts++ < 12) requestAnimationFrame(focus);
                };
                requestAnimationFrame(focus);
                return true;
              },
            },
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
            spellcheck: "false",
          }),
          compartment.current.of(extensions()),
          EditorView.updateListener.of((u) => {
            if (
              u.docChanged &&
              (!sharedText ||
                !u.transactions.some((t) => t.annotation(ySyncAnnotation)))
            )
              callbacks.current.onChange(u.state.doc.toString());
            if (u.selectionSet) {
              const s = u.state.selection.main;
              callbacks.current.onSelection(u.state.sliceDoc(s.from, s.to));
            }
          }),
          imageDropHandlers,
          EditorView.domEventHandlers({
            click: (e) => {
              const id = (e.target as HTMLElement)
                .closest("[data-definition]")
                ?.getAttribute("data-definition");
              if (id) callbacks.current.onDefinition(id);
            },
            paste: (e, editor) => {
              if (editor.state.readOnly) return false;
              const files = Array.from(e.clipboardData?.files ?? []);
              if (files.length) {
                e.preventDefault();
                callbacks.current.onAttach(files, {
                  body: editor.state.doc.toString(),
                  position: editor.state.selection.main.head,
                });
                return true;
              }
              const text = e.clipboardData?.getData("text/plain").trim();
              if (
                text &&
                /^https?:\/\/\S+$/i.test(text) &&
                text.length <= 2048
              ) {
                try {
                  const url = new URL(text);
                  if (
                    !["https:", "http:"].includes(url.protocol) ||
                    url.username ||
                    url.password
                  )
                    return false;
                  e.preventDefault();
                  const range = editor.state.selection.main;
                  setPastedLink({
                    url: url.href,
                    id: active.current,
                    body: editor.state.doc.toString(),
                    from: range.from,
                    to: range.to,
                  });
                  return true;
                } catch {
                  return false;
                }
              }
              const plain = e.clipboardData?.getData("text/plain") ?? "";
              const html = e.clipboardData?.getData("text/html") ?? "";
              const range = editor.state.selection.main;
              const tree = ensureSyntaxTree(editor.state, range.to, 50);
              if (!tree) return false;
              for (
                let node = tree.resolveInner(range.from, -1);
                node;
                node = node.parent!
              ) {
                if (
                  [
                    "FencedCode",
                    "CodeBlock",
                    "CodeText",
                    "InlineCode",
                  ].includes(node.name)
                )
                  return false;
              }
              try {
                let formatted = formatClipboard(plain, html);
                if (!formatted || formatted === plain) return false;
                // A pasted block must not join the middle of an existing paragraph.
                if (/\n|^#{1,6} /.test(formatted)) {
                  if (
                    editor.state
                      .sliceDoc(
                        editor.state.doc.lineAt(range.from).from,
                        range.from,
                      )
                      .trim()
                  )
                    formatted = "\n\n" + formatted;
                  if (
                    editor.state
                      .sliceDoc(range.to, editor.state.doc.lineAt(range.to).to)
                      .trim()
                  )
                    formatted += "\n\n";
                }
                e.preventDefault();
                editor.dispatch({
                  changes: {
                    from: range.from,
                    to: range.to,
                    insert: formatted,
                  },
                  selection: { anchor: range.from + formatted.length },
                  userEvent: "input.paste",
                  scrollIntoView: true,
                });
                return true;
              } catch {
                // Malformed clipboard data still pastes through the editor as plain text.
                return false;
              }
            },
            drop: (e, editor) => {
              const files = Array.from(e.dataTransfer?.files ?? []);
              if (files.length) {
                e.preventDefault();
                callbacks.current.onAttach(files, {
                  body: editor.state.doc.toString(),
                  position:
                    editor.posAtCoords({ x: e.clientX, y: e.clientY }) ??
                    editor.state.selection.main.head,
                });
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
      revealRange: (noteId, from, to, expected) => {
        if (active.current !== noteId || from < 0 || to > editor.state.doc.length || from >= to || editor.state.sliceDoc(from, to) !== expected) return false;
        const effects: StateEffect<unknown>[] = [EditorView.scrollIntoView(from, { y: "center" })];
        foldedRanges(editor.state).between(from, to, (start, end) => {
          effects.push(unfoldEffect.of({ from: start, to: end }));
        });
        editor.dispatch({ selection: { anchor: from, head: to }, effects });
        editor.focus();
        return true;
      },
      replaceRange: (from, to, expected, text) => {
        if (
          readOnly ||
          from < 0 ||
          to > editor.state.doc.length ||
          from > to ||
          editor.state.sliceDoc(from, to) !== expected
        )
          return false;
        editor.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          userEvent: "input.definition",
        });
        editor.focus();
        return true;
      },
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
    } else if (!sharedText && v.state.doc.toString() !== body) {
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
      {pastedLink && (
        <PastedLink
          url={pastedLink.url}
          onClose={() => setPastedLink(null)}
          onInsert={(text) => {
            const v = view.current;
            if (
              !v ||
              active.current !== pastedLink.id ||
              v.state.doc.toString() !== pastedLink.body
            )
              throw Error(
                "The note changed while this dialog was open. Close it and paste the link again.",
              );
            v.dispatch({
              changes: {
                from: pastedLink.from,
                to: pastedLink.to,
                insert: text,
              },
              selection: { anchor: pastedLink.from + text.length },
            });
            callbacks.current.onYoutubePaste?.(pastedLink.url);
            setPastedLink(null);
            requestAnimationFrame(() => v.focus());
          }}
        />
      )}
      <div
        className={"editor-host mode-" + mode}
        data-note-id={id}
        ref={parent}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest(".code-cell-widget"))
            return;
          const position = view.current?.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          const state = view.current?.state;
          const line =
            position != null && state ? state.doc.lineAt(position) : null;
          const grammar =
            state && position != null
              ? grammarAtPosition(state, position)
              : undefined;
          const word =
            line && position != null
              ? wordAtPosition(line.text, position - line.from)
              : null;
          const node =
            state && position != null
              ? ensureSyntaxTree(state, position, 50)?.resolveInner(
                  position,
                  -1,
                )
              : null;
          let inCode = !node;
          for (let current = node; current; current = current.parent)
            if (
              ["FencedCode", "CodeBlock", "CodeText", "InlineCode"].includes(
                current.name,
              )
            )
              inCode = true;
          event.preventDefault();
          if (position != null)
            view.current?.dispatch({ selection: { anchor: position } });
          setMenu({
            x: Math.max(8, Math.min(event.clientX, innerWidth - 240)),
            y: Math.max(
              8,
              Math.min(
                event.clientY,
                innerHeight - (word && !inCode ? 360 : 130),
              ),
            ),
            ...(word && line && state && !inCode
              ? {
                  word: {
                    ...word,
                    from: line.from + word.from,
                    to: line.from + word.to,
                    ...(grammar
                      ? {
                          from: grammar.from,
                          to: grammar.to,
                          word: grammar.word,
                          grammar,
                        }
                      : {}),
                    noteId: active.current,
                    body: state.doc.toString(),
                  },
                }
              : {}),
          });
        }}
      />
      {menu && (
        <div
          className="note-insert-menu"
          role="menu"
          aria-label={
            menu.word ? "Note spelling and options" : "Insert into note"
          }
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              buttons[
                (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                  buttons.length
              ]?.focus();
            }
          }}
          ref={(element) => {
            if (element && !element.contains(document.activeElement))
              element
                .querySelector<HTMLButtonElement>("button")
                ?.focus({ preventScroll: true });
          }}
        >
          {menu.word && (
            <SpellingSuggestions
              word={menu.word.word}
              onAccept={() => {
                setMenu(null);
                view.current?.focus();
              }}
              grammar={menu.word.grammar}
              onReplace={(replacement) => {
                const editor = view.current,
                  target = menu.word!;
                setMenu(null);
                if (
                  !editor ||
                  active.current !== target.noteId ||
                  editor.state.doc.toString() !== target.body
                )
                  return;
                editor.dispatch({
                  changes: {
                    from: target.from,
                    to: target.to,
                    insert: replacement,
                  },
                  selection: { anchor: target.from + replacement.length },
                  userEvent: "input.spelling",
                });
                editor.focus();
              }}
            />
          )}
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setModules(true);
            }}
          >
            Add a module
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
