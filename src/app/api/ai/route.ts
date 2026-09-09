import { z } from "zod";
import { quizFormat, parseQuiz } from "@/lib/quiz";
import { requireUser, adminClient, configured } from "@/lib/supabase/server";
import {
  loadWorkspace,
  assertSameOrigin,
  apiError,
} from "@/lib/server/repository";
import {
  buildAIContext,
  AI_INSTRUCTIONS,
  validateAIReferences,
} from "@/lib/server/ai";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!configured())
      return Response.json(
        {
          error:
            "AI needs a signed-in Supabase workspace, AI_API_KEY, and AI_MODEL. Your notes remain fully usable without it.",
        },
        { status: 503 },
      );
    const { user } = await requireUser();
    if (!process.env.AI_API_KEY || !process.env.AI_MODEL)
      return Response.json(
        {
          error:
            "The workspace operator must configure AI_API_KEY and AI_MODEL. No content was sent.",
        },
        { status: 503 },
      );
    const input = z
      .object({
        action: z.enum(["summarize", "rewrite", "quiz", "next", "clarify"]),
        noteId: z.uuid(),
        scope: z.enum(["selection", "note", "subject"]),
        selection: z.string().max(45000).optional(),
        question: z.string().max(4000).optional(),
        expectedRevision: z.number().int(),
        explicitSensitive: z.boolean().optional(),
      })
      .parse(await request.json());
    const w = await loadWorkspace(user.id);
    if (!w.settings.aiConsent)
      return Response.json(
        {
          error:
            "Enable selected-context sharing before starting a study request.",
        },
        { status: 403 },
      );
    const context = buildAIContext(w, input);
    const { data: allowed, error } = await adminClient().rpc("consume_quota", {
      p_owner: user.id,
      p_bucket: "ai",
      p_limit: Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 30),
    });
    if (error || !allowed)
      return Response.json(
        {
          error:
            "Daily AI request allowance reached. Try again tomorrow; core notes remain available.",
        },
        { status: 429 },
      );
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(110000),
    ]);
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
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          store: false,
          stream: true,
          max_output_tokens: 3500,
          instructions:
            AI_INSTRUCTIONS +
            (input.action === "quiz"
              ? " For this quiz return the required JSON with 3–6 grounded questions and separate answers. Keep answers out of question text. Cite evidence in answers."
              : ""),
          ...(input.action === "quiz" ? { text: { format: quizFormat } } : {}),
          input: JSON.stringify({
            task: input.action,
            question: input.question,
            studyApproach: context.approach,
            passages: context.passages,
            definitions: context.definitions,
            evidence: context.anchors,
          }),
        }),
        signal,
      },
    );
    if (!upstream.ok)
      return Response.json(
        {
          error:
            upstream.status === 429
              ? "The AI provider is rate limiting requests. Try again later."
              : "The AI provider could not complete this request. No note was modified.",
        },
        { status: 502 },
      );
    const encoder = new TextEncoder(),
      decoder = new TextDecoder();
    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "",
          output = "",
          completed = false;
        try {
          const reader = upstream.body!.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const data = frame
                .split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("\n");
              if (!data || data === "[DONE]") continue;
              const event = JSON.parse(data);
              if (event.type === "response.output_text.delta") {
                output += event.delta;
                if (output.length > 100000) throw new Error("OUTPUT_LIMIT");
                if (input.action !== "quiz")
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: "preview",
                        text: validateAIReferences(output, context.allowedIds),
                      }) + "\n",
                    ),
                  );
              }
              if (event.type === "response.completed") completed = true;
              if (event.type === "response.failed" || event.type === "error")
                throw new Error("PROVIDER_FAILED");
            }
          }
          if (!completed) throw new Error("INCOMPLETE");
          const safe = validateAIReferences(output, context.allowedIds);
          if (input.action === "quiz") parseQuiz(safe);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "complete",
                text: safe,
                evidence: [
                  ...context.passages,
                  ...context.definitions.map((d) => ({ ...d, title: d.term })),
                  ...context.anchors,
                ],
              }) + "\n",
            ),
          );
          controller.close();
        } catch {
          controller.error(
            new Error(
              "The AI response was interrupted. No edits were applied.",
            ),
          );
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
