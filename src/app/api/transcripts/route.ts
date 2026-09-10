import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin, apiError } from "@/lib/server/repository";
import { youtubeVideoId } from "@/lib/transcripts";

export const maxDuration = 45;
const inputSchema = z.object({
  url: z.string().max(1000),
  jobToken: z.string().max(3000).optional(),
});
function sign(value: string, key: string) {
  return createHmac("sha256", key).update(value).digest("base64url");
}
function jobToken(jobId: string, owner: string, videoId: string, key: string) {
  const value = Buffer.from(
    JSON.stringify({ jobId, owner, videoId, expires: Date.now() + 86400000 }),
  ).toString("base64url");
  return value + "." + sign(value, key);
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const raw = await request.text();
    if (raw.length > 5000)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const input = inputSchema.parse(JSON.parse(raw));
    const videoId = youtubeVideoId(input.url);
    if (!videoId)
      return Response.json(
        { error: "Paste a YouTube video link." },
        { status: 400 },
      );
    const url = "https://www.youtube.com/watch?v=" + videoId;
    const key = process.env.SUPADATA_API_KEY;
    let title = "YouTube video " + videoId;
    if (!input.jobToken) {
      try {
        const meta = await fetch(
          "https://www.youtube.com/oembed?format=json&url=" +
            encodeURIComponent(url),
          { signal: AbortSignal.timeout(5000), redirect: "error" },
        );
        if (meta.ok) {
          const data = await meta.json();
          if (typeof data.title === "string") title = data.title.slice(0, 240);
        }
      } catch {
        /* A missing title must not prevent transcript import. */
      }
    }
    if (!key)
      return Response.json(
        {
          title,
          error:
            "Automatic transcripts need a SUPADATA_API_KEY on the Studyspace server. You can paste or import a transcript below.",
        },
        { status: 503 },
      );
    let endpoint =
      "https://api.supadata.ai/v1/transcript?text=true&mode=auto&url=" +
      encodeURIComponent(url);
    if (input.jobToken) {
      const [value, signature] = input.jobToken.split(".");
      const expected = sign(value, key);
      if (
        !signature ||
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        return Response.json(
          { error: "Invalid transcript job.", restart: true },
          { status: 400 },
        );
      const job = JSON.parse(Buffer.from(value, "base64url").toString());
      if (
        job.owner !== user.id ||
        job.videoId !== videoId ||
        job.expires < Date.now() ||
        typeof job.jobId !== "string" ||
        !/^[\w-]{1,200}$/.test(job.jobId)
      )
        return Response.json(
          {
            error: "Transcript job expired or unavailable. Start a new import.",
            restart: true,
          },
          { status: 400 },
        );
      endpoint =
        "https://api.supadata.ai/v1/transcript/" +
        encodeURIComponent(job.jobId);
    }
    const { data: allowed, error } = await adminClient().rpc("consume_quota", {
      p_owner: user.id,
      p_bucket: input.jobToken ? "transcript-poll" : "transcripts",
      p_limit: input.jobToken ? 1000 : 10,
    });
    if (error || !allowed)
      return Response.json(
        {
          error:
            "Daily transcript allowance reached. Try tomorrow or import the text manually.",
        },
        { status: 429 },
      );
    const response = await fetch(endpoint, {
      headers: { "x-api-key": key },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok)
      return Response.json(
        {
          title,
          restart: response.status === 404,
          error:
            response.status === 404
              ? "No transcript is available for this video. You can import one below."
              : "The transcript provider could not complete this request. Retry or import text below.",
        },
        { status: 502 },
      );
    const data = await response.json();
    if (typeof data.jobId === "string" && /^[\w-]{1,200}$/.test(data.jobId))
      return Response.json({
        title,
        status: "pending",
        jobToken: jobToken(data.jobId, user.id, videoId, key),
      });
    if (["queued", "active", "processing"].includes(data.status))
      return Response.json({ status: "pending", jobToken: input.jobToken });
    if (data.status === "failed")
      return Response.json(
        {
          error: "Transcription failed. Retry or import the text below.",
          restart: true,
        },
        { status: 502 },
      );
    const result = data.result ?? data;
    const text =
      typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content
              .map((c: { text?: string }) => c.text ?? "")
              .join("\n")
          : "";
    if (!text.trim())
      return Response.json(
        { error: "This video returned an empty transcript." },
        { status: 502 },
      );
    if (text.length > 200000)
      return Response.json(
        {
          error:
            "This transcript exceeds 200,000 characters. Import a shorter excerpt manually.",
        },
        { status: 413 },
      );
    return Response.json({
      ...(input.jobToken ? {} : { title }),
      text,
      language: typeof result.lang === "string" ? result.lang : undefined,
      status: "ready",
    });
  } catch (error) {
    return apiError(error);
  }
}
