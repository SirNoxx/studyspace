import { z } from "zod";
import { streamStudyResponse } from "@/lib/server/ai-response";
import { emptyWorkspace, now } from "@/lib/model";
import { requireUser, configured } from "@/lib/supabase/server";
import {
  loadWorkspace,
  assertSameOrigin,
  apiError,
} from "@/lib/server/repository";
import { buildAIContext } from "@/lib/server/ai";
import { reserveAI, studyCost, aiDailyLimit } from "@/lib/server/ai-quota";
export const maxDuration = 120;
export async function GET() {
  return Response.json(
    {
      free: true,
      dailyLimit: aiDailyLimit(),
      resets: "UTC midnight",
      configured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    let user: { id: string } | undefined;
    if (configured()) {
      try {
        user = (await requireUser()).user;
      } catch (error) {
        if ((error as Error).message !== "AUTH_REQUIRED") throw error;
      }
    }
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
    if (!input.localContext && !user)
      return Response.json(
        {
          error:
            "Choose local study material to use free AI chat. Accessing a private cloud workspace requires sign-in.",
        },
        { status: 401 },
      );
    const w = input.localContext
      ? emptyWorkspace()
      : await loadWorkspace(user!.id);
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
    let allowance;
    try {
      allowance = await reserveAI(request, user?.id, studyCost(input, context));
    } catch {
      return Response.json(
        {
          error:
            "Free AI is temporarily unavailable while its usage controls are offline. Please try again later.",
        },
        { status: 503 },
      );
    }
    if (!allowance.allowed) {
      const retry = Math.max(
        1,
        Math.ceil((Date.parse(allowance.reset ?? "") - Date.now()) / 1000) ||
          60,
      );
      const error =
        allowance.reason === "burst"
          ? "You're sending study requests quickly. Please wait a minute and try again."
          : allowance.reason === "global"
            ? "Today's free AI capacity has been used. Please try again after midnight UTC."
            : allowance.reason === "processing"
              ? "Your daily AI processing allowance has been reached. Large folders use more of this allowance. It resets at midnight UTC."
              : allowance.reason === "network"
                ? "This network has reached its daily free AI allowance. Please try again after midnight UTC."
                : "Your daily free AI allowance has been reached. It resets at midnight UTC.";
      return Response.json(
        { error, reset: allowance.reset },
        {
          status: 429,
          headers: {
            "Retry-After": String(retry),
            "Cache-Control": "no-store",
          },
        },
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
        "X-AI-Remaining": String(allowance.remaining ?? 0),
        "X-AI-Daily-Limit": String(aiDailyLimit()),
        "X-AI-Reset": allowance.reset ?? "",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
