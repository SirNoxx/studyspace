import type { Note } from "./model";
import { studyCodeBlocks } from "./code-blocks";
import { moduleText } from "./modules";
export interface NoteTranscript {
  id: string;
  url: string;
  title: string;
  text: string;
  status: "pending" | "ready" | "error";
  error?: string;
  jobToken?: string;
  language?: string;
}
export function youtubeVideoId(input: string): string | undefined {
  try {
    const url = new URL(input);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return;
    let id: string | null | undefined;
    if (["youtu.be", "www.youtu.be"].includes(url.hostname))
      id = url.pathname.slice(1);
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(url.hostname)
    ) {
      id =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : undefined;
  } catch {
    return;
  }
}
export function noteTranscripts(
  note: Pick<Note, "metadata">,
): NoteTranscript[] {
  const values = note.metadata?.youtubeTranscripts;
  if (!Array.isArray(values)) return [];
  return values.filter(
    (t): t is NoteTranscript =>
      !!t &&
      typeof t.id === "string" &&
      typeof t.url === "string" &&
      !!youtubeVideoId(t.url) &&
      typeof t.title === "string" &&
      typeof t.text === "string" &&
      ["pending", "ready", "error"].includes(t.status),
  );
}
export function noteStudyText(note: Pick<Note, "body" | "metadata">): string {
  let body = note.body;
  for (const block of studyCodeBlocks(body).reverse())
    if (block.language === "module")
      body =
        body.slice(0, block.from) +
        (block.title ? block.title + "\n" : "") +
        moduleText(block.code) +
        body.slice(block.to);
  return [
    body,
    ...noteTranscripts(note)
      .filter((t) => t.status === "ready" && t.text)
      .map((t) => `Transcript for ${t.title}\n${t.text}`),
  ].join("\n\n");
}
