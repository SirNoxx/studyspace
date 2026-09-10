"use client";
import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment, Transaction } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
} from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { cpp } from "@codemirror/lang-cpp";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  MessageCircle,
  Copy,
  MoreHorizontal,
  Save,
  Globe,
  FolderInput,
  BookOpen,
  Trash2,
} from "lucide-react";
import type { StudyCodeBlock, BlockAction } from "@/lib/code-blocks";
import { Menu } from "./ui";
import { runStudyCode } from "@/lib/code-runner";
import { codePreview } from "@/lib/code-preview";

const languages = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  c: cpp,
  cpp,
  python,
  sql,
  html,
  css,
  json,
};
const languageLabels: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  c: "C",
  cpp: "C++",
  python: "Python",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  json: "JSON",
};
export default function CodeCell({
  block,
  onChange,
  onChat,
  onAction,
}: {
  block: StudyCodeBlock;
  onChange: (patch: Partial<StudyCodeBlock>) => void;
  onChat: (text: string) => void;
  onAction: (action: BlockAction) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  const callbacks = useRef({ onChange, onChat });
  callbacks.current = { onChange, onChat };
  const [selection, setSelection] = useState("");
  const [output, setOutput] = useState<string[]>([]),
    [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stdin, setStdin] = useState("");
  const [phase, setPhase] = useState("");
  const [preview, setPreview] = useState("");
  const stop = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      stop.current?.();
    },
    [],
  );
  useEffect(() => {
    if (!host.current || block.collapsed) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: block.code,
        extensions: [
          history(),
          lineNumbers(),
          drawSelection(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          language.current.of(
            (
              languages[block.language as keyof typeof languages] ?? javascript
            )(),
          ),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.contentAttributes.of({
            "aria-label": "Code editor",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.every((t) =>
                t.annotation(Transaction.remote),
              )
            )
              callbacks.current.onChange({ code: update.state.doc.toString() });
            if (update.selectionSet || update.docChanged) {
              const s = update.state.selection.main;
              setSelection(update.state.sliceDoc(s.from, s.to));
            }
          }),
          EditorView.theme({
            "&": { fontSize: "13px", background: "transparent" },
            ".cm-scroller": {
              fontFamily: "Consolas, ui-monospace, monospace",
              overflow: "auto",
              maxHeight: "360px",
            },
            ".cm-content": { padding: "12px 0", caretColor: "var(--text)" },
            ".cm-line": { padding: "0 12px" },
            ".cm-gutters": {
              background: "transparent",
              color: "var(--muted)",
              border: "none",
              display: "flex",
            },
            "&.cm-focused": { outline: "none" },
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [block.collapsed]);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== block.code)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: block.code },
        annotations: Transaction.remote.of(true),
      });
  }, [block.code]);
  useEffect(() => {
    view.current?.dispatch({
      effects: language.current.reconfigure(
        (languages[block.language as keyof typeof languages] ?? javascript)(),
      ),
    });
  }, [block.language]);
  const run = () => {
    const runId = ++generation.current;
    stop.current?.();
    setOutput([]);
    setPreview("");
    const code = view.current?.state.doc.toString() ?? block.code;
    if (block.language === "html" || block.language === "css") {
      setPreview(codePreview(code, block.language));
      setOutput([
        block.language === "html"
          ? "HTML preview updated."
          : "CSS applied to the sample page.",
      ]);
      setRunning(false);
      return;
    }
    setRunning(true);
    setPhase("Starting…");
    stop.current = runStudyCode(
      code,
      (text) => {
        if (generation.current === runId) setOutput((old) => [...old, text]);
      },
      () => {
        if (generation.current === runId) {
          setRunning(false);
          setOutput((old) => (old.length ? old : ["Finished with no output."]));
        }
      },
      {
        language: block.language,
        stdin,
        onPhase: (text) => {
          if (generation.current === runId) setPhase(text);
        },
      },
    );
  };
  return (
    <section
      className="study-code-cell"
      aria-label="Code block"
      onContextMenu={(event) => event.stopPropagation()}
    >
      <header>
        <div className="code-heading-row">
          <input
            className="code-block-title"
            aria-label="Code block title"
            placeholder="Untitled code block"
            maxLength={120}
            value={block.title ?? ""}
            onChange={(event) => onChange({ title: event.target.value })}
          />
          <Menu
            trigger={
              <button aria-label="Code block options">
                <MoreHorizontal size={18} />
              </button>
            }
            items={[
              { label: "Save", icon: Save, action: () => onAction("save") },
              {
                label: "Publish",
                icon: Globe,
                action: () => onAction("publish"),
              },
              {
                label: "Add to folder / file",
                icon: FolderInput,
                action: () => onAction("add"),
              },
              {
                label: "Study",
                icon: BookOpen,
                action: () => onAction("study"),
              },
              "separator",
              {
                label: "Delete code block",
                icon: Trash2,
                danger: true,
                action: () => onAction("delete"),
              },
            ]}
          />
        </div>
        <button
          type="button"
          aria-label={
            block.collapsed ? "Expand code block" : "Collapse code block"
          }
          aria-expanded={!block.collapsed}
          onClick={() => onChange({ collapsed: !block.collapsed })}
        >
          {block.collapsed ? (
            <ChevronRight size={15} />
          ) : (
            <ChevronDown size={15} />
          )}
        </button>
        <select
          aria-label="Code language"
          value={block.language}
          onChange={(e) => onChange({ language: e.target.value })}
        >
          {Object.keys(languages).map((value) => (
            <option key={value} value={value}>
              {languageLabels[value]}
            </option>
          ))}
        </select>
        <span className="code-cell-spacer" />
        <button
          type="button"
          title={
            selection ? "Add selected code to Chat" : "Add all code to Chat"
          }
          onClick={() => onChat(selection || block.code)}
        >
          <MessageCircle size={14} />
          Add to Chat
        </button>
        <button
          type="button"
          aria-label="Copy code"
          title={copied ? "Copied" : "Copy code"}
          onClick={async () => {
            await navigator.clipboard.writeText(block.code);
            setCopied(true);
          }}
        >
          <Copy size={14} />
        </button>
        {running && (
          <button
            type="button"
            onClick={() => {
              stop.current?.();
              setOutput((old) => [...old, "Stopped."]);
            }}
          >
            <Square size={14} />
            Stop
          </button>
        )}
        <button
          type="button"
          title={"Run " + (languageLabels[block.language] ?? block.language)}
          onClick={run}
        >
          <Play size={14} />
          Run
        </button>
      </header>
      {!block.collapsed && (
        <>
          <div className="code-cell-editor" ref={host} />
          <p className="code-cell-hint">
            {block.language === "html" || block.language === "css"
              ? "Local preview · Scripts and external resources are disabled."
              : block.language === "json"
                ? "Validate and format JSON."
                : block.language === "cpp"
                  ? "C++20 · 5-second execution limit · Standard library; exceptions and native OS APIs unavailable."
                  : block.language === "sql"
                    ? "SQLite · A fresh, temporary database for each run."
                    : "Runs locally · 5-second execution limit · Standard libraries; no external packages."}
          </p>
          {["javascript", "typescript", "python", "c", "cpp"].includes(
            block.language,
          ) && (
            <details className="code-cell-input">
              <summary>Program input (stdin)</summary>
              <textarea
                aria-label="Program input"
                placeholder="Enter input before running. JavaScript and TypeScript can read the stdin string."
                rows={3}
                maxLength={10000}
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
              />
            </details>
          )}
          <div className="code-cell-output">
            <small role="status">Output{running ? " · " + phase : ""}</small>
            <pre aria-label="Code output">
              {output.length
                ? output.join("\n")
                : "Run code to see output here."}
            </pre>
            {preview && (
              <iframe
                className="code-cell-preview"
                title="Code preview"
                sandbox=""
                referrerPolicy="no-referrer"
                srcDoc={preview}
              />
            )}
          </div>
        </>
      )}
      {block.collapsed && (
        <div className="code-cell-collapsed">
          {block.code.split("\n").length} lines · Code preserved
          {running ? " · Running…" : ""}
        </div>
      )}
    </section>
  );
}
