"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Copy, Download, MessageCircle } from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import { type Note, type Workspace, now } from "@/lib/model";
import { saveNote } from "@/lib/domain";
import {
  noteTranscripts,
  youtubeVideoId,
  type NoteTranscript,
} from "@/lib/transcripts";
import { Modal } from "./ui";

export function useTranscriptImport(
  getWorkspace: () => Workspace | null | undefined,
  mutate: AppContext["mutate"],
  toast: AppContext["toast"],
) {
  const context = useRef({ getWorkspace, mutate, toast });
  context.current = { getWorkspace, mutate, toast };
  const requests = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
    },
    [],
  );
  return async (input: string, noteId: string, retry = false) => {
    const id = youtubeVideoId(input);
    if (!id) return;
    const note = context.current
      .getWorkspace()
      ?.notes.find((n) => n.id === noteId && !n.trashed);
    if (!note || requests.current.has(noteId + id)) return;
    const existing = noteTranscripts(note).find((t) => t.id === id);
    if (existing && !retry) return;
    if (!existing && noteTranscripts(note).length >= 20) {
      context.current.toast("This note already has 20 transcripts.");
      return;
    }
    const controller = new AbortController();
    requests.current.set(noteId + id, controller);
    const patch = (fields: Partial<NoteTranscript>) =>
      context.current.mutate((w) => {
        const current = w.notes.find((n) => n.id === noteId && !n.trashed);
        if (!current || controller.signal.aborted) return;
        const values = noteTranscripts(current);
        const index = values.findIndex((t) => t.id === id);
        // Manual import while a provider job runs takes precedence over late results.
        if (
          index >= 0 &&
          values[index].status === "ready" &&
          fields.status !== "pending"
        )
          return;
        const next = {
          id,
          url: "https://www.youtube.com/watch?v=" + id,
          title: "YouTube video " + id,
          text: "",
          status: "pending" as const,
          ...(index >= 0 ? values[index] : {}),
          ...fields,
        };
        if (index >= 0) values[index] = next;
        else values.push(next);
        current.metadata = { ...current.metadata, youtubeTranscripts: values };
        current.revision += 1;
        current.updatedAt = now();
      });
    patch({ status: "pending", error: undefined });
    let token = existing?.jobToken;
    try {
      for (let attempt = 0; attempt < 60; attempt++) {
        const response = await fetch("/api/transcripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: input, jobToken: token }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          patch({
            ...(typeof data.title === "string" ? { title: data.title } : {}),
            error: data.error ?? "Transcript import failed.",
            status: "error",
            ...(data.restart ? { jobToken: undefined } : {}),
          });
          return;
        }
        patch(data);
        if (data.status === "ready") return;
        if (!data.jobToken)
          throw new Error("The provider did not return a transcript job.");
        token = data.jobToken;
        await new Promise<void>((resolve, reject) => {
          const cancelled = () => {
            clearTimeout(timer);
            reject(new Error("Cancelled"));
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener("abort", cancelled);
            resolve();
          }, 3000);
          controller.signal.addEventListener("abort", cancelled, {
            once: true,
          });
        });
      }
      patch({
        status: "error",
        error:
          "This video is still processing. Choose Continue import to check again.",
      });
    } catch (error) {
      if (!controller.signal.aborted)
        patch({ status: "error", error: (error as Error).message });
    } finally {
      requests.current.delete(noteId + id);
    }
  };
}

