"use client";
import { useRef, useState } from "react";
import {
  Sparkles,
  AlignLeft,
  TextSearch,
  HelpCircle,
  Route,
  MessageCircle,
  Send,
  Square,
  History,
  Plus,
} from "lucide-react";
import type { AppContext } from "../WorkspaceApp";
import { uid, now } from "@/lib/model";
import Markdown from "../Markdown";
import QuizSession from "./QuizSession";
import { parseQuiz } from "@/lib/quiz";
import type { AIRecord } from "@/lib/model";
const actions = [
  {
    id: "summarize",
    label: "Summarize",
    description: "Bring the key ideas together",
    icon: AlignLeft,
  },
  {
    id: "rewrite",
    label: "Explain in more detail",
    description: "Build a fuller explanation",
    icon: TextSearch,
  },
  {
    id: "quiz",
    label: "Test me",
    description: "Find out what has stayed with you",
    icon: HelpCircle,
  },
  {
    id: "next",
    label: "What should I learn next?",
    description: "Explore the next useful connection",
    icon: Route,
  },
  {
    id: "clarify",
    label: "Clarify a passage",
    description: "Work through it, step by step",
    icon: MessageCircle,
  },
];
export default function AIStudy({ ctx }: { ctx: AppContext }) {
  const [action, setAction] = useState("summarize"),
    [scope, setScope] = useState("note"),
    [question, setQuestion] = useState(""),
    [output, setOutput] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState(false),
    [recordId, setRecordId] = useState(""),
    [quizAnswer, setQuizAnswer] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const run = async () => {
    if (!ctx.active) {
      setStatus("Open a note to choose your study context.");
      return;
    }
    if (!ctx.w.settings.aiConsent) {
      setStatus("Enable the selected-context consent below before continuing.");
      return;
    }
    setBusy(true);
    setComplete(false);
    setOutput("");
    setStatus("");
    setQuizAnswer(false);
    revision.current = ctx.active.revision;
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          noteId: ctx.active.id,
          scope,
          selection: ctx.selection,
          question,
          expectedRevision: ctx.active.revision,
          explicitSensitive:
            ctx.active.kind === "journal" || ctx.active.kind === "dream",
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let text = "",
        buffer = "",
        completed = false,
        evidence: AIRecord["evidence"] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          text = event.text;
          setOutput(text);
          if (event.type === "complete") {
            completed = true;
            evidence = event.evidence;
          }
        }
      }
      if (!completed)
        throw new Error(
          "The response was interrupted. Partial output cannot be applied.",
        );
      const id = uid();
      ctx.mutate((w) =>
        w.ai.push({
          id,
          noteId: ctx.active!.id,
          revision: revision.current,
          action,
          output: text,
          createdAt: now(),
          selection: scope === "selection" ? ctx.selection : undefined,
          quiz: action === "quiz" ? parseQuiz(text) : undefined,
          evidence,
        }),
      );
      setRecordId(id);
      setComplete(true);
      setStatus("Complete · review the response before applying it.");
    } catch (error) {
      setStatus(
        (error as Error).name === "AbortError"
          ? "Cancelled. Partial text was not applied."
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="inspector-section-title">
        <h2>
          <Sparkles size={17} /> Study guide
        </h2>
      </div>
      <p className="panel-description">
        A thoughtful companion to your own thinking.
      </p>
      <label className="field">
        <span>Use only</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="selection" disabled={!ctx.selection}>
            Selected passage
          </option>
          <option value="note">Current note</option>
          <option value="subject">Current subject · journals excluded</option>
        </select>
      </label>
      <div className="ai-context">
        <span className="tiny-dot" />
        {ctx.active?.title ?? "No note selected"}
        {scope === "selection" && (
          <small>{ctx.selection.length} selected characters</small>
        )}
      </div>
      <div className="ai-actions">
        {actions.map((a) => (
          <button
            key={a.id}
            className={action === a.id ? "selected" : ""}
            onClick={() => setAction(a.id)}
          >
            <a.icon size={17} />
            <span>
              <strong>{a.label}</strong>
              <small>{a.description}</small>
            </span>
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        aria-label="Study guide instructions"
        placeholder="A question, a little context, or a preferred level of detail…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={ctx.w.settings.aiConsent}
          onChange={(e) =>
            ctx.mutate((w) => {
              w.settings.aiConsent = e.target.checked;
            })
          }
        />
        <span>
          Allow sending this selected context to the configured AI provider.
        </span>
      </label>
      <button
        className="primary full"
        disabled={busy || !ctx.active}
        onClick={() => void run()}
      >
        <Sparkles size={15} /> {busy ? "Thinking…" : "Start studying"}
      </button>
      {busy && (
        <button
          className="secondary full"
          onClick={() => abort.current?.abort()}
        >
          <Square size={13} /> Cancel
        </button>
      )}
      <p className="form-status" role="status">
        {status}
      </p>
      {ctx.demo && (
        <p className="quiet-callout">
          AI requires a signed-in workspace and server provider configuration.
          Demo content is never sent automatically.
        </p>
      )}
      {output && (
        <div className="ai-response">
          {action === "quiz" ? (
            complete ? (
              <QuizSession key={recordId} ctx={ctx} recordId={recordId} />
            ) : (
              <p>Preparing your questions…</p>
            )
          ) : (
            <Markdown
              body={output}
              onAIReference={(id) =>
                ctx.setDialog({
                  type: "ai-evidence",
                  id: recordId,
                  reference: id,
                })
              }
            />
          )}
          {!busy && complete && (
            <div className="stack-actions">
              <button
                className="secondary"
                onClick={() =>
                  ctx.setDialog({
                    type: "ai-preview",
                    id: recordId,
                    output,
                    revision: revision.current,
                    noteId: ctx.w.ai.find((r) => r.id === recordId)?.noteId,
                    selection: ctx.w.ai.find((r) => r.id === recordId)
                      ?.selection,
                  })
                }
              >
                Review & save response
              </button>
              <button
                className="text-button"
                onClick={() =>
                  ctx.setDialog({
                    type: "review-card",
                    value: question || "Recall the main idea",
                    answer: output,
                  })
                }
              >
                Create an editable review card
              </button>
            </div>
          )}
        </div>
      )}
      <div className="panel-divider" />
      <h3>Previous sessions</h3>
      {ctx.w.ai
        .filter((r) => r.noteId === ctx.active?.id)
        .slice(-8)
        .reverse()
        .map((r) => (
          <div className="history-row" key={r.id}>
            <button
              onClick={() => {
                setOutput(r.output);
                setComplete(true);
                setAction(r.action);
                setRecordId(r.id);
                revision.current = r.revision;
              }}
            >
              <History size={13} />
              {r.action} · {new Date(r.createdAt).toLocaleDateString()}
            </button>
            <button
              aria-label="Delete AI session"
              onClick={() =>
                ctx.mutate((w) => {
                  w.ai = w.ai.filter((x) => x.id !== r.id);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
    </>
  );
}
