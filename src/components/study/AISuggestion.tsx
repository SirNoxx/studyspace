"use client";
import { useRef, useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import type { AppContext } from "../WorkspaceApp";
import { parseQuiz } from "@/lib/quiz";
export default function AISuggestion({
  ctx,
  kind,
  passage,
  onResult,
}: {
  ctx: AppContext;
  kind: "definition" | "card";
  passage: string;
  onResult: (question: string, answer: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <div className="ai-suggestion">
      <p className="muted">
        Write your own answer, or request an editable AI suggestion using this
        passage and its note. Nothing is saved until you confirm.
      </p>
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
        Allow selected context to be sent to the configured AI provider
      </label>
      <button
        type="button"
        className="secondary"
        disabled={busy || !ctx.active || !ctx.w.settings.aiConsent}
        onClick={async () => {
          const note = ctx.active;
          if (!note) return;
          setBusy(true);
          setStatus("");
          abort.current = new AbortController();
          try {
            const response = await fetch("/api/ai", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: abort.current.signal,
              body: JSON.stringify({
                action: kind === "card" ? "quiz" : "clarify",
                noteId: note.id,
                scope: "note",
                selection: passage,
                question:
                  kind === "card"
                    ? "Create exactly one question-and-answer study card about this selected passage: " +
                      passage
                    : "Give only a concise dictionary definition, informed by the note, for: " +
                      passage,
                expectedRevision: note.revision,
                explicitSensitive: ["journal", "dream"].includes(note.kind),
              }),
            });
            if (!response.ok) throw Error((await response.json()).error);
            const reader = response.body!.getReader(),
              decoder = new TextDecoder();
            let buffer = "",
              output = "",
              complete = false;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line) continue;
                const event = JSON.parse(line);
                if (event.type === "complete") {
                  output = event.text;
                  complete = true;
                }
              }
            }
            if (!complete)
              throw Error(
                "The suggestion was interrupted. Your manual draft is unchanged.",
              );
            if (kind === "card") {
              const card = parseQuiz(output)[0];
              onResult(card.question, card.answer);
            } else onResult(passage, output);
            setStatus("Suggestion ready. Edit and confirm it before saving.");
          } catch (e) {
            setStatus(
              (e as Error).name === "AbortError"
                ? "Cancelled. Your manual draft is unchanged."
                : (e as Error).message + " You can continue manually.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={15} />
        {busy ? "Preparing suggestion…" : "Suggest with AI"}
      </button>
      {busy && (
        <button
          type="button"
          className="text-button"
          onClick={() => abort.current?.abort()}
        >
          Cancel
        </button>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
