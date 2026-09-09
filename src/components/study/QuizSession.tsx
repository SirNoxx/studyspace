"use client";
import { useState } from "react";
import type { AppContext } from "../WorkspaceApp";
import Markdown from "../Markdown";
export default function QuizSession({
  ctx,
  recordId,
}: {
  ctx: AppContext;
  recordId: string;
}) {
  const record = ctx.w.ai.find((r) => r.id === recordId);
  const [index, setIndex] = useState(() =>
    Math.max(0, record?.quiz?.findIndex((q) => !q.assessment) ?? 0),
  );
  const questions = record?.quiz ?? [],
    q = questions[index];
  if (!q) return <p>Choose a saved quiz to resume.</p>;
  const update = (patch: Partial<typeof q>) =>
    ctx.mutate((w) => {
      const item = w.ai.find((r) => r.id === recordId)?.quiz?.[index];
      if (item) Object.assign(item, patch);
    });
  return (
    <section className="quiz-session">
      <span className="eyebrow">
        QUESTION {index + 1} OF {questions.length}
      </span>
      <Markdown body={q.question} />
      <label className="field">
        <span>Your answer</span>
        <textarea
          aria-label="Your answer"
          value={q.response ?? ""}
          rows={4}
          onChange={(e) => update({ response: e.target.value })}
          placeholder="Try recalling the idea before revealing the answer."
        />
      </label>
      {!q.revealed ? (
        <button
          className="secondary"
          onClick={() => update({ revealed: true })}
        >
          Reveal answer & evidence
        </button>
      ) : (
        <>
          <Markdown
            body={q.answer}
            onAIReference={(id) =>
              ctx.setDialog({
                type: "ai-evidence",
                id: recordId,
                reference: id,
              })
            }
          />
          <p className="field-hint">
            Compare your answer with the evidence. Choose your own assessment.
          </p>
          <div className="public-actions">
            <button
              className="secondary"
              aria-pressed={q.assessment === "missed"}
              onClick={() => update({ assessment: "missed" })}
            >
              Needs practice
            </button>
            <button
              className="secondary"
              aria-pressed={q.assessment === "understood"}
              onClick={() => update({ assessment: "understood" })}
            >
              Understood
            </button>
          </div>
          {q.assessment === "missed" && (
            <button
              className="text-button"
              onClick={() =>
                ctx.setDialog({
                  type: "review-card",
                  value: q.question,
                  answer: q.answer,
                })
              }
            >
              Edit & add this question to Review
            </button>
          )}
        </>
      )}
      <div className="public-actions">
        <button disabled={!index} onClick={() => setIndex((i) => i - 1)}>
          Previous
        </button>
        <span>{questions.filter((q) => q.assessment).length} assessed</span>
        <button
          disabled={index === questions.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          Next question
        </button>
      </div>
      <p className="field-hint">
        Your answers and progress are saved privately with this session.
      </p>
    </section>
  );
}
