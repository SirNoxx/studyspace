import * as Y from "yjs";
import type { Workspace, Attachment } from "../model";
import {
  encode,
  fromBase64,
  toBase64,
  readWorkspace,
  writeWorkspace,
  noteText,
  localOrigin,
} from "./document";
export class SharedSession {
  readonly doc = new Y.Doc();
  private pending: Uint8Array[] = [];
  private flight: Uint8Array[] = [];
  private draftId = crypto.randomUUID();
  private recovered = new Map<string, string>();
  private listeners = new Set<(workspace: Workspace) => void>();
  private statuses = new Set<(message: string) => void>();
  private notices = new Set<(message: string) => void>();
  onNotice = (fn: (message: string) => void) => {
    this.notices.add(fn);
    return () => {
      this.notices.delete(fn);
    };
  };
  private timer?: ReturnType<typeof setTimeout>;
  private busy?: Promise<void>;
  private stopped = false;
  private revision = 0;
  private role = "viewer";
  private personal: Workspace;
  private abort = new AbortController();
  error = "";
  constructor(
    readonly id: string,
    public account: string,
    personal: Workspace,
    readonly exit: () => void,
    readonly members: () => void,
  ) {
    this.personal = structuredClone(personal);
  }
  get unsaved() {
    return this.pending.length > 0 || this.flight.length > 0;
  }
  get readOnly() {
    return this.role === "viewer" || !!this.error;
  }
  get draftKey() {
    return this.key + ":draft:" + this.draftId;
  }
  get key() {
    return `studyspace:shared-live:${this.account}:${this.id}`;
  }
  text = (id: string) => noteText(this.doc, id);
  private status(message: string) {
    for (const fn of this.statuses) fn(message);
  }
  onStatus = (fn: (message: string) => void) => {
    this.statuses.add(fn);
    return () => {
      this.statuses.delete(fn);
    };
  };
  subscribe = (fn: (workspace: Workspace) => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => readWorkspace(this.doc, this.personal);
  async initial() {
    return this.snapshot();
  }
  private publish() {
    for (const fn of this.listeners) fn(this.snapshot());
  }
  private async fetchDocument() {
    for (let attempt = 0; attempt < 4; attempt++) {
      let value: any,
        state = "",
        offset = 0,
        revision: number | undefined;
      while (true) {
        const response = await fetch(
          `/api/shared/live?id=${this.id}&offset=${offset}`,
          { cache: "no-store", signal: this.abort.signal },
        );
        value = await response.json();
        if (!response.ok) throw Error(value.error);
        if (value.state) return value; // Older compatible servers and development fixtures.
        if (revision !== undefined && revision !== value.revision) break;
        revision = value.revision;
        if (
          typeof value.part !== "string" ||
          value.offset !== offset ||
          value.length > 28000000 ||
          (!value.part.length && offset < value.length)
        )
          throw Error("Shared download was incomplete. Please retry.");
        state += value.part;
        offset = state.length;
        if (offset === value.length) return { ...value, state };
      }
    }
    throw Error("This collection changed during download. Please reopen it.");
  }
  async load() {
    const value = await this.fetchDocument();
    if (typeof value.viewer === "string") this.account = value.viewer;
    try {
      const preferences = localStorage.getItem(this.key + ":personal");
      if (preferences) {
        const parsed = JSON.parse(preferences);
        for (const key of [
          "settings",
          "ai",
          "bookmarks",
          "progress",
          "notifications",
          "publications",
          "copies",
        ] as const)
          if (parsed[key]) (this.personal[key] as unknown) = parsed[key];
      }
    } catch {}
    this.role = value.role;
    this.revision = value.revision;
    Y.applyUpdate(this.doc, fromBase64(value.state), "remote");
    try {
      if (this.role !== "viewer")
        for (const key of Object.keys(localStorage).filter((key) =>
          key.startsWith(this.key + ":draft:"),
        )) {
          const saved = localStorage.getItem(key);
          if (!saved) continue;
          const update = fromBase64(saved);
          Y.applyUpdate(this.doc, update, "recovery");
          this.pending.push(update);
          this.recovered.set(key, saved);
        }
      if (this.pending.length)
        localStorage.setItem(
          this.draftKey,
          toBase64(Y.mergeUpdates(this.pending)),
        );
    } catch {
      this.status("Some recovery data could not be loaded.");
    }
    this.doc.on("update", this.updated);
    this.schedule(0);
  }
  private updated = (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") {
      this.pending.push(update);
      this.status("Syncing with collaborators…");
      try {
        localStorage.setItem(
          this.draftKey,
          toBase64(Y.mergeUpdates([...this.flight, ...this.pending])),
        );
      } catch {
        this.status(
          "Recovery storage is full. Keep this window open until synced.",
        );
      }
      this.schedule(120);
    }
    if (
      origin !== localOrigin &&
      !(typeof origin === "object" && origin !== null && "ytext" in origin)
    )
      this.publish();
  };
  change = (next: Workspace, previous: Workspace) => {
    if (this.readOnly)
      throw Error(this.error || "You have viewer access to this collection.");
    // Account preferences, AI chats and personal progress never enter the shared document.
    this.personal = { ...next };
    writeWorkspace(this.doc, next, previous);
    try {
      localStorage.setItem(
        this.key + ":personal",
        JSON.stringify(
          Object.fromEntries(
            [
              "settings",
              "ai",
              "bookmarks",
              "progress",
              "notifications",
              "publications",
              "copies",
            ].map((key) => [key, next[key as keyof Workspace]]),
          ),
        ),
      );
    } catch {
      this.status("Personal preferences could not be saved on this device.");
    }
  };
  private schedule(delay = 400) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync().catch(() => {}), delay);
  }
  private async exchange() {
    const sending = this.pending;
    this.flight = sending;
    this.pending = [];
    try {
      const response = await fetch(
        sending.length
          ? "/api/shared/live"
          : `/api/shared/live?id=${this.id}&revision=${this.revision}&vector=${encodeURIComponent(toBase64(Y.encodeStateVector(this.doc)))}`,
        {
          method: sending.length ? "POST" : "GET",
          cache: "no-store",
          signal: this.abort.signal,
          ...(sending.length
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: this.id,
                  update: toBase64(Y.mergeUpdates(sending)),
                  vector: toBase64(Y.encodeStateVector(this.doc)),
                }),
              }
            : {}),
        },
      );
      let value = await response.json();
      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          this.role = "viewer";
          this.error =
            value.error +
            (this.unsaved
              ? " Your unsent changes are retained on this device for recovery if access is restored."
              : "");
          this.pending = [...sending, ...this.pending];
          this.stopped = true;
          this.status(this.error);
          this.publish();
        }
        throw Error(value.error);
      }
      if (value.notice) for (const fn of this.notices) fn(value.notice);
      if (value.reload) value = { ...value, ...(await this.fetchDocument()) };
      const changedRole = this.role !== value.role;
      this.role = value.role;
      this.revision = value.revision;
      if (changedRole) this.publish();
      if (value.state)
        Y.applyUpdate(this.doc, fromBase64(value.state), "remote");
      this.flight = [];
      if (sending.length) {
        for (const [key, saved] of this.recovered)
          if (localStorage.getItem(key) === saved) localStorage.removeItem(key);
        this.recovered.clear();
      }
      if (this.pending.length)
        localStorage.setItem(
          this.draftKey,
          toBase64(Y.mergeUpdates([...this.flight, ...this.pending])),
        );
      else localStorage.removeItem(this.draftKey);
      this.status(
        this.pending.length
          ? "Syncing with collaborators…"
          : "Live · all changes saved",
      );
    } catch (e) {
      this.flight = [];
      if (!this.stopped) {
        this.pending = [...sending, ...this.pending];
        this.status(
          navigator.onLine
            ? "Sync interrupted · retrying"
            : "Offline · changes kept on this device",
        );
      }
      throw e;
    }
  }
  sync = () => {
    if (this.stopped)
      return this.error ? Promise.reject(Error(this.error)) : Promise.resolve();
    if (this.busy) return this.busy;
    this.busy = this.exchange().finally(() => {
      this.busy = undefined;
      this.schedule(navigator.onLine ? 400 : 2000);
    });
    return this.busy;
  };
  flush = async () => {
    await this.sync();
    while (this.pending.length) await this.sync();
    return this.revision;
  };
  async upload(file: File): Promise<Attachment> {
    const bytes = await file.arrayBuffer();
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const response = await fetch("/api/shared/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection: this.id,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        hash,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    const uploaded = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!uploaded.ok) throw Error("Attachment upload failed. Please retry.");
    return data.asset;
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.doc.off("update", this.updated);
    this.doc.destroy();
  }
}
