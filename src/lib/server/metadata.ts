import { XMLParser } from "fast-xml-parser";
import { identifySource } from "../markdown";
import { guardedFetch } from "./fetch";
import type { Source } from "../model";
const cache = new Map<string, { until: number; value: Partial<Source> }>(),
  pending = new Map<string, Promise<Partial<Source>>>();
const plain = (s: unknown) =>
  typeof s === "string"
    ? s
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : undefined;
export function crossrefMetadata(data: any): Partial<Source> {
  const m = data.message ?? {};
  return {
    title: plain(m.title?.[0]),
    authors: (m.author ?? []).map((a: any) =>
      [a.given, a.family].filter(Boolean).join(" "),
    ),
    publisher: plain(m["container-title"]?.[0] ?? m.publisher),
    date: m.issued?.["date-parts"]?.[0]?.join("-"),
    description: plain(m.abstract),
    provider: "Crossref",
    status: m.title?.length ? "ready" : "partial",
  };
}
export function arxivMetadata(xml: string): Partial<Source> {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsafe provider XML.");
  const data = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
  }).parse(xml);
  const raw = data.feed?.entry;
  const entry = Array.isArray(raw) ? raw[0] : raw;
  if (!entry || String(entry.id).includes("/errors"))
    return { provider: "arXiv", status: "partial" };
  return {
    title: plain(entry.title),
    authors: [entry.author]
      .flat()
      .filter(Boolean)
      .map((a) => plain(a.name) ?? ""),
    description: plain(entry.summary),
    date: entry.published,
    provider: "arXiv",
    status: "ready",
  };
}
export function bookMetadata(data: any, key: string): Partial<Source> {
  const b = data[key];
  if (!b) return { provider: "Open Library", status: "partial" };
  return {
    title: plain(b.title),
    authors: (b.authors ?? []).map((a: any) => plain(a.name) ?? ""),
    publisher: (b.publishers ?? []).map((p: any) => plain(p.name)).join(", "),
    date: b.publish_date,
    provider: "Open Library",
    status: "ready",
  };
}
export async function enrichMetadata(input: string): Promise<Partial<Source>> {
  const source = identifySource(input);
  if (!source)
    throw new Error("Enter a valid DOI, arXiv identifier, ISBN, or web URL.");
  if (source.kind === "url")
    return { status: "partial", retrievedAt: new Date().toISOString() };
  const old = cache.get(source.canonical);
  if (old && old.until > Date.now()) return old.value;
  if (pending.has(source.canonical)) return pending.get(source.canonical)!;
  const run = (async () => {
    let url = "",
      hosts: string[] = [];
    if (source.kind === "doi") {
      url =
        "https://api.crossref.org/works/" +
        encodeURIComponent(source.canonical.slice("https://doi.org/".length));
      if (process.env.CROSSREF_CONTACT_EMAIL)
        url +=
          "?mailto=" + encodeURIComponent(process.env.CROSSREF_CONTACT_EMAIL);
      hosts = ["api.crossref.org"];
    } else if (source.kind === "arxiv") {
      url =
        "https://export.arxiv.org/api/query?id_list=" +
        encodeURIComponent(
          source.canonical.slice("https://arxiv.org/abs/".length),
        );
      hosts = ["export.arxiv.org"];
    } else {
      url =
        "https://openlibrary.org/api/books?bibkeys=ISBN:" +
        source.canonical.slice(5) +
        "&format=json&jscmd=data";
      hosts = ["openlibrary.org"];
    }
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await guardedFetch(url, {
        allowedHosts: hosts,
        maxBytes: 1024 * 1024,
      });
      if (response.status !== 429 && response.status < 500) break;
      const retry = Number(response.headers["retry-after"]);
      const delay =
        Number.isFinite(retry) && retry > 0
          ? Math.min(retry * 1000, 10000)
          : 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
    if (!response || response.status >= 400)
      throw new Error(
        response?.status === 429
          ? "Metadata provider is rate limiting requests. Retry later."
          : "Metadata unavailable. The original source is retained; edit it manually or retry.",
      );
    const result =
      source.kind === "doi"
        ? crossrefMetadata(JSON.parse(response.text))
        : source.kind === "arxiv"
          ? arxivMetadata(response.text)
          : bookMetadata(
              JSON.parse(response.text),
              "ISBN:" + source.canonical.slice(5),
            );
    const value = Object.fromEntries(
      Object.entries({
        ...result,
        retrievedAt: new Date().toISOString(),
      }).filter(([, v]) => v !== undefined),
    ) as Partial<Source>;
    if (cache.size > 1000) cache.clear();
    cache.set(source.canonical, { until: Date.now() + 86400000, value });
    return value;
  })();
  pending.set(source.canonical, run);
  try {
    return await run;
  } finally {
    pending.delete(source.canonical);
  }
}
