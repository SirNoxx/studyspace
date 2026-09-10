"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Send,
  Square,
  SlidersHorizontal,
  MessageCircle,
  History,
  ArrowDown,
  ChevronDown,
} from "lucide-react";
import type { AppContext } from "../WorkspaceApp";
import { uid, now, ancestry, inContainer, type AIRecord } from "@/lib/model";
import Markdown from "../Markdown";
import QuizSession from "./QuizSession";
import { parseStudyCards } from "@/lib/quiz";
import { Modal, Menu } from "../ui";
import StudyCardDrafts from "./StudyCardDrafts";
import { actions } from "./chat-actions";
import { noteStudyText } from "@/lib/transcripts";

type Scope = "selection" | "note" | "subject" | "folder";
export default function AIStudy({ ctx }: { ctx: AppContext }) {
  const [chatId, setChatId] = useState(
    () => ctx.w.ai.at(-1)?.chatId ?? ctx.w.ai.at(-1)?.id ?? uid(),
  );
  const [action, setAction] = useState("clarify"),
    [scope, setScope] = useState<Scope>("note");
  const [containerId, setContainerId] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium",
  );
  const [historyOpen, setHistoryOpen] = useState(false),
    [historySearch, setHistorySearch] = useState("");
  const [style, setStyle] = useState("balanced"),
    [question, setQuestion] = useState("");
  const [options, setOptions] = useState(false),
    [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      recordId: string;
      question: string;
      output: string;
    } | null>(null);
  const abort = useRef<AbortController | null>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const selectedPassage = ctx.chatSelection?.text ?? ctx.selection;
  useEffect(() => {
    if (ctx.chatSelection) {
      setScope("selection");
      composer.current?.focus();
    }
  }, [ctx.chatSelection?.id]);
  const records = ctx.w.ai.filter((r) => (r.chatId ?? r.id) === chatId);
  const chats = Array.from(new Set(ctx.w.ai.map((r) => r.chatId ?? r.id)))
    .map((id) => {
      const turns = ctx.w.ai
        .filter((r) => (r.chatId ?? r.id) === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        id,
        first: turns[0],
        last: turns.at(-1)!,
        count: turns.length,
        matches: turns.some((r) =>
          `${r.question ?? r.action} ${r.output} ${r.contextTitle ?? ""}`
            .toLowerCase()
            .includes(historySearch.toLowerCase()),
        ),
      };
    })
    .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  const folderNotes = ctx.w.notes.filter(
    (n) =>
      !n.trashed &&
      !n.archived &&
      !["journal", "dream"].includes(n.kind) &&
      inContainer(ctx.w, n.containerId, containerId) &&
      ancestry(ctx.w, n.containerId).every((c) => !c.trashed && !c.archived),
  );
  const contextNote =
    scope === "folder"
      ? folderNotes[0]
      : scope === "selection" && ctx.chatSelection
        ? ctx.w.notes.find(
            (n) => n.id === ctx.chatSelection!.noteId && !n.trashed,
          )
        : ctx.active;
  const contextTitle =
    scope === "folder"
      ? ctx.w.containers.find((c) => c.id === containerId)?.title
      : contextNote?.title;
  const started = records.length > 0 || !!question || !!pending;
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [chatId]);
  const run = async () => {
    const note = contextNote;
    if (busy || !question.trim()) return;
    if (!note) {
      setStatus(
        scope === "folder"
          ? "Choose a folder containing written notes."
          : "Open a note to choose your chat context.",
      );
      return;
    }
    if (!ctx.w.settings.aiConsent) {
      setOptions(true);
      setStatus("Enable selected-context sharing in Chat options.");
      return;
    }
    if (scope === "selection" && !selectedPassage) {
      setStatus("Select a passage or choose Current note in Chat options.");
      return;
    }
    const prompt = question.trim(),
      selection = selectedPassage,
      revision = note.revision;
    const localNotes =
      scope === "folder"
        ? folderNotes
        : scope === "subject"
          ? ctx.w.notes.filter(
              (n) =>
                !n.trashed &&
                !n.archived &&
                !["journal", "dream"].includes(n.kind) &&
                inContainer(
                  ctx.w,
                  n.containerId,
                  ancestry(ctx.w, note.containerId)
                    .reverse()
                    .find((c) => c.kind !== "folder")!.id,
                ) &&
                ancestry(ctx.w, n.containerId).every(
                  (c) => !c.trashed && !c.archived,
                ),
            )
          : [scope === "selection" ? { ...note, body: selection } : note];
    if (
      localNotes.reduce(
        (sum, n) =>
          sum + (scope === "selection" ? n.body : noteStudyText(n)).length,
        0,
      ) > 200000
    ) {
      setStatus(
        "Choose a smaller folder (up to 200,000 characters per request). No content was sent.",
      );
      return;
    }
    const localContainers = new Set(
      localNotes.flatMap((n) =>
        ancestry(ctx.w, n.containerId).map((c) => c.id),
      ),
    );
    const controller = new AbortController();
    const recordId = uid();
    abort.current = controller;
    setBusy(true);
    setOptions(false);
    setStatus("");
    setQuestion("");
    setPending({ recordId, question: prompt, output: "" });
    ctx.mutate((w) => {
      w.ai.push({
        id: recordId,
        chatId,
        noteId: note.id,
        revision,
        action,
        question: prompt,
        output: "",
        scope,
        containerId: scope === "folder" ? containerId : undefined,
        contextTitle,
        difficulty,
        selection: scope === "selection" ? selection : undefined,
        status: "pending",
        createdAt: now(),
      });
    });
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          noteId: note.id,
          scope,
          containerId: scope === "folder" ? containerId : undefined,
          difficulty,
          consent: ctx.w.settings.aiConsent,
          personality: ctx.w.settings.aiPersonality ?? "",
          ...(ctx.demo
            ? {
                localContext: {
                  notes: localNotes.map((n) => ({
                    id: n.id,
                    containerId: n.containerId,
                    title: n.title,
                    body: scope === "selection" ? n.body : noteStudyText(n),
                    kind: n.kind,
                    revision: n.revision,
                  })),
                  containers: ctx.w.containers
                    .filter((c) => localContainers.has(c.id))
                    .map((c) => ({
                      id: c.id,
                      parentId: c.parentId,
                      title: c.title,
                      kind: c.kind,
                    })),
                },
              }
            : {}),
          selection,
          question: prompt,
          responseStyle: style,
          expectedRevision: revision,
          explicitSensitive: note.kind === "journal" || note.kind === "dream",
          history: records
            .filter(
              (r) =>
                r.noteId === note.id &&
                (!r.status || r.status === "complete") &&
                (scope !== "folder" || r.containerId === containerId) &&
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
      let coverage: AIRecord["coverage"];
      const consume = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "progress") {
          setStatus(event.message);
          return;
        }
        if (event.type === "error")
          throw new Error(
            event.error ?? "The response was interrupted. Please retry.",
          );
        output = event.text ?? output;
        if (event.type === "complete") {
          complete = true;
          evidence = event.evidence;
          coverage = event.coverage;
        }
        setPending({
          recordId,
          question: prompt,
          output:
            action === "quiz" || action === "cards"
              ? "Preparing your questions…"
              : output,
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
      if (controller.signal.aborted)
        throw new DOMException("Response stopped", "AbortError");
      const record: AIRecord = {
        id: recordId,
        chatId,
        noteId: note.id,
        revision,
        action,
        output,
        question: prompt,
        scope,
        containerId: scope === "folder" ? containerId : undefined,
        contextTitle,
        difficulty,
        coverage,
        status: "complete",
        responseStyle: style,
        createdAt: now(),
        evidence,
        selection: scope === "selection" ? selection : undefined,
        quiz: action === "quiz" ? parseStudyCards(output) : undefined,
        cards: action === "cards" ? parseStudyCards(output) : undefined,
      };
      ctx.mutate((w) => {
        const saved = w.ai.find((r) => r.id === recordId);
        if (saved) Object.assign(saved, record);
      });
      setPending(null);
      setStatus("");
      ctx.clearChatSelection();
    } catch (error) {
      ctx.mutate((w) => {
        const saved = w.ai.find((r) => r.id === recordId);
        if (saved)
          Object.assign(saved, {
            id: recordId,
            chatId,
            noteId: note.id,
            revision,
            action,
            question: prompt,
            output: "",
            scope,
            containerId: scope === "folder" ? containerId : undefined,
            contextTitle,
            difficulty,
            status: controller.signal.aborted ? "stopped" : "error",
            errorMessage: controller.signal.aborted
              ? "Response stopped before completion."
              : (error as Error).message,
            createdAt: now(),
          });
      });
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
          className="secondary chat-history-button"
          aria-label="Chat history"
          title="Chat history"
          disabled={busy}
          onClick={() => {
            setHistorySearch("");
            setHistoryOpen(true);
          }}
        >
          <History size={16} />
          <span>History</span>
        </button>
        <button
          className="icon-button"
          aria-label="New chat"
          title="New chat"
          disabled={busy}
          onClick={() => {
            setChatId(uid());
            setAction("clarify");
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
      {ctx.chatSelection && (
        <div className="chat-attached-passage">
          <span>Attached passage</span>
          <blockquote>{ctx.chatSelection.text}</blockquote>
          <button
            className="text-button"
            onClick={() => {
              ctx.clearChatSelection();
              setScope("note");
            }}
          >
            Remove passage
          </button>
        </div>
      )}
      {historyOpen && (
        <Modal
          title="Chat history"
          description="Your previous conversations, saved privately in this workspace."
          onClose={() => setHistoryOpen(false)}
        >
          <input
            aria-label="Search chat history"
            placeholder="Search conversations…"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
          <div className="chat-history-list">
            {chats
              .filter((chat) => chat.matches)
              .map((chat) => (
                <button
                  key={chat.id}
                  className="chat-history-entry"
                  onClick={() => {
                    setChatId(chat.id);
                    setQuestion("");
                    setPending(null);
                    setStatus("");
                    setScope(chat.last.scope ?? "note");
                    setContainerId(chat.last.containerId ?? "");
                    setDifficulty(chat.last.difficulty ?? "medium");
                    setAction(chat.last.action);
                    if (
                      ctx.w.notes.some(
                        (n) => n.id === chat.last.noteId && !n.trashed,
                      )
                    )
                      ctx.openNote(chat.last.noteId);
                    if (chat.last.scope === "selection" && chat.last.selection)
                      ctx.openChat(chat.last.selection, chat.last.noteId);
                    setHistoryOpen(false);
                  }}
                >
                  <strong>{chat.first.question ?? chat.first.action}</strong>
                  <span>
                    {chat.last.contextTitle ??
                      ctx.w.notes.find((n) => n.id === chat.last.noteId)
                        ?.title ??
                      "Saved conversation"}
                  </span>
                  <small>
                    {new Date(chat.last.createdAt).toLocaleString()} ·{" "}
                    {chat.count} {chat.count === 1 ? "message" : "messages"}
                  </small>
                </button>
              ))}
            {!chats.some((chat) => chat.matches) && (
              <p>
                {chats.length
                  ? "No matching conversations."
                  : "Your conversations will appear here after you send a message."}
              </p>
            )}
          </div>
        </Modal>
      )}
      <div className="chat-study-controls">
        <label className="field">
          <span>Study material</span>
          <select
            aria-label="Study material"
            disabled={busy}
            value={scope}
            onChange={(e) => {
              const next = e.target.value as Scope;
              setScope(next);
              if (next === "folder")
                ctx.pickStudyFolder?.(
                  (id) => setContainerId(id),
                  () => setScope(scope),
                );
            }}
          >
            <option value="note">Current note</option>
            <option value="selection" disabled={!selectedPassage}>
              Selected passage
            </option>
            <option value="folder">Folder or collection</option>
            <option value="subject">Current subject</option>
          </select>
        </label>
        <div className="chat-tools-menu">
          <Menu
            trigger={
              <button className="secondary" disabled={busy}>
                Study Tools <ChevronDown size={14} />
              </button>
            }
            items={[
              {
                label: "Ask a question",
                icon: MessageCircle,
                action: () => {
                  setAction("clarify");
                  setQuestion("");
                },
              },
              ...actions.map((tool) => ({
                label: tool.label,
                icon: tool.icon,
                action: () => {
                  setAction(tool.id);
                  setQuestion(
                    tool.id === "cards"
                      ? "Make study cards covering the important information throughout this material."
                      : tool.id === "summarize"
                        ? "Summarize the important ideas and details throughout this material."
                        : tool.label,
                  );
                },
              })),
            ]}
          />
        </div>
        {scope === "folder" && (
          <div className="chat-selected-folder">
            <span>
              {containerId
                ? (ctx.w.containers.find((c) => c.id === containerId)?.title ??
                  "Choose a folder")
                : "Choose a folder or collection in the sidebar"}
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => ctx.pickStudyFolder?.((id) => setContainerId(id))}
            >
              {containerId ? "Change in sidebar" : "Choose in sidebar"}
            </button>
          </div>
        )}
        {(action === "cards" || action === "quiz") && (
          <label className="field chat-tool-option">
            <span>
              {action === "cards" ? "Card difficulty" : "Question difficulty"}
            </span>
            <select
              aria-label="Study card difficulty"
              disabled={busy}
              value={difficulty}
              onChange={(e) =>
                setDifficulty(e.target.value as typeof difficulty)
              }
            >
              <option value="easy">Easy · recall</option>
              <option value="medium">Medium · apply</option>
              <option value="hard">Hard · infer &amp; explain</option>
            </select>
          </label>
        )}
        {!["clarify", "cards", "quiz"].includes(action) && (
          <label className="field chat-tool-option">
            <span>
              {action === "summarize" ? "Summary style" : "Response style"}
            </span>
            <select
              aria-label="Study tool response style"
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
        )}
        {action !== "clarify" && (
          <small className="chat-selected-tool">
            {actions.find((tool) => tool.id === action)?.label}
          </small>
        )}
      </div>
      {options && (
        <div className="chat-options">
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
          <label className="field">
            <span>
              Personality & response preferences <small>(optional)</small>
            </span>
            <textarea
              aria-label="AI personality preferences"
              rows={4}
              maxLength={2000}
              placeholder="For example: Be encouraging, keep explanations concise, and ask me questions before giving the answer."
              value={ctx.w.settings.aiPersonality ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                ctx.mutate((w) => {
                  w.settings.aiPersonality = value;
                });
              }}
            />
            <small>
              Saved for this workspace. Applies to future responses.{" "}
              {(ctx.w.settings.aiPersonality ?? "").length}/2,000
            </small>
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
          : scope === "folder"
            ? `${contextTitle ?? "Choose a folder"} · ${folderNotes.length} notes · journals excluded`
            : scope === "subject"
              ? "Current subject"
              : (ctx.active?.title ?? "Open a note to begin")}{" "}
        · {style}
      </p>
      <div className="chat-reading-region">
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
              <p>
                Choose a function from Study Tools, or type your own question
                below.
              </p>
            </div>
          )}
          {records
            .filter((r) => r.id !== pending?.recordId)
            .map((r) => (
              <div className="chat-turn" key={r.id}>
                <div className="chat-message user">
                  <small>You</small>
                  <p>{r.question ?? r.action}</p>
                </div>
                <div className="chat-message assistant">
                  <small>Studyspace</small>
                  {r.status === "error" ||
                  r.status === "stopped" ||
                  r.status === "pending" ? (
                    <div className="chat-failed">
                      <p role="status">
                        {r.errorMessage ?? "This response did not finish."}
                      </p>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setQuestion(r.question ?? r.action);
                          setAction(r.action);
                          setScope(r.scope ?? "note");
                          setContainerId(r.containerId ?? "");
                          setDifficulty(r.difficulty ?? "medium");
                          if (
                            ctx.w.notes.some(
                              (n) => n.id === r.noteId && !n.trashed,
                            )
                          )
                            ctx.openNote(r.noteId);
                          if (r.scope === "selection" && r.selection)
                            ctx.openChat(r.selection, r.noteId);
                          composer.current?.focus();
                        }}
                      >
                        Retry message
                      </button>
                    </div>
                  ) : r.cards ? (
                    <StudyCardDrafts ctx={ctx} recordId={r.id} />
                  ) : r.quiz ? (
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
                  {r.coverage && (
                    <p className="field-hint">
                      Studied {r.coverage.notes} notes across{" "}
                      {r.coverage.sections} sections.
                    </p>
                  )}
                  {!r.cards &&
                    r.status !== "error" &&
                    r.status !== "stopped" &&
                    r.status !== "pending" && (
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
                    )}
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
        {started && (
          <button
            type="button"
            className="chat-jump-bottom"
            aria-label="Scroll to bottom of chat"
            title="Scroll to bottom"
            onClick={() =>
              scroll.current?.scrollTo({
                top: scroll.current.scrollHeight,
                behavior: "smooth",
              })
            }
          >
            <ArrowDown size={17} />
          </button>
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
              disabled={!contextNote || !question.trim()}
              aria-label="Send message"
            >
              <Send size={15} />
            </button>
          )}
        </div>
        {ctx.demo && (
          <small className="chat-availability">
            AI requests require a signed-in account and a configured provider.
            Only the selected material is sent.
          </small>
        )}
      </form>
    </section>
  );
}
