import { z } from "zod";
import { topicCategories } from "@/lib/learning-catalog";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const q = z.string().trim().min(2).max(100).parse(params.get("q")),
      category = z.enum(topicCategories).parse(params.get("category"));
    const url =
      "https://en.wikipedia.org/w/rest.php/v1/search/page?" +
      new URLSearchParams({ q, limit: "20" });
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Studyspace/2.1 (https://github.com/SirNoxx/studyspace)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok)
      throw Error(
        "Wikipedia is unavailable. Your offline topic wheel still works; try again later.",
      );
    const data = z
      .object({
        pages: z
          .array(
            z.object({
              id: z.number().int().positive(),
              key: z.string().max(500),
              title: z.string().max(240),
              description: z.string().nullable().optional(),
            }),
          )
          .max(20),
      })
      .parse(await response.json());
    return Response.json(
      {
        topics: data.pages
          .filter(
            (p) =>
              !p.title.includes("(disambiguation)") &&
              !/^(List of|Outline of|Index of) /i.test(p.title),
          )
          .map((p) => ({
            id: "wiki:" + p.id,
            title: p.title,
            category,
            sourceId: p.id,
            sourceUrl:
              "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.key),
          })),
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Choose a category and enter a search of 2–100 characters." },
        { status: 400 },
      );
    return Response.json(
      {
        error:
          "Topic search is unavailable. Use the offline wheel or try another search.",
      },
      { status: 503 },
    );
  }
}
