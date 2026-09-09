"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
import { produce } from "immer";
import {
  BookOpen,
  Library,
  Search,
  Bookmark,
  CalendarDays,
  Layers,
  Compass,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  FileText,
  FolderPlus,
  PanelLeftClose,
  PanelRightClose,
  PanelLeftOpen,
  PanelRightOpen,
  MoreHorizontal,
  X,
  Check,
  Cloud,
  CloudOff,
  Maximize2,
  Minimize2,
  Code2,
  Eye,
  PenLine,
  Upload,
  Download,
  Trash2,
  History,
  Copy,
  FolderInput,
  Pin,
  Link,
  Globe,
  Lock,
  Command,
  BookA,
  Link2,
  List,
  MessageSquare,
  Sparkles,
  Hash,
  ArrowUpDown,
  Sun,
  Moon,
  Feather,
  Bell,
  LogOut,
  RotateCcw,
  Archive,
  ExternalLink,
  AlertCircle,
  Paperclip,
} from "lucide-react";
import {
  type Workspace,
  type Note,
  type Container,
  type Theme,
  uid,
  now,
  general,
  ancestry,
  rootOf,
  subjectOf,
  contextDefinitions,
  inContainer,
} from "@/lib/model";
import {
  createContainer,
  createNote,
  saveNote,
  moveItems,
  trashItems,
  duplicateItem,
  captureJournal,
  addReview,
} from "@/lib/domain";
import {
  loadLocal,
  persistLocal,
  saveRemote,
  localDB,
  saveDraft,
  clearAccountCache,
} from "@/lib/store";
import { sampleWorkspace } from "@/lib/demo";
import { resolveLink } from "@/lib/markdown";
import { exportWorkspace, downloadBytes } from "@/lib/transfer";
import { browserClient } from "@/lib/supabase/browser";
import { IconButton, SymbolIcon, Menu, Empty } from "./ui";
import Markdown from "./Markdown";
import type { EditorHandle } from "./Editor";
import Dialogs from "./WorkspaceDialogs";
import Inspector from "./Inspector";
import WorkspaceViews from "./WorkspaceViews";
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <div className="muted">Opening editor…</div>,
});
export type Mutate = (
  fn: (w: Workspace) => void,
  message?: string,
  deferRender?: boolean,
) => void;
export type DialogState = {
  type: string;
  id?: string;
  parentId?: string;
  value?: string;
  [key: string]: unknown;
} | null;
export interface AppContext {
  w: Workspace;
  mutate: Mutate;
  demo: boolean;
  account: string;
  active?: Note;
  focus: string | null;
  setFocus: (id: string | null) => void;
  openNote: (id: string, newTab?: boolean) => void;
  setDialog: (dialog: DialogState) => void;
  setView: (view: string) => void;
  toast: (message: string) => void;
  recoverDraft: (draft?: Workspace) => Promise<void>;
  signOut: () => Promise<void>;
  selection: string;
  editor: React.MutableRefObject<EditorHandle | null>;
  attach: (files: File[]) => Promise<void>;
  exportData: (options?: {
    containerId?: string;
    noteId?: string;
    full?: boolean;
  }) => Promise<void>;
}
const ribbon = [
  { id: "collections", label: "Collections", icon: Library },
  { id: "search", label: "Search", icon: Search },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "journal", label: "Journal", icon: CalendarDays },
  { id: "review", label: "Review", icon: Layers },
  { id: "discover", label: "Discover", icon: Compass },
];
const inspectorTabs = [
  { id: "dictionary", label: "Dictionary", icon: BookA },
  { id: "sources", label: "Sources", icon: Link2 },
  { id: "outline", label: "Outline", icon: List },
  { id: "backlinks", label: "Backlinks", icon: Link },
  { id: "annotations", label: "Annotations & Q&A", icon: MessageSquare },
  { id: "ai", label: "AI Study Guide", icon: Sparkles },
];
export default function WorkspaceApp({
  demo = false,
  account,
}: {
  demo?: boolean;
  account: string;
}) {
  const [w, setW] = useState<Workspace | null>(null),
    wRef = useRef<Workspace | null>(null),
    savedBase = useRef<Workspace | null>(null),
    [loadingError, setLoadingError] = useState("");
  const [activeId, setActiveId] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [pinned, setPinned] = useState<string[]>([]),
    [closedTabs, setClosedTabs] = useState<string[]>([]),
    [focus, setFocusState] = useState<string | null>(null),
    [expanded, setExpanded] = useState<string[]>([]),
    [view, setViewState] = useState("collections"),
    [inspector, setInspector] = useState("dictionary"),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(true),
    [zen, setZen] = useState(false),
    [leftWidth, setLeftWidth] = useState(276),
    [rightWidth, setRightWidth] = useState(318),
    [mode, setMode] = useState<"source" | "live" | "reading">("live"),
    [dialog, setDialogState] = useState<DialogState>(null),
    [selection, setSelection] = useState(""),
    [saveStatus, setSaveStatus] = useState("Opening workspace…"),
    [notice, setNotice] = useState(""),
    [sort, setSort] = useState("manual"),
    [treeQuery, setTreeQuery] = useState(""),
    [treePages, setTreePages] = useState<Record<string, number>>({}),
    [selected, setSelected] = useState<string[]>([]),
    [conflict, setConflict] = useState(false),
    [recovery, setRecovery] = useState<Workspace | null>(null),
    [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      id: string;
    } | null>(null);
  const editor = useRef<EditorHandle | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saving = useRef(false),
    conflictRef = useRef(false),
    pending = useRef(false),
    loaded = useRef(false),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    scrolls = useRef(new Map<string, number>()),
    scroller = useRef<HTMLDivElement>(null);
  const activeContainer = w?.notes.find((n) => n.id === activeId)?.containerId;
  const flushRender = () => {
    if (renderTimer.current) {
      clearTimeout(renderTimer.current);
      renderTimer.current = null;
      if (wRef.current) setW(wRef.current);
    }
  };
  const setDialog = (value: DialogState) => {
    flushRender();
    setDialogState(value);
  };
  const definitionsForNote = useMemo(
    () => (w && activeContainer ? contextDefinitions(w, activeContainer) : []),
    [w?.definitions, w?.containers, activeContainer],
  );
  const toast = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }, []);
  const setView = (v: string) => {
    setViewState(v);
    if (innerWidth < 800) setLeft(false);
    history.pushState(
      {},
      "",
      `/${demo ? "demo" : "w"}/${v === "collections" ? "" : v}`,
    );
  };
  const setFocus = (id: string | null) => {
    setFocusState(id);
    setViewState("collections");
    if (id) setExpanded((old) => [...new Set([...old, id])]);
    history.pushState(
      {},
      "",
      `/${demo ? "demo" : "w"}${id ? "/collection/" + id : ""}`,
    );
  };
  const openNote = useCallback(
    (id: string, newTab = true) => {
      if (renderTimer.current) {
        clearTimeout(renderTimer.current);
        renderTimer.current = null;
        setW(wRef.current);
      }
      if (!wRef.current?.notes.some((n) => n.id === id && !n.trashed)) return;
      if (scroller.current)
        scrolls.current.set(activeId, scroller.current.scrollTop);
      setActiveId(id);
      setTabs((old) =>
        old.includes(id)
          ? old
          : newTab
            ? [...old, id]
            : [...old.slice(0, -1), id],
      );
      setViewState("collections");
      setSelection("");
      if (innerWidth < 800) setLeft(false);
      history.pushState({}, "", `/${demo ? "demo" : "w"}/note/${id}`);
      requestAnimationFrame(() => {
        if (scroller.current)
          scroller.current.scrollTop = scrolls.current.get(id) ?? 0;
      });
    },
    [activeId, demo],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = demo
          ? await loadLocal(
              new URLSearchParams(location.search).get("sample") === "1",
            )
          : await fetch("/api/workspace").then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              return d as Workspace;
            });
        const db = await localDB();
        const nav = await db.get("navigation", account + ":layout");
        const recovered = (await db.get("drafts", account + ":workspace")) as
          Workspace | undefined;
        if (cancelled) return;
        wRef.current = state;
        savedBase.current = state;
        setW(state);
        setMode(state.settings.defaultMode);
        if (nav) {
          setFocusState(nav.focus);
          setExpanded(nav.expanded ?? []);
          setTabs(
            (nav.tabs ?? []).filter((id: string) =>
              state.notes.some((n) => n.id === id && !n.trashed),
            ),
          );
          setActiveId(nav.activeId ?? "");
          setLeftWidth(nav.leftWidth ?? 276);
          setRightWidth(nav.rightWidth ?? 318);
          setPinned(nav.pinned ?? []);
        }
        const path = location.pathname.split("/");
        if (path[2] === "note" && state.notes.some((n) => n.id === path[3])) {
          setActiveId(path[3]);
          setTabs((t) => [...new Set([...t, path[3]])]);
        } else if (path[2] === "collection") setFocusState(path[3]);
        else if (path[2]) setViewState(path[2]);
        if (!nav && state.notes.length) {
          const n = state.notes[0];
          setActiveId(n.id);
          setTabs([n.id]);
          setExpanded(ancestry(state, n.containerId).map((c) => c.id));
        }
        if (
          recovered &&
          JSON.stringify({ ...recovered, revision: 0 }) !==
            JSON.stringify({ ...state, revision: 0 })
        )
          setRecovery(recovered);
        setSaveStatus(demo ? "Saved on this device" : "Saved to cloud");
        if (innerWidth < 800) {
          setLeft(false);
          setRight(false);
        }
        loaded.current = true;
      } catch (e) {
        setLoadingError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, account]);
  const persist = useCallback(async () => {
    if (
      saving.current ||
      conflictRef.current ||
      !pending.current ||
      !wRef.current
    )
      return;
    saving.current = true;
    pending.current = false;
    const snapshot = wRef.current;
    setSaveStatus(demo ? "Saving on this device…" : "Saving…");
    try {
      const revision = demo
        ? await persistLocal(snapshot, snapshot.revision)
        : await saveRemote(
            snapshot,
            snapshot.revision,
            savedBase.current ?? undefined,
          );
      savedBase.current = { ...snapshot, revision };
      if (wRef.current) {
        wRef.current = { ...wRef.current, revision };
        setW(wRef.current);
      }
      if (!pending.current) {
        setSaveStatus(demo ? "Saved on this device" : "Saved to cloud");
        await (await localDB()).delete("drafts", account + ":workspace");
      } else await saveDraft(account, "workspace", wRef.current);
    } catch (e) {
      pending.current = true;
      const msg = (e as Error).message;
      if (msg === "CONFLICT") {
        conflictRef.current = true;
        setConflict(true);
        setSaveStatus("Conflict · draft retained");
      } else
        setSaveStatus(
          navigator.onLine
            ? "Save failed · draft retained"
            : "Offline · draft retained",
        );
      toast(
        msg === "CONFLICT"
          ? "Another session saved changes. Your draft is retained."
          : msg,
      );
    } finally {
      saving.current = false;
      if (pending.current && !conflictRef.current)
        saveTimer.current = setTimeout(() => {
          if (!saving.current && navigator.onLine) void persist();
        }, 3000);
    }
  }, [demo, account, toast, conflict]);
  const mutate: Mutate = useCallback(
    (fn, message, deferRender = false) => {
      if (!wRef.current) return;
      try {
        const next = produce(wRef.current, (draft) => {
          fn(draft as Workspace);
        });
        wRef.current = next;
        if (renderTimer.current) clearTimeout(renderTimer.current);
        if (deferRender)
          renderTimer.current = setTimeout(() => {
            setW(wRef.current);
            renderTimer.current = null;
          }, 120);
        else setW(next);
        pending.current = true;
        setSaveStatus(demo ? "Saving on this device…" : "Saving…");
        if (draftTimer.current) clearTimeout(draftTimer.current);
        draftTimer.current = setTimeout(() => {
          void saveDraft(account, "workspace", wRef.current).catch(() =>
            toast("Device recovery storage is full. Export your work."),
          );
        }, 250);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void persist(), 700);
        if (message) toast(message);
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [account, persist, toast, demo],
  );
  useEffect(() => {
    if (!loaded.current) return;
    void localDB().then((db) =>
      db.put(
        "navigation",
        { focus, expanded, tabs, activeId, leftWidth, rightWidth, pinned },
        account + ":layout",
      ),
    );
  }, [focus, expanded, tabs, activeId, leftWidth, rightWidth, pinned, account]);
  useEffect(() => {
    if (!w) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        w.settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : w.settings.theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [w?.settings.theme]);
  useEffect(() => {
    const back = () => {
      const parts = location.pathname.split("/");
      if (parts[2] === "note") {
        setActiveId(parts[3]);
        setTabs((t) => [...new Set([...t, parts[3]])]);
        setViewState("collections");
      } else if (parts[2] === "collection") {
        setFocusState(parts[3]);
        setViewState("collections");
      } else setViewState(parts[2] || "collections");
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        if (dialog) setDialog(null);
        else if (zen) setZen(false);
        else if (innerWidth < 800) {
          setRight(false);
          setLeft(false);
        }
        return;
      }
      const key =
        (e.ctrlKey || e.metaKey ? "Mod+" : "") +
        (e.shiftKey ? "Shift+" : "") +
        e.key.toLowerCase();
      const binding = Object.entries(
        wRef.current?.settings.shortcuts ?? {},
      ).find(([, v]) => v.toLowerCase() === key.toLowerCase())?.[0];
      if (!binding) return;
      e.preventDefault();
      if (binding === "zen") setZen((v) => !v);
      else if (binding === "search") setViewState("search");
      else setDialog({ type: binding === "quick" ? "quick" : binding });
    };
    document.addEventListener("keydown", listener);
    const online = () => void persist();
    window.addEventListener("online", online);
    const unload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("keydown", listener);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dialog, zen, persist]);
  const active = w?.notes.find((n) => n.id === activeId && !n.trashed),
    focused = w?.containers.find((c) => c.id === focus && !c.trashed),
    activeRoot = active && w ? rootOf(w, active.containerId) : undefined;
  const closeTab = (id: string) => {
    setClosedTabs((old) => [...old, id]);
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next.at(-1) ?? "");
  };
  const addNote = (parentId?: string) => {
    let id = "";
    mutate((s) => {
      id = createNote(s, parentId ?? focus ?? general(s).id).id;
    });
    openNote(id);
  };
  const exportData = async (
    options: { containerId?: string; noteId?: string; full?: boolean } = {},
  ) => {
    if (!wRef.current) return;
    try {
      if (!demo && !options.noteId) {
        const r = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "export",
            payload: { containerId: options.containerId, full: !!options.full },
            idempotencyKey: uid(),
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setView("jobs");
        toast("Export queued. Download it when the worker finishes.");
        return;
      }
      toast("Preparing portable export…");
      const bytes = await exportWorkspace(wRef.current, {
        ...options,
        loadAsset: async (a) => {
          if (demo) {
            const blob = (await (await localDB()).get("assets", a.id)) as
              Blob | undefined;
            if (!blob) throw new Error("Missing attachment: " + a.filename);
            return new Uint8Array(await blob.arrayBuffer());
          }
          const response = await fetch(
            "/api/attachments/" +
              a.id +
              (options.full ? "?includeTrashed=1" : ""),
          );
          if (!response.ok)
            throw new Error("Attachment unavailable: " + a.filename);
          return new Uint8Array(await response.arrayBuffer());
        },
      });
      downloadBytes(
        bytes,
        "studyspace-" + new Date().toISOString().slice(0, 10) + ".zip",
      );
      toast("Export downloaded.");
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const attach = async (files: File[]) => {
    const n = wRef.current?.notes.find((n) => n.id === activeId);
    if (!n) {
      toast("Open a note before adding attachments.");
      return;
    }
    const { sha256 } = await import("@/lib/transfer");
    for (const file of files) {
      try {
        if (file.size > 50 * 1024 * 1024)
          throw new Error(file.name + " exceeds 50 MB.");
        if (!/\.(pdf|png|jpe?g|webp|gif|mp3|wav|mp4|md|txt)$/i.test(file.name))
          throw new Error("Unsupported attachment type.");
        toast("Uploading " + file.name + "…");
        const id = uid(),
          hash = await sha256(new Uint8Array(await file.arrayBuffer()));
        const key =
          account +
          "/" +
          id +
          "/" +
          file.name.replace(/[^\p{L}\p{N}._-]/gu, "_");
        if (demo) await (await localDB()).put("assets", file, id);
        else {
          const { error } = await browserClient()
            .storage.from("attachments")
            .upload(key, file, { contentType: file.type });
          if (error) throw error;
        }
        mutate((s) => {
          s.attachments.push({
            id,
            filename: file.name,
            mime: file.type,
            size: file.size,
            hash,
            key,
            createdAt: now(),
          });
          const note = s.notes.find((x) => x.id === n.id)!;
          saveNote(
            s,
            n.id,
            note.revision,
            { body: note.body + `\n[${file.name}](attachment:${id})\n` },
            "Attachment",
          );
        }, "Attachment added.");
      } catch (e) {
        toast((e as Error).message + " You can retry the upload.");
      }
    }
  };
  if (!w)
    return (
      <div className="loading-screen">
        <BookOpen size={32} />
        <h1>
          studyspace<span>.</span>
        </h1>
        <p>{loadingError || "Opening your workspace…"}</p>
        {loadingError && (
          <a href="/auth">Sign in or check your configuration</a>
        )}
      </div>
    );
  const ctx: AppContext = {
    w,
    mutate,
    demo,
    account,
    signOut: async () => {
      await persist();
      if (pending.current || saving.current || conflictRef.current)
        throw new Error(
          "Save or resolve your retained draft before signing out. Export it from the recovery dialog if needed.",
        );
      if (draftTimer.current) clearTimeout(draftTimer.current);
      await clearAccountCache(account);
      const { error } = await browserClient().auth.signOut();
      if (error) throw error;
      location.href = "/auth";
    },
    recoverDraft: async (draft) => {
      if (saving.current)
        throw new Error("Wait for the current save to finish.");
      const latest = demo
        ? await loadLocal()
        : await fetch("/api/workspace").then(async (r) => {
            if (!r.ok)
              throw new Error("Saved workspace unavailable. Try again.");
            return r.json() as Promise<Workspace>;
          });
      const { recoverWorkspace } = await import("@/lib/recovery");
      const next = recoverWorkspace(latest, draft ?? wRef.current!);
      savedBase.current = latest;
      await saveDraft(account, "workspace", next);
      wRef.current = next;
      setW(next);
      conflictRef.current = false;
      setConflict(false);
      setRecovery(null);
      pending.current = true;
      await persist();
    },
    active,
    focus,
    setFocus,
    openNote,
    setDialog,
    setView,
    toast,
    selection,
    editor,
    attach,
    exportData,
  };
  const breadcrumb = active ? ancestry(w, active.containerId) : [];
  const itemActions = (id: string) => {
    const c = w.containers.find((c) => c.id === id),
      n = w.notes.find((n) => n.id === id);
    return [
      ...(c
        ? [
            { label: "New note", icon: FileText, action: () => addNote(id) },
            {
              label: "New folder",
              icon: FolderPlus,
              action: () =>
                setDialog({ type: "container", parentId: id, kind: "folder" }),
            },
            {
              label: "New subject",
              icon: BookOpen,
              action: () => setDialog({ type: "container", parentId: id }),
            },
            {
              label: "Add dictionary entry",
              icon: BookA,
              action: () => setDialog({ type: "definition", parentId: id }),
            },
            {
              label: "Add source",
              icon: Link2,
              action: () => setDialog({ type: "source", parentId: id }),
            },
            "separator" as const,
          ]
        : []),
      {
        label: "Rename",
        icon: PenLine,
        action: () =>
          setDialog({ type: "rename", id, value: c?.title ?? n?.title }),
      },
      ...(!c?.system
        ? [
            {
              label: "Move to…",
              icon: FolderInput,
              action: () => setDialog({ type: "move", id }),
            },
          ]
        : []),
      {
        label: "Duplicate",
        icon: Copy,
        action: () =>
          mutate((s) => {
            const copyId = duplicateItem(s, id);
            if (n) setTimeout(() => openNote(copyId), 0);
          }, "Copy created."),
      },
      {
        label: w.bookmarks.includes(id) ? "Remove bookmark" : "Bookmark",
        icon: Bookmark,
        action: () =>
          mutate((s) => {
            s.bookmarks = s.bookmarks.includes(id)
              ? s.bookmarks.filter((x) => x !== id)
              : [...s.bookmarks, id];
          }),
      },
      {
        label: "Search here",
        icon: Search,
        action: () => {
          if (c) setFocusState(id);
          setViewState("search");
        },
      },
      {
        label: "Copy internal link",
        icon: Link,
        action: () => {
          void navigator.clipboard.writeText(
            location.origin +
              `/${demo ? "demo" : "w"}/${c ? "collection" : "note"}/${id}`,
          );
          toast("Internal link copied.");
        },
      },
      "separator" as const,
      {
        label: "Export",
        icon: Download,
        action: () => void exportData(c ? { containerId: id } : { noteId: id }),
      },
      {
        label: "Publish…",
        icon: Globe,
        action: () => setDialog({ type: "publish", id, container: !!c }),
      },
      ...(!c?.system
        ? [
            {
              label: c?.archived || n?.archived ? "Unarchive" : "Archive",
              icon: Archive,
              action: () =>
                mutate((s) => {
                  const item =
                    s.containers.find((x) => x.id === id) ??
                    s.notes.find((x) => x.id === id);
                  if (item) item.archived = !item.archived;
                }),
            },
            {
              label: "Move to Trash",
              icon: Trash2,
              danger: true,
              action: () =>
                mutate(
                  (s) => trashItems(s, selected.includes(id) ? selected : [id]),
                  "Moved to Trash. Restore it from Settings → Data.",
                ),
            },
          ]
        : []),
    ];
  };
  const renderTree = (parentId: string | null, depth = 0): React.ReactNode => {
    const containers = w.containers.filter(
        (c) => c.parentId === parentId && !c.trashed && !c.archived,
      ),
      notes = w.notes.filter(
        (n) =>
          n.containerId === parentId &&
          !n.trashed &&
          !n.archived &&
          (!treeQuery ||
            n.title.toLowerCase().includes(treeQuery.toLowerCase())),
      );
    const sorted = <
      T extends { title: string; createdAt: string; updatedAt: string },
    >(
      arr: T[],
    ) =>
      [...arr].sort((a, b) =>
        sort === "name"
          ? a.title.localeCompare(b.title)
          : sort === "updated"
            ? b.updatedAt.localeCompare(a.updatedAt)
            : sort === "created"
              ? b.createdAt.localeCompare(a.createdAt)
              : 0,
      );
    return (
      <>
        {sorted(containers).map((c) => (
          <div key={c.id} className="tree-branch" role="none">
            <div
              role="treeitem"
              aria-expanded={expanded.includes(c.id)}
              aria-selected={selected.includes(c.id)}
              tabIndex={0}
              className={
                "tree-row container-row " +
                (c.parentId === null ? "root-row " : "") +
                (selected.includes(c.id) ? "selected " : "") +
                (w.settings.coloredRows ? "colored" : "")
              }
              style={
                {
                  "--collection-color": c.color,
                  paddingLeft: 12 + depth * 17,
                } as CSSProperties
              }
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: Math.min(e.clientX, innerWidth - 230),
                  y: Math.min(e.clientY, innerHeight - 450),
                  id: c.id,
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setFocus(c.id);
                if (e.key === "ArrowRight")
                  setExpanded((x) => [...new Set([...x, c.id])]);
                if (e.key === "ArrowLeft")
                  setExpanded((x) => x.filter((id) => id !== c.id));
                if (e.key === "F2")
                  setDialog({ type: "rename", id: c.id, value: c.title });
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const rows = [
                    ...document.querySelectorAll<HTMLElement>(
                      "[role=treeitem]",
                    ),
                  ];
                  rows[
                    rows.indexOf(e.currentTarget) +
                      (e.key === "ArrowDown" ? 1 : -1)
                  ]?.focus();
                }
              }}
              draggable={!c.system}
              onDragStart={(e) =>
                e.dataTransfer.setData("application/studyspace", c.id)
              }
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("application/studyspace");
                if (id) setDialog({ type: "move", id, destination: c.id });
              }}
            >
              <button
                className="disclosure"
                aria-label={
                  (expanded.includes(c.id) ? "Collapse " : "Expand ") + c.title
                }
                onClick={() =>
                  setExpanded((x) =>
                    x.includes(c.id)
                      ? x.filter((id) => id !== c.id)
                      : [...x, c.id],
                  )
                }
              >
                {expanded.includes(c.id) ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
              <SymbolIcon
                name={c.kind === "folder" ? "folder" : c.icon}
                size={16}
              />
              <button
                className="tree-title"
                title={"Focus " + c.title}
                onClick={() => setFocus(c.id)}
              >
                {c.title}
              </button>
              <Menu
                trigger={
                  <button
                    className="tree-more"
                    aria-label={"Actions for " + c.title}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                }
                items={itemActions(c.id)}
              />
            </div>
            {expanded.includes(c.id) && (
              <div role="group">{renderTree(c.id, depth + 1)}</div>
            )}
          </div>
        ))}
        {sorted(notes)
          .slice(
            (treePages[parentId ?? "root"] ?? 0) * 200,
            ((treePages[parentId ?? "root"] ?? 0) + 1) * 200,
          )
          .map((n) => (
            <div
              key={n.id}
              role="treeitem"
              aria-selected={activeId === n.id}
              tabIndex={0}
              className={
                "tree-row note-row " +
                (activeId === n.id ? "is-active " : "") +
                (selected.includes(n.id) ? "selected" : "")
              }
              style={{ paddingLeft: depth * 17 + 30 }}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey)
                  setSelected((s) =>
                    s.includes(n.id)
                      ? s.filter((id) => id !== n.id)
                      : [...s, n.id],
                  );
                else {
                  setSelected([n.id]);
                  openNote(n.id);
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) openNote(n.id, true);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: Math.min(e.clientX, innerWidth - 230),
                  y: Math.min(e.clientY, innerHeight - 380),
                  id: n.id,
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") openNote(n.id);
                if (e.key === "F2")
                  setDialog({ type: "rename", id: n.id, value: n.title });
                if (e.key === "Delete") mutate((s) => trashItems(s, [n.id]));
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const rows = [
                    ...document.querySelectorAll<HTMLElement>(
                      "[role=treeitem]",
                    ),
                  ];
                  rows[
                    rows.indexOf(e.currentTarget) +
                      (e.key === "ArrowDown" ? 1 : -1)
                  ]?.focus();
                }
              }}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData("application/studyspace", n.id)
              }
            >
              <FileText size={14} />
              <span className="tree-title">{n.title || "Untitled"}</span>
              {w.bookmarks.includes(n.id) && <Bookmark size={11} />}
            </div>
          ))}
        {notes.length > 200 && (
          <div className="tree-pagination" role="none">
            <button
              disabled={!(treePages[parentId ?? "root"] ?? 0)}
              onClick={() =>
                setTreePages((p) => ({
                  ...p,
                  [parentId ?? "root"]: Math.max(
                    0,
                    (p[parentId ?? "root"] ?? 0) - 1,
                  ),
                }))
              }
            >
              Previous
            </button>
            <span>
              {(treePages[parentId ?? "root"] ?? 0) + 1} /{" "}
              {Math.ceil(notes.length / 200)}
            </span>
            <button
              disabled={
                ((treePages[parentId ?? "root"] ?? 0) + 1) * 200 >= notes.length
              }
              onClick={() =>
                setTreePages((p) => ({
                  ...p,
                  [parentId ?? "root"]: (p[parentId ?? "root"] ?? 0) + 1,
                }))
              }
            >
              Next 200
            </button>
          </div>
        )}
      </>
    );
  };
  const resize = (side: "left" | "right", e: React.PointerEvent) => {
    const start = e.clientX,
      initial = side === "left" ? leftWidth : rightWidth;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const value = Math.min(
        side === "left" ? 420 : 520,
        Math.max(
          side === "left" ? 220 : 280,
          initial + (ev.clientX - start) * (side === "left" ? 1 : -1),
        ),
      );
      (side === "left" ? setLeftWidth : setRightWidth)(value);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className={
        "app-shell " +
        (zen ? "zen " : "") +
        (left ? "left-open " : "") +
        (right ? "right-open " : "")
      }
      style={
        {
          "--left-width": leftWidth + "px",
          "--right-width": rightWidth + "px",
          "--editor-size": w.settings.fontSize + "px",
          "--editor-line-height": w.settings.lineHeight,
          "--writing-font":
            w.settings.fontFamily === "serif"
              ? "Georgia, serif"
              : w.settings.fontFamily === "mono"
                ? "Consolas, monospace"
                : '"Segoe UI", system-ui, sans-serif',
        } as CSSProperties
      }
    >
      <nav className="activity-ribbon" aria-label="Main navigation">
        <a
          className="ribbon-brand"
          href={demo ? "/demo" : "/w"}
          title="Studyspace"
        >
          <BookOpen size={23} />
        </a>
        <div className="ribbon-main">
          {ribbon.map((item) => (
            <IconButton
              key={item.id}
              label={item.label}
              active={view === item.id}
              onClick={() => {
                if (item.id === "collections") {
                  setViewState("collections");
                  setLeft(true);
                } else setView(item.id);
              }}
            >
              <item.icon size={20} />
              {item.id === "review" &&
                w.review.some(
                  (r) => !r.suspended && r.schedule.due <= now(),
                ) && <span className="ribbon-dot" />}
            </IconButton>
          ))}
        </div>
        <div className="ribbon-bottom">
          <IconButton
            label="Inbox"
            active={view === "inbox"}
            onClick={() => setView("inbox")}
          >
            <Bell size={19} />
            {w.notifications.some((n) => !n.read) && (
              <span className="ribbon-dot" />
            )}
          </IconButton>
          <IconButton
            label="Settings"
            active={view === "settings"}
            onClick={() => setView("settings")}
          >
            <Settings size={19} />
          </IconButton>
          <button
            className="avatar"
            aria-label="Account settings"
            onClick={() => setView("settings")}
          >
            {w.settings.displayName.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </nav>
      {!zen && left && (
        <>
          <aside className="explorer" aria-label="Collection explorer">
            <header className="explorer-brand">
              <span className="brand">
                studyspace<span className="brand-dot">.</span>
              </span>
              <IconButton
                label="Collapse explorer"
                onClick={() => setLeft(false)}
              >
                <PanelLeftClose size={17} />
              </IconButton>
            </header>
            <button
              className="workspace-selector"
              onClick={() => setDialog({ type: "palette" })}
            >
              <span className="workspace-avatar">
                {w.settings.displayName.slice(0, 1)}
              </span>
              <span>
                My workspace
                <small>
                  {demo ? "Local demo · on this device" : "Private workspace"}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
            <div className="capture-actions">
              <button
                className="quick-note-button"
                aria-label="Quick note"
                onClick={() => setDialog({ type: "quick" })}
              >
                <Plus size={16} /> Quick note <kbd>⌘ / Ctrl</kbd>
              </button>
              <IconButton
                label="Import notes"
                onClick={() => setDialog({ type: "import" })}
              >
                <Upload size={16} />
              </IconButton>
            </div>
            <button
              className="explorer-search"
              onClick={() => setDialog({ type: "switcher" })}
            >
              <Search size={14} />
              <span>Find a note…</span>
              <kbd>Ctrl O</kbd>
            </button>
            <div className="tree-heading">
              {focused ? (
                <button
                  className="back-collections"
                  onClick={() => setFocus(null)}
                >
                  <ArrowLeft size={16} /> All Collections
                </button>
              ) : (
                <span>COLLECTIONS</span>
              )}
              <div className="inline-actions">
                <Menu
                  trigger={
                    <button className="icon-button" aria-label="Sort tree">
                      <ArrowUpDown size={14} />
                    </button>
                  }
                  items={["manual", "name", "created", "updated"].map(
                    (value) => ({
                      label:
                        (value === sort ? "✓ " : "") +
                        value[0].toUpperCase() +
                        value.slice(1),
                      action: () => setSort(value),
                    }),
                  )}
                />
                <IconButton
                  label="Create collection or subject"
                  onClick={() =>
                    setDialog({
                      type: "container",
                      parentId: focus ?? undefined,
                    })
                  }
                >
                  <Plus size={16} />
                </IconButton>
              </div>
            </div>
            {focused && (
              <div
                className="focused-collection"
                style={{ color: focused.color }}
              >
                <SymbolIcon name={focused.icon} size={19} />
                <strong>{focused.title}</strong>
                <Menu
                  trigger={
                    <button
                      className="icon-button"
                      aria-label={"Actions for " + focused.title}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  }
                  items={itemActions(focused.id)}
                />
              </div>
            )}
            <div className="tree-scroll">
              <div
                className="file-tree"
                role="tree"
                aria-label={
                  focused ? focused.title + " files" : "All collections"
                }
              >
                {renderTree(focus)}
              </div>
              {focused && (
                <div className="managed-views">
                  <button onClick={() => setView("dictionary")}>
                    <BookA size={15} />
                    Dictionary
                    <span>
                      {
                        w.definitions.filter(
                          (d) =>
                            !d.trashed &&
                            d.subjectIds.some((id) =>
                              inContainer(w, id, focused.id),
                            ),
                        ).length
                      }
                    </span>
                  </button>
                  <button onClick={() => setView("sources")}>
                    <Link2 size={15} />
                    Sources
                    <span>
                      {
                        w.sources.filter((s) =>
                          s.subjectIds.some((id) =>
                            inContainer(w, id, focused.id),
                          ),
                        ).length
                      }
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setView("search");
                      setTreeQuery("");
                    }}
                  >
                    <Search size={15} />
                    Search this collection
                  </button>
                </div>
              )}
              {!w.notes.length && (
                <p className="tree-hint">
                  A little space for everything you’re learning.
                </p>
              )}
              <button
                className="new-collection"
                onClick={() => setDialog({ type: "container" })}
              >
                <Plus size={14} /> New collection
              </button>
            </div>
            <div className="explorer-footer">
              <button onClick={() => setDialog({ type: "palette" })}>
                <Command size={15} /> Command palette <kbd>Ctrl P</kbd>
              </button>
              <button onClick={() => setView("review")}>
                <span className="review-mini-icon">
                  <Layers size={15} />
                </span>
                <span>
                  A little learning, every day
                  <small>
                    {
                      w.review.filter(
                        (r) => !r.suspended && r.schedule.due <= now(),
                      ).length
                    }{" "}
                    items ready to review
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            </div>
          </aside>
          <div
            className="resize-handle left-resize"
            role="separator"
            aria-label="Explorer width"
            aria-orientation="vertical"
            aria-valuenow={leftWidth}
            aria-valuemin={220}
            aria-valuemax={420}
            tabIndex={0}
            onPointerDown={(e) => resize("left", e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft")
                setLeftWidth((x) => Math.max(220, x - 10));
              if (e.key === "ArrowRight")
                setLeftWidth((x) => Math.min(420, x + 10));
            }}
          />
        </>
      )}
      <main className="main-workspace">
        <div className="tab-strip">
          {!left && !zen && (
            <IconButton label="Open explorer" onClick={() => setLeft(true)}>
              <PanelLeftOpen size={17} />
            </IconButton>
          )}
          <div className="tabs">
            {tabs.map((id) => {
              const n = w.notes.find((n) => n.id === id && !n.trashed);
              if (!n) return null;
              return (
                <div
                  className={
                    "note-tab " +
                    (activeId === id && view === "collections" ? "current" : "")
                  }
                  key={id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("application/studyspace-tab", id)
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const from = e.dataTransfer.getData(
                      "application/studyspace-tab",
                    );
                    if (from)
                      setTabs((old) => {
                        const result = old.filter((x) => x !== from);
                        result.splice(result.indexOf(id), 0, from);
                        return result;
                      });
                  }}
                >
                  <button
                    onClick={() => openNote(id)}
                    title={
                      (focus && rootOf(w, n.containerId)?.id !== focus
                        ? rootOf(w, n.containerId)?.title + " · "
                        : "") + n.title
                    }
                  >
                    {pinned.includes(id) ? (
                      <Pin size={13} />
                    ) : (
                      <FileText size={13} />
                    )}
                    <span>{n.title}</span>
                  </button>
                  <IconButton
                    label={"Close " + n.title}
                    onClick={() => closeTab(id)}
                  >
                    <X size={12} />
                  </IconButton>
                </div>
              );
            })}
          </div>
          <IconButton label="New note" onClick={() => addNote()}>
            <Plus size={17} />
          </IconButton>
          <div className="tab-strip-actions">
            <IconButton
              label={zen ? "Exit Zen mode" : "Zen mode"}
              active={zen}
              onClick={() => setZen(!zen)}
            >
              {zen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
            {!zen && (
              <IconButton
                label={right ? "Close inspector" : "Open inspector"}
                onClick={() => setRight(!right)}
              >
                {right ? (
                  <PanelRightClose size={17} />
                ) : (
                  <PanelRightOpen size={17} />
                )}
              </IconButton>
            )}
          </div>
        </div>
        {(conflict || recovery) && (
          <div className="recovery-banner">
            <AlertCircle size={16} />
            <span>
              {conflict
                ? "Another session changed this workspace. Your local draft is safe."
                : "An interrupted draft is available."}
            </span>
            <button
              onClick={() => {
                if (recovery) {
                  setDialog({ type: "conflict", draft: recovery });
                } else setDialog({ type: "conflict" });
              }}
            >
              Review draft
            </button>
            <button
              onClick={async () => {
                if (recovery) {
                  setRecovery(null);
                  await (
                    await localDB()
                  ).delete("drafts", account + ":workspace");
                } else location.reload();
              }}
            >
              {recovery ? "Dismiss" : "Reload saved"}
            </button>
          </div>
        )}
        {view === "collections" && active ? (
          <>
            <div className="breadcrumb-bar">
              <div className="breadcrumbs">
                {breadcrumb.map((c, i) => (
                  <span key={c.id}>
                    <button title={c.title} onClick={() => setFocus(c.id)}>
                      {i === 0 && <SymbolIcon name={c.icon} size={13} />}{" "}
                      {c.title}
                    </button>
                    <ChevronRight size={12} />
                  </span>
                ))}
                <span title={active.title}>{active.title}</span>
              </div>
              <div className="inline-actions">
                <span className="private-label">
                  <Lock size={11} /> Private
                </span>
                <IconButton
                  label="Note history"
                  onClick={() => setDialog({ type: "history", id: active.id })}
                >
                  <History size={16} />
                </IconButton>
                <Menu
                  trigger={
                    <button className="icon-button" aria-label="Note actions">
                      <MoreHorizontal size={18} />
                    </button>
                  }
                  items={[
                    ...itemActions(active.id),
                    "separator",
                    {
                      label: pinned.includes(active.id)
                        ? "Unpin tab"
                        : "Pin tab",
                      icon: Pin,
                      action: () =>
                        setPinned((p) =>
                          p.includes(active.id)
                            ? p.filter((x) => x !== active.id)
                            : [...p, active.id],
                        ),
                    },
                    {
                      label: "Close other tabs",
                      icon: X,
                      action: () => setTabs([active.id]),
                    },
                    {
                      label: "Reopen closed tab",
                      icon: RotateCcw,
                      disabled: !closedTabs.length,
                      action: () => {
                        const id = closedTabs.at(-1);
                        if (id) {
                          openNote(id);
                          setClosedTabs((x) => x.slice(0, -1));
                        }
                      },
                    },
                  ]}
                />
              </div>
            </div>
            {focus && activeRoot?.id !== rootOf(w, focus)?.id && (
              <div className="context-banner">
                This note belongs to {activeRoot?.title}.{" "}
                <button onClick={() => setFocus(activeRoot?.id ?? null)}>
                  Switch to collection <ArrowRight size={12} />
                </button>
              </div>
            )}
            <div className="document-scroll" ref={scroller}>
              <article
                className={
                  "document " + (w.settings.fullWidth ? "full-width" : "")
                }
              >
                <div className="document-meta">
                  <span className="eyebrow">
                    <span
                      className="tiny-dot"
                      style={{ background: activeRoot?.color }}
                    />
                    {active.kind === "note"
                      ? "STUDY NOTE"
                      : active.kind.toUpperCase()}
                    {demo && (
                      <span className="demo-note-label">LOCAL DEMO</span>
                    )}
                  </span>
                  <div
                    className="mode-switch"
                    role="group"
                    aria-label="Editor mode"
                  >
                    {[
                      { value: "source", label: "Source", icon: Code2 },
                      { value: "live", label: "Live preview", icon: PenLine },
                      { value: "reading", label: "Reading", icon: Eye },
                    ].map((m) => (
                      <IconButton
                        key={m.value}
                        label={m.label}
                        active={mode === m.value}
                        onClick={() => setMode(m.value as typeof mode)}
                      >
                        <m.icon size={15} />
                      </IconButton>
                    ))}
                  </div>
                </div>
                <input
                  className="note-title"
                  aria-label="Note title"
                  value={active.title}
                  readOnly={mode === "reading"}
                  onChange={(e) =>
                    mutate((s) => {
                      const n = s.notes.find((n) => n.id === active.id)!;
                      saveNote(s, n.id, n.revision, { title: e.target.value });
                    })
                  }
                />
                <div className="note-properties">
                  <span>
                    <CalendarDays size={12} />
                    {new Date(active.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {active.tags.map((tag) => (
                    <button
                      key={tag}
                      className="tag"
                      onClick={() => {
                        setView("search");
                        setTreeQuery("#" + tag);
                      }}
                    >
                      #{tag}
                    </button>
                  ))}
                  <button
                    className="add-tag"
                    onClick={() =>
                      setDialog({
                        type: "tags",
                        id: active.id,
                        value: active.tags.join(", "),
                      })
                    }
                  >
                    + Add tag
                  </button>
                </div>
                <div
                  className="writing-area"
                  onMouseUp={() => {
                    if (mode === "reading")
                      setSelection(window.getSelection()?.toString() ?? "");
                  }}
                >
                  {mode === "reading" && (
                    <Markdown
                      attachments={w.attachments}
                      notes={w.notes}
                      demo={demo}
                      fromPath={active.originalPath ?? active.title + ".md"}
                      density={w.settings.dictionaryDensity}
                      onAttachment={(id) => setDialog({ type: "pdf", id })}
                      body={
                        active.body.startsWith("# " + active.title + "\n")
                          ? active.body
                              .slice(active.title.length + 3)
                              .replace(/^\n/, "")
                          : active.body
                      }
                      definitions={definitionsForNote}
                      onDefinition={(id) =>
                        setDialog({ type: "definition-detail", id })
                      }
                      onCitation={(id) => {
                        setInspector("sources");
                        setRight(true);
                        setDialog({ type: "citation-detail", id });
                      }}
                      remoteImages={w.settings.remoteImages}
                      onLink={(target) => {
                        const mapped = active.linkMap?.[target];
                        const match = resolveLink(
                          target,
                          active.originalPath ?? active.title,
                          w.notes,
                        );
                        if (mapped || match.id) {
                          openNote(mapped ?? match.id!);
                          const anchor = target.split("#")[1];
                          if (anchor)
                            setTimeout(
                              () =>
                                document
                                  .getElementById(
                                    anchor
                                      .replace(/^\^/, " ")
                                      .trim()
                                      .toLowerCase()
                                      .replace(/\s+/g, "-"),
                                  )
                                  ?.scrollIntoView({ block: "start" }),
                              180,
                            );
                        } else
                          toast(
                            match.status === "ambiguous"
                              ? "Several notes match. Use Find a note to choose one."
                              : "Linked note not found.",
                          );
                      }}
                    />
                  )}
                  <div hidden={mode === "reading"}>
                    <Editor
                      id={active.id}
                      body={active.body}
                      mode={mode === "reading" ? "live" : mode}
                      onChange={(body) => {
                        if (
                          wRef.current?.notes.find((n) => n.id === active.id)
                            ?.body !== body
                        )
                          mutate(
                            (s) => {
                              const n = s.notes.find(
                                (n) => n.id === active.id,
                              )!;
                              saveNote(s, n.id, n.revision, { body });
                            },
                            undefined,
                            true,
                          );
                      }}
                      onSelection={setSelection}
                      definitions={definitionsForNote}
                      onDefinition={(id) =>
                        setDialog({ type: "definition-detail", id })
                      }
                      onAttach={(files) => void attach(files)}
                      handle={editor}
                      notes={w.notes}
                    />
                  </div>
                </div>
                {active.body.length === 0 && (
                  <div className="editor-hint">
                    Start with an idea. Markdown takes care of the rest.
                    <br />
                    <small>
                      Type # for a heading, [[ to link a note, or use Ctrl P for
                      commands.
                    </small>
                  </div>
                )}
              </article>
            </div>
            <div className="editor-bottom-toolbar">
              <div className="inline-actions">
                <IconButton
                  label="Add attachment"
                  onClick={() => setDialog({ type: "attachments" })}
                >
                  <Paperclip size={15} />
                </IconButton>
                <button
                  onClick={() =>
                    setDialog({
                      type: "definition",
                      value: selection,
                      parentId: subjectOf(w, active.containerId)?.id,
                    })
                  }
                >
                  <BookA size={14} /> Define{" "}
                  {selection ? "selection" : "a term"}
                </button>
                {selection && (
                  <>
                    <button
                      onClick={() =>
                        setDialog({ type: "citation", value: selection })
                      }
                    >
                      <Link2 size={14} /> Cite
                    </button>
                    <button
                      onClick={() =>
                        setDialog({ type: "review-card", value: selection })
                      }
                    >
                      <Layers size={14} /> Review
                    </button>
                    <button
                      onClick={() =>
                        setDialog({ type: "annotation", value: selection })
                      }
                    >
                      <MessageSquare size={14} /> Annotate
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setDialog({ type: "publish", id: active.id })}
              >
                <Globe size={13} /> Publish
              </button>
            </div>
          </>
        ) : view === "collections" ? (
          <div className="welcome">
            <div className="welcome-mark">
              <BookOpen size={40} strokeWidth={1.2} />
            </div>
            <span className="eyebrow">A PLACE FOR UNDERSTANDING</span>
            <h1>Make room for your ideas.</h1>
            <p>
              Gather your notes. Connect the dots.
              <br />
              Build a little understanding, every day.
            </p>
            <div className="welcome-actions">
              <button className="primary" onClick={() => addNote()}>
                <PenLine size={17} /> Start writing
              </button>
              <button
                className="secondary"
                onClick={() => setDialog({ type: "import" })}
              >
                <Upload size={17} /> Import notes
              </button>
            </div>
            <button
              className="text-button"
              onClick={() => setDialog({ type: "container" })}
            >
              Create your first collection <ArrowRight size={14} />
            </button>
            {demo && (
              <button
                className="sample-button"
                onClick={() => {
                  mutate((s) => {
                    const sample = sampleWorkspace();
                    Object.assign(s, sample, { revision: s.revision });
                  });
                  const n = wRef.current!.notes[0];
                  setExpanded(
                    ancestry(wRef.current!, n.containerId).map((c) => c.id),
                  );
                  openNote(n.id);
                  toast(
                    "Loaded a clearly labeled sample workspace. All edits stay on this device.",
                  );
                }}
              >
                Explore an editable sample collection <ChevronRight size={14} />
              </button>
            )}
            <div className="welcome-principles">
              <span>
                <Lock size={14} /> Private by default
              </span>
              <span>
                <FileText size={14} /> Yours in Markdown
              </span>
              <span>
                <Link2 size={14} /> Connected by ideas
              </span>
            </div>
          </div>
        ) : (
          <WorkspaceViews
            ctx={ctx}
            view={view}
            query={treeQuery}
            setQuery={setTreeQuery}
          />
        )}
        <footer className="status-bar">
          <span
            className={
              "save-state " +
              (saveStatus.includes("failed") || conflict ? "danger" : "")
            }
            role="status"
          >
            {saveStatus.includes("Saved") ? (
              <Check size={12} />
            ) : saveStatus.includes("Offline") ? (
              <CloudOff size={12} />
            ) : (
              <Cloud size={12} />
            )}{" "}
            {saveStatus}
          </span>
          <div>
            <span>
              {active?.body.trim()
                ? active.body.trim().split(/\s+/u).length
                : 0}{" "}
              words
            </span>
            <span>{active?.body.length ?? 0} characters</span>
            <span>Markdown</span>
            <button
              title="Keyboard shortcuts"
              onClick={() => setView("settings")}
            >
              <Command size={12} />
            </button>
          </div>
        </footer>
      </main>
      {!zen && right && (
        <>
          <div
            className="resize-handle right-resize"
            role="separator"
            aria-label="Inspector width"
            aria-orientation="vertical"
            aria-valuenow={rightWidth}
            aria-valuemin={280}
            aria-valuemax={520}
            tabIndex={0}
            onPointerDown={(e) => resize("right", e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft")
                setRightWidth((x) => Math.min(520, x + 10));
              if (e.key === "ArrowRight")
                setRightWidth((x) => Math.max(280, x - 10));
            }}
          />
          <aside className="inspector" aria-label="Notes and sources">
            <header>
              <span>Notes & Sources</span>
              <IconButton
                label="Close inspector"
                onClick={() => setRight(false)}
              >
                <PanelRightClose size={16} />
              </IconButton>
            </header>
            <div
              className="inspector-tabs"
              role="tablist"
              aria-label="Inspector tools"
            >
              {inspectorTabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={inspector === t.id}
                  title={t.label}
                  aria-label={t.label}
                  className={inspector === t.id ? "active" : ""}
                  onClick={() => setInspector(t.id)}
                >
                  <t.icon size={17} />
                </button>
              ))}
            </div>
            <Inspector ctx={ctx} panel={inspector} />
            <div className="inspector-bottom">
              <span className="tiny-dot" /> Understanding grows through
              connections.
            </div>
          </aside>
        </>
      )}
      {dialog && (
        <Dialogs
          ctx={ctx}
          dialog={dialog}
          onClose={() => {
            setDialog(null);
            setTimeout(() => editor.current?.focus(), 0);
          }}
        />
      )}
      {contextMenu && (
        <div
          className="context-dismiss"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="context-menu manual-context"
            role="menu"
            style={{ left: contextMenu.x, top: Math.max(8, contextMenu.y) }}
          >
            {itemActions(contextMenu.id).map((item, i) =>
              item === "separator" ? (
                <div className="menu-separator" key={i} />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  className={
                    "menu-item " +
                    ("danger" in item && item.danger ? "danger" : "")
                  }
                  onClick={() => {
                    setContextMenu(null);
                    item.action();
                  }}
                >
                  {item.icon && <item.icon size={15} />} {item.label}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <IconButton
            label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
      <button
        className="mobile-create"
        aria-label="Quick note"
        onClick={() => setDialog({ type: "quick" })}
      >
        <Plus size={22} />
      </button>
    </div>
  );
}
