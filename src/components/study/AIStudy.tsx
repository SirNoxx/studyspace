"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Send,
  Square,
  SlidersHorizontal,
  MessageCircle,
} from "lucide-react";
import type { AppContext } from "../WorkspaceApp";
import { uid, now, type AIRecord } from "@/lib/model";
import Markdown from "../Markdown";
import QuizSession from "./QuizSession";
import { parseQuiz } from "@/lib/quiz";
import { actions } from "./chat-actions";

type Scope = "selection" | "note" | "subject";
export default function AIStudy({ ctx }: { ctx: AppContext }) {
  const [chatId, setChatId] = useState(
    () => ctx.w.ai.at(-1)?.chatId ?? ctx.w.ai.at(-1)?.id ?? uid(),
  );
  const [action, setAction] = useState("clarify"),
    [scope, setScope] = useState<Scope>("note");
  const [style, setStyle] = useState("balanced"),
    [question, setQuestion] = useState("");
  const [options, setOptions] = useState(false),
    [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      question: string;
      output: string;
    } | null>(null);
  const abort = useRef<AbortController | null>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const records = ctx.w.ai.filter((r) => (r.chatId ?? r.id) === chatId);
  const chats = [
    ...new Map(ctx.w.ai.map((r) => [r.chatId ?? r.id, r])).entries(),
  ].reverse();
  const started = records.length > 0 || !!question || !!pending;
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [records.length, pending?.output]);
  const run = async () => {
    const note = ctx.active;
    if (busy || !question.trim()) return;
    if (!note) {
      setStatus("Open a note to choose your chat context.");
      return;
    }
    if (!ctx.w.settings.aiConsent) {
      setOptions(true);
      setStatus("Enable selected-context sharing in Chat options.");
      return;
    }
    if (scope === "selection" && !ctx.selection) {
      setStatus("Select a passage or choose Current note in Chat options.");
      return;
    }
    const prompt = question.trim(),
      selection = ctx.selection,
      revision = note.revision;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setOptions(false);
    setStatus("");
    setQuestion("");
    setPending({ question: prompt, output: "" });
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          noteId: note.id,
          scope,
          selection,
          question: prompt,
          responseStyle: style,
          expectedRevision: revision,
          explicitSensitive: note.kind === "journal" || note.kind === "dream",
          history: records
            .filter(
              (r) =>
                r.noteId === note.id &&
                r.scope === scope &&
                (scope !== "selection" || r.selection === selection),
            )
            .slice(-4)
            .map((r) => ({
              question: (r.question ?? r.action).slice(0, 4000),
              answer: r.output.slice(0, 6000),
            })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error((await response.json()).error);
      if (!response.body)
        throw new Error("The response was empty. Please retry.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        output = "",
        complete = false,
        evidence: AIRecord["evidence"] = [];
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "error")
          throw new Error(
            event.error ?? "The response was interrupted. Please retry.",
          );
        output = event.text ?? output;
        if (event.type === "complete") {
          complete = true;
          evidence = event.evidence;
        }
        setPending({
          question: prompt,
          output: action === "quiz" ? "Preparing your questions…" : output,
        });
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(consume);
      }
      consume(buffer + decoder.decode());
      if (!complete)
        throw new Error(
          "The response was interrupted. Retry your message; partial output was not saved.",
        );
      if (controller.signal.aborted) return;
      const record: AIRecord = {
        id: uid(),
        chatId,
        noteId: note.id,
        revision,
        action,
        output,
        question: prompt,
        scope,
        responseStyle: style,
        createdAt: now(),
        evidence,
        selection: scope === "selection" ? selection : undefined,
        quiz: action === "quiz" ? parseQuiz(output) : undefined,
      };
      ctx.mutate((w) => {
        w.ai.push(record);
      });
      setPending(null);
    } catch (error) {
      setStatus(
        (error as Error).name === "AbortError"
          ? "Response stopped. Your message is ready to retry."
          : (error as Error).message,
      );
      setQuestion(prompt);
      setPending(null);
    } finally {
      setBusy(false);
      abort.current = null;
      composer.current?.focus();
    }
  };
  return (
    <section className="ai-chat" aria-label="AI Chat">
      <header className="chat-header">
        <strong>
          <MessageCircle size={16} /> AI Chat
        </strong>
        <button
          className="icon-button"
          aria-label="New chat"
          title="New chat"
          disabled={busy}
          onClick={() => {
            setChatId(uid());
            setQuestion("");
            setPending(null);
            setStatus("");
            composer.current?.focus();
          }}
        >
          <Plus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Chat options"
          title="Chat options"
          aria-expanded={options}
          onClick={() => setOptions(!options)}
        >
          <SlidersHorizontal size={16} />
        </button>
      </header>
      {chats.length > 0 && (
        <select
          aria-label="Chat history"
          value={records.length ? chatId : ""}
          disabled={busy}
          onChange={(e) => {
            setChatId(e.target.value);
            setQuestion("");
            setPending(null);
            setStatus("");
          }}
        >
          <option value="" disabled>
            New conversation
          </option>
          {chats.map(([id, r]) => (
            <option key={id} value={id}>
              {(r.question ?? r.action).slice(0, 65)}
            </option>
          ))}
        </select>
      )}
      {options && (
        <div className="chat-options">
          <label className="field">
            <span>Context</span>
            <select
              aria-label="Chat context"
              disabled={busy}
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
            >
              <option value="note">Current note</option>
              <option value="selection" disabled={!ctx.selection}>
                Selected passage
              </option>
              <option value="subject">
                Current subject · journals excluded
              </option>
            </select>
          </label>
          <label className="field">
            <span>Study action</span>
            <select
              aria-label="Chat action"
              disabled={busy}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Response style</span>
            <select
              aria-label="Response style"
              disabled={busy}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              <option value="balanced">Balanced</option>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="socratic">Guide me with questions</option>
            </select>
          </label>
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
        </div>
      )}
      <p className="chat-context">
        {scope === "selection"
          ? "Selected passage"
          : scope === "subject"
            ? "Current subject"
            : (ctx.active?.title ?? "Open a note to begin")}{" "}
        · {style}
      </p>
      <div
        className="chat-conversation"
        role="log"
        aria-label="Conversation"
        ref={scroll}
      >
        {!started && (
          <div className="chat-starters">
            <h2>What would you like to explore?</h2>
            <p>Start with your notes, or ask a question.</p>
            {actions.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAction(a.id);
                  setQuestion(a.label);
                  composer.current?.focus();
                }}
              >
                <a.icon size={16} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
        {records.map((r) => (
          <div className="chat-turn" key={r.id}>
            <div className="chat-message user">
              <small>You</small>
              <p>{r.question ?? r.action}</p>
            </div>
            <div className="chat-message assistant">
              <small>Studyspace</small>
              {r.quiz ? (
                <QuizSession ctx={ctx} recordId={r.id} />
              ) : (
                <Markdown
                  body={r.output}
                  onAIReference={(id) =>
                    ctx.setDialog({
                      type: "ai-evidence",
                      id: r.id,
                      reference: id,
                    })
                  }
                />
              )}
              <div className="chat-response-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    ctx.setDialog({
                      type: "ai-preview",
                      id: r.id,
                      output: r.output,
                      revision: r.revision,
                      noteId: r.noteId,
                      selection: r.selection,
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
                      value: r.question ?? "Recall the main idea",
                      answer: r.output,
                    })
                  }
                >
                  Create study card
                </button>
              </div>
            </div>
          </div>
        ))}
        {pending && (
          <div className="chat-turn">
            <div className="chat-message user">
              <small>You</small>
              <p>{pending.question}</p>
            </div>
            <div className="chat-message assistant">
              <small>Studyspace</small>
              <Markdown body={pending.output || "Thinking…"} />
            </div>
          </div>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        {status && (
          <p className="form-status" role="status">
            {status}
          </p>
        )}
        {!ctx.w.settings.aiConsent && !options && (
          <button
            type="button"
            className="text-button"
            onClick={() => setOptions(true)}
          >
            Set up context sharing
          </button>
        )}
        <textarea
          ref={composer}
          aria-label="Chat message"
          rows={3}
          maxLength={4000}
          placeholder="Ask about your notes…"
          value={question}
          disabled={busy}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <div className="chat-send-row">
          <small>Enter to send · Shift+Enter for a new line</small>
          {busy ? (
            <button
              type="button"
              className="secondary"
              onClick={() => abort.current?.abort()}
              aria-label="Stop response"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              className="primary"
              disabled={!ctx.active || !question.trim()}
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          )}
        </div>
        {ctx.demo && (
          <small className="chat-availability">
            AI replies require a connected cloud workspace and configured
            provider.
          </small>
        )}
      </form>
    </section>
  );
}
