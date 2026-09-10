import { z } from "zod";
const quiz = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(4000),
        answer: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(12),
});
export function parseQuiz(text: string) {
  return quiz.parse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")))
    .questions;
}
export function parseStudyCards(text: string) {
  const data = JSON.parse(text);
  return quiz
    .extend({
      questions: z
        .array(
          z.object({
            question: z.string().min(1).max(4000),
            answer: z.string().min(1).max(8000),
          }),
        )
        .min(1)
        .max(240),
    })
    .parse(data).questions;
}
export const quizFormat = {
  type: "json_schema",
  name: "study_quiz",
  strict: true,
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
          },
          required: ["question", "answer"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  },
};
