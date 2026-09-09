import { z } from "zod";
import { configured, requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin, apiError } from "@/lib/server/repository";
import { enrichMetadata } from "@/lib/server/metadata";
const localRequests = new Map<string, number>();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (configured()) {
      const { user } = await requireUser();
      const { data } = await adminClient().rpc("consume_quota", {
        p_owner: user.id,
        p_bucket: "metadata",
        p_limit: 200,
      });
      if (!data)
        return Response.json(
          { error: "Daily metadata lookup limit reached." },
          { status: 429 },
        );
    } else {
      if (
        process.env.NODE_ENV !== "development" ||
        !["127.0.0.1", "localhost"].includes(new URL(request.url).hostname)
      )
        return Response.json(
          { error: "Sign in to a configured workspace for metadata lookup." },
          { status: 503 },
        );
      const day = new Date().toISOString().slice(0, 10);
      const used = (localRequests.get(day) ?? 0) + 1;
      localRequests.set(day, used);
      if (used > 100)
        return Response.json(
          { error: "Local lookup limit reached." },
          { status: 429 },
        );
    }
    const { input } = z
      .object({ input: z.string().max(2048) })
      .parse(await request.json());
    return Response.json(await enrichMetadata(input));
  } catch (e) {
    return Response.json(
      {
        error: (e as Error).message.startsWith("AUTH")
          ? "Sign in to look up metadata."
          : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
