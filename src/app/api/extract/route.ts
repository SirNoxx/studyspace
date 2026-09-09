import { z } from "zod";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { createHash } from "node:crypto";
import { requireUser, adminClient } from "@/lib/supabase/server";
import { assertSameOrigin, apiError } from "@/lib/server/repository";
import { guardedFetch } from "@/lib/server/fetch";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const { data } = await adminClient().rpc("consume_quota", {
      p_owner: user.id,
      p_bucket: "extract",
      p_limit: 30,
    });
    if (!data)
      return Response.json(
        { error: "Daily article-reader limit reached." },
        { status: 429 },
      );
    const { url } = z
      .object({ url: z.url().max(2048) })
      .parse(await request.json());
    const response = await guardedFetch(url);
    if (
      response.status !== 200 ||
      !String(response.headers["content-type"]).includes("text/html")
    )
      return Response.json(
        {
          error:
            "This page cannot be extracted. Use Open Original and add a manual quote.",
        },
        { status: 422 },
      );
    const dom = new JSDOM(response.text, { url: response.url });
    try {
      const article = new Readability(dom.window.document).parse();
      if (!article?.textContent?.trim())
        throw new Error("No readable article found.");
      const text = article.textContent.trim().slice(0, 100000);
      return Response.json(
        {
          title: article.title,
          text,
          hash: createHash("sha256").update(text).digest("hex"),
          url: response.url,
          retrievedAt: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } finally {
      dom.window.close();
    }
  } catch (e) {
    return Response.json(
      {
        error:
          "Article unavailable. " +
          ((e as Error).message === "AUTH_REQUIRED"
            ? "Sign in to a configured workspace."
            : "Use a manual excerpt or open the original source."),
      },
      { status: 422 },
    );
  }
}
