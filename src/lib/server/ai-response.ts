import { studyRequest } from "./ai-request";
import { parseQuiz } from "../quiz";
import {
  type AIInput,
  type buildAIContext,
  studyBatches,
  validateAIReferences,
} from "./ai";

function providerFailure(code: unknown, fallback: string) {
  if (
    [
      "credit_balance_exhausted",
      "insufficient_quota",
      "organization_spend_limit_exceeded",
      "project_spend_limit_exceeded",
      "organization_usage_limit_exceeded",
    ].includes(String(code))
  )
    return "Free AI is unavailable because Studyspace's AI provider account has reached its billing allowance. The app operator needs to add API credits or review its spending limits. You do not need to sign in or supply an API key.";
  return fallback;
}

export function streamStudyResponse(
  input: AIInput & {
    responseStyle?: string;
    history?: { question: string; answer: string }[];
  },
  context: ReturnType<typeof buildAIContext>,
  signal: AbortSignal,
) {
  const structured = input.action === "quiz" || input.action === "cards";
  const batches = studyBatches(context);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const results: string[] = [],
        cards: { question: string; answer: string }[] = [];
      try {
        for (const [index, passages] of batches.entries()) {
          send({
            type: "progress",
            message: `Studying section ${index + 1} of ${batches.length} · ${context.noteCount} notes`,
          });
          const upstream = await fetch(
            (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(
              /\/$/,
              "",
            ) + "/responses",
            {
              method: "POST",
              headers: {
                Authorization: "Bearer " + process.env.AI_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(studyRequest(input, context, index)),
              signal,
            },
          );
          if (!upstream.ok || !upstream.body) {
            const failure = await upstream.json().catch(() => null);
            throw new Error(
              providerFailure(
                failure?.error?.code,
                upstream.status === 429
                  ? "The AI provider is busy. Try again later."
                  : "The AI provider could not finish this request. Please retry.",
              ),
            );
          }
          const reader = upstream.body.getReader(),
            decoder = new TextDecoder();
          let buffer = "",
            output = "",
            completed = false;
          const consume = (frame: string) => {
            const data = frame
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");
            if (!data || data === "[DONE]") return;
            const event = JSON.parse(data);
            if (event.type === "response.output_text.delta") {
              output += event.delta;
              if (output.length > 100000)
                throw new Error(
                  "The response exceeded the size limit. Choose a smaller folder.",
                );
              if (!structured)
                send({
                  type: "preview",
                  text: [
                    ...results,
                    validateAIReferences(output, context.allowedIds),
                  ].join("\n\n---\n\n"),
                });
            }
            if (event.type === "response.completed") completed = true;
            if (
              ["response.failed", "response.incomplete", "error"].includes(
                event.type,
              )
            )
              throw new Error(
                providerFailure(
                  event.code ??
                    event.error?.code ??
                    event.response?.error?.code,
                  "The AI response was incomplete. Choose a smaller folder or retry.",
                ),
              );
          };
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const frames = buffer.split(/\r?\n\r?\n/);
              buffer = frames.pop() ?? "";
              frames.forEach(consume);
            }
            consume(buffer + decoder.decode());
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          if (!completed || !output.trim())
            throw new Error(
              "The AI response was interrupted. No study cards were added; please retry.",
            );
          if (structured)
            cards.push(
              ...parseQuiz(output).map((card) => ({
                question: card.question,
                answer: validateAIReferences(card.answer, context.allowedIds),
              })),
            );
          else results.push(validateAIReferences(output, context.allowedIds));
        }
        send({
          type: "complete",
          text: structured
            ? JSON.stringify({ questions: cards })
            : results.join("\n\n---\n\n"),
          coverage: { notes: context.noteCount, sections: batches.length },
          evidence: [
            ...context.passages,
            ...context.definitions.map((d) => ({ ...d, title: d.term })),
            ...context.anchors,
          ],
        });
        controller.close();
      } catch (error) {
        if (signal.aborted) {
          controller.error(
            new Error(
              "The response stopped before all selected material was processed.",
            ),
          );
          return;
        }
        send({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "The response could not be completed.",
        });
        controller.close();
      }
    },
  });
}