export default function NoteTranscripts({
  ctx,
  note,
  onImport,
}: {
  ctx: AppContext;
  note: Note;
  onImport: (url: string, noteId: string, retry?: boolean) => void;
}) {
  const [opened, setOpened] = useState("");
  const [draft, setDraft] = useState(""),
    [title, setTitle] = useState(""),
    [message, setMessage] = useState("");
  const values = noteTranscripts(note),
    active = values.find((t) => t.id === opened);
  const open = (item: NoteTranscript) => {
    setOpened(item.id);
    setDraft(item.text);
    setTitle(item.title);
    setMessage("");
  };
  if (!values.length) return null;
  return (
    <div className="note-transcripts">
      {values.map((item) => (
        <button
          key={item.id}
          className="transcript-link"
          onClick={() => open(item)}
        >
          <FileText size={16} />
          <span>
            Transcript for {item.title}
            <small>
              {item.status === "pending"
                ? "Transcribing…"
                : item.status === "error"
                  ? "Open to finish import"
                  : "Open transcript"}
            </small>
          </span>
        </button>
      ))}
      {active && (
        <Modal
          title={"Transcript for " + active.title}
          description="Read, copy, or reuse this video's transcript."
          wide
          onClose={() => setOpened("")}
        >
          <a href={active.url} target="_blank" rel="noopener noreferrer">
            Watch video on YouTube
          </a>
          {active.status === "pending" && (
            <p role="status">
              Transcribing the video. You can keep writing while it loads.
            </p>
          )}
          {active.error && <p role="status">{active.error}</p>}
          {active.text ? (
            <>
              <pre className="transcript-text" tabIndex={0}>
                {active.text}
              </pre>
              <div className="transcript-actions">
                <button
                  className="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(active.text);
                    setMessage("Transcript copied.");
                  }}
                >
                  <Copy size={14} />
                  Copy
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([active.text], { type: "text/plain" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download =
                      active.title.replace(/[<>:"/\\|?*]/g, "-").slice(0, 100) +
                      ".txt";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Download size={14} />
                  Download
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    ctx.openChat(active.text, note.id);
                    setOpened("");
                  }}
                >
                  <MessageCircle size={14} />
                  Add to Chat
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    ctx.mutate((w) => {
                      const n = w.notes.find((n) => n.id === note.id);
                      if (n)
                        saveNote(w, n.id, n.revision, {
                          body:
                            n.body +
                            "\n\n## Transcript for " +
                            active.title +
                            "\n\n" +
                            active.text +
                            "\n",
                        });
                    });
                    setMessage("Transcript added to the end of this note.");
                  }}
                >
                  Add text to note
                </button>
              </div>
            </>
          ) : (
            <div className="transcript-manual">
              <button
                className="secondary"
                onClick={() => onImport(active.url, note.id, true)}
              >
                {active.jobToken
                  ? "Continue import"
                  : "Retry automatic transcript"}
              </button>
              <label className="field">
                Video title
                <input
                  aria-label="Video title"
                  value={title}
                  maxLength={240}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field">
                Paste transcript
                <textarea
                  aria-label="Paste transcript"
                  rows={8}
                  value={draft}
                  maxLength={200000}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </label>
              <label className="field">
                Or import transcript file
                <input
                  aria-label="Import transcript file"
                  type="file"
                  accept=".txt,.vtt,.srt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 800000) {
                      setMessage(
                        "Choose a transcript under 200,000 characters.",
                      );
                      return;
                    }
                    const text = await file.text();
                    if (text.length > 200000) {
                      setMessage(
                        "Choose a transcript under 200,000 characters.",
                      );
                      return;
                    }
                    setDraft(text);
                  }}
                />
              </label>
              <button
                className="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  ctx.mutate((w) => {
                    const n = w.notes.find((n) => n.id === note.id);
                    if (!n) return;
                    n.metadata = {
                      ...n.metadata,
                      youtubeTranscripts: noteTranscripts(n).map((t) =>
                        t.id === active.id
                          ? {
                              ...t,
                              title: title.trim() || t.title,
                              text: draft,
                              status: "ready",
                              error: undefined,
                              jobToken: undefined,
                            }
                          : t,
                      ),
                    };
                    n.revision += 1;
                    n.updatedAt = now();
                  });
                  setMessage("Transcript saved.");
                }}
              >
                Save transcript
              </button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
        </Modal>
      )}
    </div>
  );
}
