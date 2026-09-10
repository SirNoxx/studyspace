import { z } from "zod";
import { streamStudyResponse } from "@/lib/server/ai-response";
import { emptyWorkspace, now } from "@/lib/model";
import { requireUser, adminClient, configured } from "@/lib/supabase/server";
import {
  loadWorkspace,
  assertSameOrigin,
  apiError,
} from "@/lib/server/repository";
import { buildAIContext, studyBatches } from "@/lib/server/ai";
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
        action: z.enum([
          "summarize",
          "rewrite",
          "quiz",
          "next",
          "clarify",
          "cards",
        ]),
        noteId: z.uuid(),
        scope: z.enum(["selection", "note", "subject", "folder"]),
        containerId: z.uuid().optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
        consent: z.boolean().optional(),
        localContext: z
          .object({
            notes: z
              .array(
                z.object({
                  id: z.uuid(),
                  containerId: z.uuid(),
                  title: z.string().max(240),
                  body: z.string().max(200000),
                  kind: z.enum(["note", "quick", "journal", "dream"]),
                  revision: z.number().int().positive(),
                }),
              )
              .min(1)
              .max(10000),
            containers: z
              .array(
                z.object({
                  id: z.uuid(),
                  parentId: z.uuid().nullable(),
                  title: z.string().max(240),
                  kind: z.enum(["collection", "subject", "folder"]),
                }),
              )
              .min(1)
              .max(10000),
          })
          .optional(),
        selection: z.string().max(45000).optional(),
        question: z.string().max(4000).optional(),
        personality: z.string().max(2000).optional(),
        responseStyle: z
          .enum(["balanced", "concise", "detailed", "socratic"])
          .optional(),
        history: z
          .array(
            z.object({
              question: z.string().max(4000),
              answer: z.string().max(6000),
            }),
          )
          .max(4)
          .optional(),
        expectedRevision: z.number().int(),
        explicitSensitive: z.boolean().optional(),
      })
      .parse(
        await (async () => {
          const raw = await request.text();
          if (raw.length > 2000000) throw new Error("REQUEST_LIMIT");
          return JSON.parse(raw);
        })(),
      );
    const w = input.localContext
      ? emptyWorkspace()
      : await loadWorkspace(user.id);
    if (input.localContext) {
      w.containers = input.localContext.containers.map((c) => ({
        ...c,
        description: "",
        color: "",
        icon: "folder",
        approach: "mixed",
        dictionary: false,
        related: [],
        order: 0,
        createdAt: now(),
        updatedAt: now(),
      }));
      w.notes = input.localContext.notes.map((n) => ({
        ...n,
        tags: [],
        history: [],
        createdAt: now(),
        updatedAt: now(),
      }));
      if (w.notes.reduce((sum, n) => sum + n.body.length, 0) > 200000)
        return Response.json(
          {
            error:
              "Choose a smaller folder (up to 200,000 characters). No content was sent to the AI provider.",
          },
          { status: 400 },
        );
    }
    if (!(input.consent ?? (!input.localContext && w.settings.aiConsent)))
      return Response.json(
        {
          error:
            "Enable selected-context sharing before starting a study request.",
        },
        { status: 403 },
      );
    let context;
    try {
      context = buildAIContext(w, input);
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
    for (const _batch of studyBatches(context)) {
      const { data: allowed, error } = await adminClient().rpc(
        "consume_quota",
        {
          p_owner: user.id,
          p_bucket: "ai",
          p_limit: Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 30),
        },
      );
      if (error || !allowed)
        return Response.json(
          {
            error:
              "Daily AI request allowance reached. Try again tomorrow; core notes remain available.",
          },
          { status: 429 },
        );
    }
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(110000),
    ]);
    const stream = streamStudyResponse(input, context, signal);
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
