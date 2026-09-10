"use client";
import type { AppContext } from "../WorkspaceApp";
import { addReview } from "@/lib/domain";
import { subjectOf } from "@/lib/model";
import { createCardGroup } from "@/lib/enhancements";

export default function StudyCardDrafts({
  ctx,
  recordId,
}: {
  ctx: AppContext;
  recordId: string;
}) {
  const record = ctx.w.ai.find((r) => r.id === recordId)!;
  const cards = record.cards ?? [];
  const saved = !!record.savedCardIds?.length;
  return (
    <section className="study-card-drafts" aria-label="Generated study cards">
      <p>
        <strong>{cards.length} study cards</strong> ·{" "}
        {record.difficulty ?? "medium"}
      </p>
      <p className="field-hint">
        Review the questions and answers, then save the set to Review.
      </p>
      {cards.map((card, index) => (
        <details key={index}>
          <summary>
            Card {index + 1}: {card.question}
          </summary>
          {(["question", "answer"] as const).map((field) => (
            <label className="field" key={field}>
              <span>
                {field === "question" ? "Question" : "Answer & evidence"}
              </span>
              <textarea
                aria-label={`Card ${index + 1} ${field}`}
                value={card[field]}
                disabled={saved}
                rows={field === "answer" ? 5 : 3}
                onChange={(e) =>
                  ctx.mutate((w) => {
                    const current = w.ai.find((r) => r.id === recordId);
                    if (current?.cards && !current.savedCardIds?.length)
                      current.cards[index][field] = e.target.value;
                  })
                }
              />
            </label>
          ))}
        </details>
      ))}
      <button
        className="primary"
        disabled={
          saved || cards.some((c) => !c.question.trim() || !c.answer.trim())
        }
        onClick={() =>
          ctx.mutate((w) => {
            const current = w.ai.find((r) => r.id === recordId)!;
            if (current.savedCardIds?.length || !current.cards?.length) return;
            const container =
              current.containerId ??
              w.notes.find((n) => n.id === current.noteId)?.containerId;
            const title = `${current.contextTitle ?? "AI study"} · ${current.difficulty ?? "medium"}`;
            let unique = title,
              suffix = 2;
            while (
              w.settings.cardGroups?.some(
                (g) => g.title.toLowerCase() === unique.toLowerCase(),
              )
            )
              unique = `${title} (${suffix++})`;
            const group = createCardGroup(w, unique, container);
            current.savedCardIds = current.cards.map(
              (card) =>
                addReview(w, {
                  front: card.question,
                  back: card.answer,
                  groupId: group.id,
                  sourceType:
                    current.scope === "folder" || current.scope === "subject"
                      ? "custom"
                      : "note",
                  sourceId:
                    current.scope === "folder" || current.scope === "subject"
                      ? undefined
                      : current.noteId,
                  sourceRevision: current.revision,
                  subjectId: container
                    ? subjectOf(w, container)?.id
                    : undefined,
                }).id,
            );
          }, "Study cards saved to Review.")
        }
      >
        {saved ? "Saved to Review" : `Save all ${cards.length} cards to Review`}
      </button>
    </section>
  );
}
