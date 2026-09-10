"use client";
import { formatJournalDate, noteDisplayTitle } from "@/lib/journal-date";
import { instantiateSnapshot } from "@/lib/study-copy";
import { localDB } from "@/lib/store";
import { useEffect, useState } from "react";
import {
  Search,
  Plus,
  BookA,
  Link2,
  Layers,
  CalendarDays,
  Moon,
  ArrowRight,
  ArrowLeft,
  Bookmark,
  Globe,
  FileText,
  FolderInput,
  ChevronRight,
  Settings,
  Sun,
  Feather,
  Trash2,
  RotateCcw,
  Download,
  Upload,
  Lock,
  Check,
  ExternalLink,
  Bell,
  GitBranch,
  Copy,
  RefreshCw,
  Pause,
  Play,
  LogOut,
  Shield,
  Archive,
  Folder,
  Mail,
  AlertCircle,
  X,
} from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import {
  type Snapshot,
  type Theme,
  type Grade,
  uid,
  now,
  general,
  inContainer,
  ancestry,
  localDate,
} from "@/lib/model";
import {
  createNote,
  createContainer,
  captureJournal,
  gradeReview,
  nextSchedule,
  trashItems,
} from "@/lib/domain";
import { Empty, Field, IconButton, Modal } from "./ui";
import Markdown from "./Markdown";
import { browserClient } from "@/lib/supabase/browser";
import { clearAccountCache } from "@/lib/store";
import MergeReview from "./study/MergeReview";
import JobStatus from "./JobStatus";
import {
  GroupSelect,
  JournalCalendar,
  ThemeExtras,
  JournalIcon,
} from "./WorkspaceEnhancements";
import StudyGroups from "./StudyGroups";
import Profile from "./social/Profile";
import CommunityFeed from "./social/Feed";
import Messages from "./social/Messages";
import Shared from "./social/Shared";
import Moderation from "./social/Moderation";
import JournalEditor from "./JournalEditor";
import {
  categories,
  publicationCounts,
  cardsInGroup,
} from "@/lib/enhancements";
export default function WorkspaceViews({
  ctx,
  view,
  query,
  setQuery,
}: {
  ctx: AppContext;
  view: string;
  query: string;
  setQuery: (q: string) => void;
}) {
  const { w, mutate, setDialog, openNote } = ctx;
  const [sort, setSort] = useState("alpha"),
    [date, setDate] = useState(localDate(w.settings.timezone)),
    [dream, setDream] = useState(false),
    [journalEntryId, setJournalEntryId] = useState<string | null>(null),
    [revealed, setRevealed] = useState(false),
    [lastGrade, setLastGrade] = useState<string | null>(null),
    [reviewMode, setReviewMode] = useState("daily"),
    [cardGroup, setCardGroup] = useState("all"),
    [discoverCategory, setDiscoverCategory] = useState("all"),
    [discoverSort, setDiscoverSort] = useState("newest"),
    [discoverMode, setDiscoverMode] = useState("community"),
    [settingsTab, setSettingsTab] = useState("Appearance"),
    [remote, setRemote] = useState<Snapshot[]>([]),
    [loading, setLoading] = useState(false),
    [remoteError, setRemoteError] = useState(""),
    [mergeId, setMergeId] = useState<string | null>(null),
    [showAllReview, setShowAllReview] = useState(false),
    [password, setPassword] = useState(""),
    [inbox, setInbox] = useState<any[]>([]),
    [serverNotifications, setServerNotifications] = useState<any[]>([]),
    [searchHits, setSearchHits] = useState<typeof w.notes | null>(null),
    [searchStatus, setSearchStatus] = useState("");
  useEffect(() => {
    if (ctx.demo || view !== "search") return;
    const abort = new AbortController();
    setSearchHits(null);
    setSearchStatus("Searching the private index…");
    const timer = setTimeout(() => {
      fetch(
        "/api/search?q=" +
          encodeURIComponent(query) +
          (ctx.focus ? "&container=" + ctx.focus : ""),
        { signal: abort.signal },
      )
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setSearchHits(d.notes);
          setSearchStatus("Indexed private results");
        })
        .catch((e) => {
          if (e.name !== "AbortError")
            setSearchStatus("Index unavailable. Showing locally loaded notes.");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [view, query, ctx.focus, ctx.demo]);
  useEffect(() => {
    if (view !== "discover" || ctx.demo) return;
    setLoading(true);
    fetch(
      "/api/publications?q=" +
        encodeURIComponent(query) +
        "&category=" +
        encodeURIComponent(discoverCategory) +
        "&sort=" +
        discoverSort,
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setRemote(d.publications ?? []);
      })
      .catch((e) => setRemoteError(e.message))
      .finally(() => setLoading(false));
  }, [view, query, ctx.demo, discoverCategory, discoverSort]);
  useEffect(() => {
    if (view !== "inbox" || ctx.demo) return;
    fetch("/api/community")
      .then((r) => r.json())
      .then((d) => {
        setInbox(d.requests ?? []);
        setServerNotifications(d.notifications ?? []);
      })
      .catch(() => setRemoteError("Inbox is unavailable. Try again."));
  }, [view, ctx.demo]);
  const scopeNotes = w.notes.filter(
    (n) =>
      !n.trashed && (!ctx.focus || inContainer(w, n.containerId, ctx.focus)),
  );
  const header = (
    eyebrow: string,
    title: string,
    description: string,
    action?: React.ReactNode,
  ) => (
    <header
      className={
        "view-header" +
        (w.settings.dismissedIntroductions?.[view]
          ? " view-header-compact"
          : "")
      }
    >
      <div>
        {w.settings.dismissedIntroductions?.[view] ? (
          <h1>
            {(
              {
                search: "Search",
                dictionary: ctx.focus
                  ? `${w.containers.find((c) => c.id === ctx.focus)?.title ?? "Collection"} dictionary`
                  : "Dictionary",
                sources: "Sources",
                journal: "Journal",
                review: "Review",
                bookmarks: "Library",
                discover: "Discover",
                jobs: "Background jobs",
                inbox: "Inbox",
                settings: "Settings",
              } as Record<string, string>
            )[view] ?? title}
          </h1>
        ) : (
          <>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </>
        )}
      </div>
      {action}
      {!w.settings.dismissedIntroductions?.[view] && (
        <IconButton
          label="Dismiss this tab’s introduction"
          className="dismiss-introduction"
          onClick={() =>
            mutate((s) => {
              (s.settings.dismissedIntroductions ??= {})[view] = true;
            })
          }
        >
          <X size={16} />
        </IconButton>
      )}
    </header>
  );
  const noteRows = (notes: typeof w.notes, onOpen = openNote) => (
    <div className="note-results">
      {notes.map((n) => (
        <button
          key={n.id}
          onClick={() =>
            w.notes.some((x) => x.id === n.id)
              ? onOpen(n.id)
              : (location.href = "/w/note/" + n.id)
          }
        >
          <span className="result-icon">
            <FileText size={19} />
          </span>
          <span>
            <strong>{noteDisplayTitle(n)}</strong>
            <small>
              {ancestry(w, n.containerId)
                .map((c) => c.title)
                .join(" / ")}
            </small>
            <p>{n.body.replace(/[#*`>]/g, "").slice(0, 180)}</p>
          </span>
          <time>
            {new Date(n.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
  if (["profile", "messages", "shared"].includes(view)) {
    return (
      <div className="view-scroll">
        {ctx.demo ? (
          <section className="social-page">
            <h1>
              {view === "profile"
                ? "Your profile"
                : view === "shared"
                  ? "Shared collections"
                  : "Messages"}
            </h1>
            <p>
              Sign in to create your community profile, collaborate with other
              students, and send private messages. Your demo notes remain on
              this device.
            </p>
            <a className="primary" href="/auth">
              Sign in to Studyspace
            </a>
          </section>
        ) : (
          <>
            {view === "profile" ? (
              <>
                <Profile />
                <Moderation />
              </>
            ) : view === "messages" ? (
              <Messages />
            ) : (
              <Shared workspace={w} />
            )}
          </>
        )}
      </div>
    );
  }
  if (view === "quick-notes") {
    const notes = w.notes
      .filter(
        (n) =>
          n.kind === "quick" &&
          !n.trashed &&
          !n.archived &&
          (n.title + " " + n.body).toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "CATCH A THOUGHT",
            "Quick notes",
            "A separate space for fleeting thoughts. Move a note into a collection when you are ready to organize it.",
            <button
              className="primary"
              onClick={() => setDialog({ type: "quick" })}
            >
              <Plus size={16} />
              New quick note
            </button>,
          )}
          <input
            aria-label="Search quick notes"
            placeholder="Find a quick note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="quick-notes-list">
            {notes.map((n) => (
              <article key={n.id}>
                <button
                  className="quick-note-open"
                  onClick={() => openNote(n.id)}
                >
                  <strong>{n.title || "Quick note"}</strong>
                  <span>
                    {n.body.replace(/[#*`]/g, "").slice(0, 160) || "Empty note"}
                  </span>
                  <small>{new Date(n.updatedAt).toLocaleDateString()}</small>
                </button>
                <div>
                  <button
                    aria-label={"Move " + n.title}
                    onClick={() =>
                      setDialog({
                        type: "move",
                        id: n.id,
                        destination: general(w).id,
                      })
                    }
                  >
                    <FolderInput size={15} />
                    Move
                  </button>
                  <button
                    aria-label={"Trash " + n.title}
                    onClick={() =>
                      mutate(
                        (w) => trashItems(w, [n.id]),
                        "Quick note moved to Trash.",
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!notes.length && (
            <p className="empty-hint">
              {query
                ? "No quick notes match your search."
                : "Nothing to organize yet. Capture a thought whenever you need to."}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (view === "search")
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "FIND A CONNECTION",
            "Search your workspace",
            "Find a note, a phrase, or an idea you almost forgot.",
          )}
          <div className="large-search">
            <Search size={21} />
            <input
              autoFocus
              aria-label="Search workspace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, content, #tags, or type:dream…"
            />
            <kbd>↵</kbd>
          </div>
          <div className="filter-bar">
            <span className="badge">
              {ctx.focus
                ? w.containers.find((c) => c.id === ctx.focus)?.title
                : "All my collections"}
            </span>
            {ctx.focus && (
              <button onClick={() => ctx.setFocus(null)}>
                Clear collection scope
              </button>
            )}
            <span>Only your private notes</span>
          </div>
          {searchStatus && (
            <p role="status" className="field-hint">
              {searchStatus}
            </p>
          )}
          {noteRows(
            searchHits ??
              scopeNotes
                .filter((n) =>
                  query
                    .split(/\s+/)
                    .every((term) =>
                      term.startsWith("#")
                        ? n.tags.some((t) =>
                            t
                              .toLowerCase()
                              .includes(term.slice(1).toLowerCase()),
                          )
                        : term.startsWith("type:")
                          ? n.kind === term.slice(5)
                          : term.startsWith("after:")
                            ? n.createdAt >= term.slice(6)
                            : (n.title + " " + n.body)
                                .toLowerCase()
                                .includes(term.toLowerCase()),
                    ),
                )
                .slice(0, 100),
          )}
        </div>
      </div>
    );
  if (view === "dictionary") {
    const definitions = w.definitions
      .filter(
        (d) =>
          !d.trashed &&
          (!ctx.focus ||
            d.subjectIds.some((id) => inContainer(w, id, ctx.focus!))) &&
          (d.term + " " + d.definition + " " + d.aliases)
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "newest"
          ? b.createdAt.localeCompare(a.createdAt)
          : sort === "oldest"
            ? a.createdAt.localeCompare(b.createdAt)
            : sort === "reverse"
              ? b.term.localeCompare(a.term)
              : a.term.localeCompare(b.term),
      );
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "WORDS BECOME UNDERSTANDING",
            ctx.focus
              ? `${w.containers.find((c) => c.id === ctx.focus)?.title ?? "Collection"} dictionary`
              : "My global dictionary",
            "Your own meanings, connected to the subjects they belong to.",
            <button
              className="primary"
              onClick={() =>
                setDialog({
                  type: "definition",
                  parentId: ctx.focus ?? undefined,
                })
              }
            >
              <Plus size={16} /> Add definition
            </button>,
          )}
          <div className="view-controls">
            <div className="compact-search">
              <Search size={16} />
              <input
                aria-label="Search dictionary"
                placeholder="Find a word or phrase…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Sort definitions"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="alpha">A → Z</option>
              <option value="reverse">Z → A</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <span>{definitions.length} entries</span>
          </div>
          <div className="dictionary-document">
            {definitions.map((d) => (
              <section key={d.id}>
                <div className="dictionary-entry-heading">
                  <button
                    onClick={() =>
                      setDialog({ type: "definition-detail", id: d.id })
                    }
                  >
                    <span>{d.term[0]}</span>
                    <h2>{d.term}</h2>
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setDialog({
                        type: "definition",
                        id: d.id,
                        parentId: d.subjectIds[0],
                      })
                    }
                  >
                    Edit
                  </button>
                </div>
                <div className="entry-scopes">
                  {d.subjectIds.map((id) => (
                    <span className="badge" key={id}>
                      {w.containers.find((c) => c.id === id)?.title}
                    </span>
                  ))}
                </div>
                <Markdown body={d.definition} />
                {d.aliases.length > 0 && (
                  <p className="muted">Also {d.aliases.join(", ")}</p>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    setDialog({
                      type: "review-card",
                      value: d.term,
                      answer: d.definition,
                      sourceId: d.id,
                      sourceType: "definition",
                    })
                  }
                >
                  <Layers size={14} /> Need to review
                </button>
              </section>
            ))}
          </div>
          {!definitions.length && (
            <Empty icon={BookA} title="Every subject has a language">
              Add a definition to make that language your own.
            </Empty>
          )}
        </div>
      </div>
    );
  }
  if (view === "sources")
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "KEEP THE EVIDENCE CLOSE",
            "Sources",
            "A living bibliography for the ideas you’re building.",
            <button
              className="primary"
              onClick={() =>
                setDialog({ type: "source", parentId: ctx.focus ?? undefined })
              }
            >
              <Plus size={16} /> Add source
            </button>,
          )}
          <div className="large-search">
            <Search size={19} />
            <input
              aria-label="Search sources"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, authors, or identifiers…"
            />
          </div>
          <ul className="sources-document">
            {w.sources
              .filter(
                (s) =>
                  (!ctx.focus ||
                    s.subjectIds.some((id) =>
                      inContainer(w, id, ctx.focus!),
                    )) &&
                  (s.title + s.input + s.authors)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((s) => (
                <li key={s.id}>
                  <div>
                    <button
                      className="source-title"
                      onClick={() =>
                        setDialog({ type: "source-detail", id: s.id })
                      }
                    >
                      {s.title}
                      <ExternalLink size={14} />
                    </button>
                    <p>
                      {s.authors.join(", ") || "Author metadata unavailable"}
                    </p>
                    <small>{s.canonical}</small>
                  </div>
                  <span className="badge">{s.kind}</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      setDialog({
                        type: "source",
                        id: s.id,
                        parentId: s.subjectIds[0],
                      })
                    }
                  >
                    Edit
                  </button>
                </li>
              ))}
          </ul>
          {!w.sources.length && (
            <Empty icon={Link2} title="An idea is stronger with a source">
              Paste a research link into a note, or add a DOI, arXiv ID, or
              ISBN.
            </Empty>
          )}
        </div>
      </div>
    );
  if (view === "journal" || view === "dreams") {
    const isDream = dream || view === "dreams";
    const entries = w.notes
      .filter((n) => !n.trashed && n.kind === (isDream ? "dream" : "journal"))
      .sort((a, b) => (b.journalDate ?? "").localeCompare(a.journalDate ?? ""));
    const selectedEntry = entries.find(
      (n) => n.id === journalEntryId && n.journalDate === date,
    );
    const openEntry = (id: string) => {
      const entry = w.notes.find((n) => n.id === id);
      if (entry?.journalDate) setDate(entry.journalDate);
      setJournalEntryId(id);
      ctx.openJournalNote(id);
    };
    return (
      <div className="view-scroll">
        <div className="workspace-view journal-view">
          {header(
            "A MOMENT FOR YOURSELF",
            isDream ? "Dream journal" : "Your days, in your words",
            isDream
              ? "Keep the fragments you remember. Leave the meaning open."
              : "There is no right way to reflect. Just a little room to notice.",
          )}
          <div className="segmented journal-switch">
            <button
              className={!isDream ? "active" : ""}
              onClick={() => setDream(false)}
            >
              <CalendarDays size={15} /> Journal
            </button>
            <button
              className={isDream ? "active" : ""}
              onClick={() => setDream(true)}
            >
              <Moon size={15} /> Dream journal
            </button>
          </div>
          <JournalCalendar
            ctx={ctx}
            date={date}
            onDate={setDate}
            isDream={isDream}
          />
          <div className="journal-date">
            <div>
              <span className="eyebrow">
                {date === localDate(w.settings.timezone)
                  ? "TODAY"
                  : "YOUR CHOSEN DAY"}
              </span>
              <h2>{formatJournalDate(date)}</h2>
              <small>{w.settings.timezone} · always private by default</small>
            </div>
            <input
              type="date"
              aria-label="Journal date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {!selectedEntry && (
            <div className="journal-start">
              <span className="journal-illustration">
                {isDream ? (
                  <Moon size={39} strokeWidth={1} />
                ) : (
                  <Feather size={39} strokeWidth={1} />
                )}
              </span>
              <h2>
                {isDream
                  ? "What stayed with you?"
                  : "What’s worth remembering?"}
              </h2>
              <p>
                {isDream
                  ? "A scene, a feeling, or a detail. Begin anywhere."
                  : "The small things count, too."}
              </p>
              <button
                className="primary"
                onClick={() => {
                  let id = "";
                  mutate((s) => {
                    id = captureJournal(
                      s,
                      isDream ? "dream" : "journal",
                      date,
                    ).id;
                  });
                  openEntry(id);
                }}
              >
                <Plus size={16} />
                {isDream ? "Record a dream" : "Open this day’s entry"}
              </button>
              {!isDream && (
                <button
                  className="text-button"
                  onClick={() => {
                    let id = "";
                    mutate((s) => {
                      id = captureJournal(s, "journal", date, true).id;
                    });
                    openEntry(id);
                  }}
                >
                  Add a separate entry
                </button>
              )}
            </div>
          )}
          {selectedEntry && (
            <JournalEditor
              key={selectedEntry.id}
              ctx={ctx}
              note={selectedEntry}
              onClose={() => setJournalEntryId(null)}
            />
          )}
          <h3 className="section-label">
            Entries for {formatJournalDate(date)}
          </h3>
          {noteRows(
            entries.filter((n) => n.journalDate === date),
            openEntry,
          )}
          <h3 className="section-label">Recent entries</h3>
          {noteRows(
            entries.filter((n) => n.journalDate !== date),
            openEntry,
          )}
          {!entries.length && (
            <p className="muted">
              Your first entry can be as short as a sentence.
            </p>
          )}
        </div>
      </div>
    );
  }
  if (view === "review") {
    const today = localDate(w.settings.timezone);
    const eventsToday = w.review.flatMap((r) =>
      r.events.filter(
        (e) => localDate(w.settings.timezone, new Date(e.at)) === today,
      ),
    );
    const newUsed = eventsToday.filter((e) => e.before.state === "new").length;
    const reviewUsed = eventsToday.length - newUsed;
    const selectedCards = cardsInGroup(w, cardGroup);
    const due = selectedCards
      .filter(
        (r) =>
          !r.suspended &&
          r.schedule.due <= now() &&
          (r.schedule.state === "new"
            ? newUsed < w.settings.newCap
            : reviewUsed < w.settings.reviewCap),
      )
      .sort((a, b) => a.schedule.due.localeCompare(b.schedule.due));
    const card = due[0];
    const upcoming = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const date = localDate(w.settings.timezone, d);
      return {
        date,
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        count: selectedCards.filter(
          (r) =>
            !r.suspended &&
            localDate(w.settings.timezone, new Date(r.schedule.due)) === date,
        ).length,
      };
    });
    return (
      <div className="view-scroll">
        <div className="workspace-view review-view">
          {header(
            "A LITTLE LEARNING, EVERY DAY",
            "Make it stay",
            "A focused moment with the ideas you want to keep.",
            <button
              className="secondary"
              onClick={() =>
                setDialog({
                  type: "review-card",
                  groupId: cardGroup === "all" ? "" : cardGroup,
                })
              }
            >
              <Plus size={16} /> Create card
            </button>,
          )}
          <StudyGroups
            ctx={ctx}
            value={cardGroup}
            onChange={(id) => {
              setCardGroup(id);
              setRevealed(false);
            }}
          />
          <div className="review-overview">
            <div>
              <strong>{due.length}</strong>
              <span>ready to review</span>
            </div>
            <div>
              <strong>
                {
                  selectedCards.filter(
                    (r) => r.schedule.state === "new" && !r.suspended,
                  ).length
                }
              </strong>
              <span>new ideas</span>
            </div>
            <div>
              <strong>
                {
                  selectedCards.flatMap((r) =>
                    r.events.filter(
                      (e) =>
                        localDate(w.settings.timezone, new Date(e.at)) ===
                        today,
                    ),
                  ).length
                }
              </strong>
              <span>reviewed today</span>
            </div>
            <div className="segmented">
              <button
                className={reviewMode === "daily" ? "active" : ""}
                onClick={() => setReviewMode("daily")}
              >
                Daily
              </button>
              <button
                className={reviewMode === "weekly" ? "active" : ""}
                onClick={() => setReviewMode("weekly")}
              >
                Weekly
              </button>
            </div>
          </div>
          {reviewMode === "weekly" && (
            <div className="weekly-plan">
              {upcoming.map((d) => (
                <div key={d.date}>
                  <span>{d.label}</span>
                  <div
                    className="workload-bar"
                    style={{ height: Math.max(4, Math.min(90, d.count * 10)) }}
                  />
                  <strong>{d.count}</strong>
                </div>
              ))}
            </div>
          )}
          {card ? (
            <div className="review-card">
              <div className="review-card-top">
                <span className="badge">
                  {card.sourceType} · {card.schedule.state}
                </span>
                <span>{due.length} remaining</span>
              </div>
              {card.contentChanged && (
                <p className="content-updated">
                  Source content changed.{" "}
                  <button
                    onClick={() => {
                      const definition = w.definitions.find(
                          (d) => d.id === card.sourceId,
                        ),
                        note = w.notes.find((n) => n.id === card.sourceId);
                      mutate((s) => {
                        const c = s.review.find((x) => x.id === card.id)!;
                        c.back = definition?.definition ?? note?.body ?? c.back;
                        c.contentChanged = false;
                      });
                    }}
                  >
                    Refresh answer
                  </button>
                </p>
              )}
              <div className="review-question">
                <Markdown body={card.front} />
              </div>
              {revealed ? (
                <>
                  <div className="review-answer">
                    <span className="eyebrow">THE ANSWER</span>
                    <Markdown body={card.back} />
                  </div>
                  <p className="review-grade-prompt">
                    How well did you recall it?
                  </p>
                  <div className="grade-buttons">
                    {(["again", "hard", "good", "easy"] as Grade[]).map(
                      (grade) => {
                        const next = nextSchedule(card.schedule, grade, now());
                        return (
                          <button
                            className={"grade-" + grade}
                            key={grade}
                            onClick={() => {
                              const id = uid();
                              mutate((s) => gradeReview(s, card.id, grade, id));
                              setLastGrade(card.id);
                              setRevealed(false);
                            }}
                          >
                            <strong>
                              {grade[0].toUpperCase() + grade.slice(1)}
                            </strong>
                            <small>
                              {next.interval < 1
                                ? "10 min"
                                : next.interval + " days"}
                            </small>
                          </button>
                        );
                      },
                    )}
                  </div>
                </>
              ) : (
                <button
                  className="primary reveal-button"
                  onClick={() => setRevealed(true)}
                >
                  Reveal answer <ArrowRight size={16} />
                </button>
              )}
              <div className="review-card-footer">
                <button
                  onClick={() => {
                    mutate((s) => {
                      s.review.find((r) => r.id === card.id)!.suspended = true;
                    });
                    setRevealed(false);
                  }}
                >
                  <Pause size={13} /> Suspend
                </button>
                <button
                  onClick={() => {
                    const n = w.notes.find((n) => n.id === card.sourceId);
                    if (n) openNote(n.id);
                    else if (card.sourceType === "definition")
                      setDialog({
                        type: "definition-detail",
                        id: card.sourceId,
                      });
                    else
                      ctx.toast("This card uses a personal answer snapshot.");
                  }}
                >
                  Open source <ExternalLink size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="review-complete">
              <span>
                <Check size={36} />
              </span>
              <h2>
                {selectedCards.length
                  ? "A little more understanding."
                  : "Make room for your next idea."}
              </h2>
              <p>
                {selectedCards.length
                  ? "You’re done for now. Your next ideas will be here when they’re due."
                  : "Create a card, assign existing cards, or link this group to the folder you’re studying."}
              </p>
            </div>
          )}
          {lastGrade && (
            <button
              className="text-button"
              onClick={() => {
                mutate((s) => {
                  const c = s.review.find((r) => r.id === lastGrade);
                  const e = c?.events.pop();
                  if (c && e) c.schedule = e.before;
                });
                setLastGrade(null);
                setRevealed(false);
              }}
            >
              <RotateCcw size={14} /> Undo last grade
            </button>
          )}
          <button
            className="panel-link"
            onClick={() => setShowAllReview(!showAllReview)}
          >
            {showAllReview ? "Hide" : "Manage"}{" "}
            {cardGroup === "all" ? "all " : ""}
            {selectedCards.length} cards
          </button>
          {showAllReview && (
            <div className="review-manage">
              {selectedCards.map((r) => (
                <div key={r.id}>
                  <strong>{r.front.slice(0, 100)}</strong>
                  <GroupSelect
                    ctx={ctx}
                    value={r.groupId}
                    label={"Group for " + r.front.slice(0, 60)}
                    onChange={(id) =>
                      mutate((w) => {
                        w.review.find((c) => c.id === r.id)!.groupId =
                          id || undefined;
                      })
                    }
                  />
                  <small>
                    {r.suspended
                      ? "Suspended"
                      : "Due " + new Date(r.schedule.due).toLocaleString()}
                  </small>
                  <input
                    aria-label={"Reschedule " + r.front}
                    type="date"
                    value={r.schedule.due.slice(0, 10)}
                    onChange={(e) =>
                      mutate((s) => {
                        s.review.find((c) => c.id === r.id)!.schedule.due =
                          new Date(e.target.value + "T12:00:00").toISOString();
                      })
                    }
                  />
                  <button
                    onClick={() =>
                      mutate((s) => {
                        const c = s.review.find((c) => c.id === r.id)!;
                        c.suspended = !c.suspended;
                      })
                    }
                  >
                    {r.suspended ? "Resume" : "Suspend"}
                  </button>
                  <button
                    onClick={() =>
                      mutate((s) => {
                        s.review = s.review.filter((c) => c.id !== r.id);
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (view === "bookmarks")
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "A PLACE TO COME BACK TO",
            "Your library",
            "Saved originals and bookmarked notes. Study copies are independently editable.",
          )}
          <h3>Bookmarked notes</h3>
          {noteRows(
            w.notes.filter((n) => !n.trashed && w.bookmarks.includes(n.id)),
          )}
          {w.bookmarks
            .filter((id) => !w.notes.some((n) => n.id === id))
            .map((id) => (
              <div className="library-row" key={id}>
                <Bookmark size={16} />
                <a href={"/p/" + id}>Open saved publication</a>
                <button
                  onClick={() =>
                    mutate((s) => {
                      s.bookmarks = s.bookmarks.filter((x) => x !== id);
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          {!w.bookmarks.length && (
            <Empty icon={Bookmark} title="Keep a path back">
              Bookmark a note or save a published collection to find it here.
            </Empty>
          )}
          {w.annotations.some((a) => a.publicationId) && (
            <>
              <h3>Your private reader notes</h3>
              {w.annotations
                .filter((a) => a.publicationId)
                .map((a) => (
                  <article className="study-copy-card" key={a.id}>
                    <div>
                      <a href={"/p/" + a.publicationId + "/" + a.noteId}>
                        Return to the published passage
                      </a>
                      <blockquote>{a.quote}</blockquote>
                      <Markdown body={a.body} />
                      <button
                        className="text-button"
                        onClick={() =>
                          mutate((s) => {
                            s.annotations = s.annotations.filter(
                              (x) => x.id !== a.id,
                            );
                          })
                        }
                      >
                        Delete private note
                      </button>
                    </div>
                  </article>
                ))}
            </>
          )}
          <h3>Independent study copies</h3>
          {w.copies.map((copy) => (
            <div className="study-copy-card" key={copy.id}>
              <GitBranch size={20} />
              <div>
                <strong>
                  {w.containers.find((c) => c.id === copy.containerId)?.title}
                </strong>
                <small>
                  From {copy.baseline.author} · version {copy.baseline.version}
                </small>
              </div>
              <button className="secondary" onClick={() => setMergeId(copy.id)}>
                Check updates
              </button>
              <button
                className="primary"
                onClick={() => ctx.setFocus(copy.containerId)}
              >
                Open copy
              </button>
            </div>
          ))}
          {mergeId && (
            <MergeReview
              ctx={ctx}
              copyId={mergeId}
              onClose={() => setMergeId(null)}
            />
          )}
        </div>
      </div>
    );
  if (view === "discover") {
    const publications = (
      ctx.demo
        ? w.publications
            .filter((p) => p.status === "published")
            .map((p) => p.current)
        : remote
    )
      .filter((p) =>
        (p.title + " " + p.description + " " + p.author + " " + p.topics)
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
      .filter(
        (p) =>
          discoverCategory === "all" ||
          (p.category ?? "General research") === discoverCategory,
      )
      .sort((a, b) =>
        discoverSort === "popular"
          ? ctx.demo
            ? w.copies.filter((c) => c.publicationId === b.publicationId)
                .length -
              w.copies.filter((c) => c.publicationId === a.publicationId).length
            : (b.popularity ?? 0) - (a.popularity ?? 0)
          : b.createdAt.localeCompare(a.createdAt),
      );
    return (
      <div className="view-scroll">
        <div className="social-page social-tabs" aria-label="Discover sections">
          <button
            aria-pressed={discoverMode === "community"}
            onClick={() => setDiscoverMode("community")}
          >
            Community
          </button>
          <button
            aria-pressed={discoverMode === "publications"}
            onClick={() => setDiscoverMode("publications")}
          >
            Published study materials
          </button>
          <button onClick={() => setDialog({ type: "publish-picker" })}>
            Publish your work
          </button>
        </div>
        {discoverMode === "community" ? (
          <CommunityFeed />
        ) : (
          <div className="workspace-view discover-view">
            {header(
              "LEARN FROM THE WHOLE PICTURE",
              "Discover a different perspective",
              "Follow someone’s research, from the first idea to the evidence behind it.",
            )}
            <div className="large-search">
              <Search size={20} />
              <input
                value={query}
                aria-label="Search public research"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="A topic, a question, an author…"
              />
            </div>
            <div className="discover-controls">
              <button
                className="primary"
                onClick={() => setDialog({ type: "publish-picker" })}
              >
                <Globe size={15} />
                Publish a collection or folder
              </button>
              <select
                aria-label="Browse research category"
                value={discoverCategory}
                onChange={(e) => setDiscoverCategory(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                aria-label="Discover order"
                value={discoverSort}
                onChange={(e) => setDiscoverSort(e.target.value)}
              >
                <option value="newest">Newest research</option>
                <option value="popular">Popular · study copies</option>
              </select>
            </div>
            <p className="muted">
              Popularity counts currently saved independent study copies of a
              publication.
            </p>
            {ctx.demo && (
              <p className="demo-disclosure">
                <Globe size={15} /> Local demo publications only. Nothing here
                is published to the internet.
              </p>
            )}
            {loading && <p role="status">Finding published research…</p>}
            {remoteError && <p role="alert">{remoteError}</p>}
            <div className="discovery-list">
              {publications.map((p) => (
                <article className="discovery-card" key={p.id}>
                  <p className="muted">
                    {p.category ?? "General research"} ·{" "}
                    {ctx.demo
                      ? w.copies.filter(
                          (c) => c.publicationId === p.publicationId,
                        ).length
                      : (p.popularity ?? 0)}{" "}
                    study copies · {publicationCounts(p).sources} sources
                  </p>
                  <div className="discovery-card-top">
                    <span className="collection-cover">
                      <BookA size={28} strokeWidth={1.3} />
                    </span>
                    <span className="badge">COLLECTION · V{p.version}</span>
                  </div>
                  <h2>
                    <button
                      onClick={() =>
                        ctx.demo
                          ? setDialog({
                              type: "reader",
                              publicationId: p.publicationId,
                            })
                          : location.assign("/p/" + p.publicationId)
                      }
                    >
                      {p.title}
                    </button>
                  </h2>
                  <p>
                    {p.description ||
                      "A published collection of notes and ideas."}
                  </p>
                  <div className="discovery-meta">
                    <span>{p.author}</span>
                    <span>{p.notes.length} notes</span>
                  </div>
                  <div className="discovery-actions">
                    <button
                      onClick={() =>
                        mutate((s) => {
                          if (!s.bookmarks.includes(p.publicationId))
                            s.bookmarks.push(p.publicationId);
                        }, "Saved to your library.")
                      }
                    >
                      <Bookmark size={15} /> Save
                    </button>
                    {p.allowCopies && (
                      <button
                        onClick={async () => {
                          if (!ctx.demo) {
                            const response = await fetch("/api/publications", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "copy",
                                publicationId: p.publicationId,
                                idempotencyKey: uid(),
                              }),
                            });
                            const data = await response.json();
                            if (!response.ok) {
                              ctx.toast(data.error);
                              return;
                            }
                            location.href = "/w/collection/" + data.containerId;
                            return;
                          }
                          try {
                            const assets = (p.attachments ?? []).map((a) => ({
                              ...a,
                              id: uid(),
                              key: "",
                            }));
                            const db = await localDB();
                            for (const a of p.attachments ?? []) {
                              const blob = await db.get("assets", a.id),
                                target = assets.find((x) => x.hash === a.hash);
                              if (!blob || !target)
                                throw new Error(
                                  "A published attachment is unavailable on this device.",
                                );
                              await db.put("assets", blob, target.id);
                            }
                            mutate((s) => {
                              const copy = instantiateSnapshot(
                                s,
                                p,
                                uid(),
                                assets,
                              );
                              ctx.setFocus(copy.containerId);
                            }, "Independent study copy created.");
                          } catch (e) {
                            ctx.toast((e as Error).message);
                          }
                        }}
                      >
                        <Copy size={15} /> Make a study copy
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {!loading && !publications.length && (
              <Empty
                icon={Globe}
                title={
                  ctx.demo
                    ? "Your research can be someone’s starting point."
                    : "No published research found."
                }
              >
                {ctx.demo
                  ? "Publish a selected note to explore the local reader and study-copy workflow."
                  : "Try another topic or publish a selected collection."}
              </Empty>
            )}
          </div>
        )}
      </div>
    );
  }
  if (view === "jobs")
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "DURABLE WORK",
            "Background jobs",
            "Close this page safely. Your configured worker keeps processing queued work.",
          )}
          <JobStatus demo={ctx.demo} />
        </div>
      </div>
    );
  if (view === "inbox")
    return (
      <div className="view-scroll">
        <div className="workspace-view">
          {header(
            "STAY IN THE CONVERSATION",
            "Inbox",
            "Replies, private clarification requests, and research updates.",
          )}
          <button
            className="text-button"
            onClick={() =>
              mutate((s) =>
                s.notifications.forEach((n) => {
                  n.read = true;
                }),
              )
            }
          >
            Mark all read
          </button>
          {w.notifications.map((n) => (
            <div
              className={"inbox-row " + (!n.read ? "unread" : "")}
              key={n.id}
            >
              <Bell size={18} />
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{new Date(n.createdAt).toLocaleString()}</small>
              </div>
              <button
                onClick={() =>
                  mutate((s) => {
                    s.notifications.find((x) => x.id === n.id)!.read = true;
                  })
                }
              >
                Mark read
              </button>
            </div>
          ))}
          {serverNotifications.map((n) => (
            <div
              className={"inbox-row " + (!n.read ? "unread" : "")}
              key={n.id}
            >
              <Bell size={18} />
              <div>
                <strong>{noteDisplayTitle(n)}</strong>
                <p>{n.body}</p>
                <a href={n.href ?? "/w/inbox"}>Open</a>
              </div>
            </div>
          ))}
          {!!serverNotifications.length && (
            <button
              className="text-button"
              onClick={async () => {
                const r = await fetch("/api/community", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "notifications-read" }),
                });
                if (r.ok)
                  setServerNotifications((ns) =>
                    ns.map((n) => ({ ...n, read: true })),
                  );
                else ctx.toast("Could not update notifications.");
              }}
            >
              Mark server notifications read
            </button>
          )}
          {inbox.map((r) => (
            <div className="inbox-request" key={r.id}>
              <span className="badge">Private clarification · {r.status}</span>
              <h3>{r.category}</h3>
              <Markdown body={r.body} />
              {r.replies?.map((reply: any, i: number) => (
                <blockquote key={i}>{reply.body}</blockquote>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const response = await fetch("/api/community", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "request-reply",
                      requestId: r.id,
                      idempotencyKey: data.get("requestKey"),
                      body: data.get("body"),
                      status: data.get("status"),
                    }),
                  });
                  ctx.toast(
                    response.ok ? "Reply saved." : "Unable to save reply.",
                  );
                }}
              >
                <input type="hidden" name="requestKey" defaultValue={uid()} />
                <textarea
                  name="body"
                  required
                  aria-label="Private reply"
                  placeholder="Reply privately…"
                />
                <select name="status" aria-label="Request status">
                  <option>Open</option>
                  <option>In progress</option>
                  <option>Resolved</option>
                  <option>Closed</option>
                </select>
                <button className="primary">Reply</button>
              </form>
            </div>
          ))}
          {!w.notifications.length && !inbox.length && (
            <Empty icon={Bell} title="A quiet moment">
              You’re all caught up. Meaningful updates will find their way here.
            </Empty>
          )}
        </div>
      </div>
    );
  if (view === "settings") {
    const tabs = [
      "Account",
      "Appearance",
      "Editor",
      "Shortcuts",
      "Sources",
      "AI",
      "Review",
      "Notifications",
      "Privacy",
      "Data",
    ];
    const update = <K extends keyof typeof w.settings>(
      key: K,
      value: (typeof w.settings)[K],
    ) =>
      mutate((s) => {
        s.settings[key] = value;
      });
    return (
      <div className="view-scroll">
        <div className="workspace-view settings-view">
          {header(
            "MAKE YOURSELF AT HOME",
            "Settings",
            "A workspace that feels like your own.",
          )}
          <div className="settings-layout">
            <nav aria-label="Settings sections">
              {tabs.map((t) => (
                <button
                  key={t}
                  className={settingsTab === t ? "active" : ""}
                  onClick={() => setSettingsTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
            <section>
              <h2>{settingsTab}</h2>
              {settingsTab === "Appearance" && (
                <>
                  <Field label="Theme">
                    <div className="theme-options">
                      {(
                        [
                          { id: "system", label: "System", icon: Settings },
                          { id: "light", label: "Light", icon: Sun },
                          { id: "dark", label: "Dark", icon: Moon },
                          { id: "paper", label: "Paper", icon: Feather },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          className={
                            "theme-option theme-" +
                            t.id +
                            " " +
                            (w.settings.theme === t.id ? "selected" : "")
                          }
                          onClick={() => update("theme", t.id)}
                        >
                          <t.icon size={22} />
                          <span>{t.label}</span>
                          {w.settings.theme === t.id && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <ThemeExtras ctx={ctx} />
                  <SettingToggle
                    label="Compact main navigation"
                    description="Hide tab names beneath the icons."
                    value={!!w.settings.ribbonCompact}
                    onChange={(v) => update("ribbonCompact", v)}
                  />
                  <SettingToggle
                    label="Compact right-side tools"
                    description="Show icons with tooltips instead of labels."
                    value={!!w.settings.toolsCompact}
                    onChange={(v) => update("toolsCompact", v)}
                  />
                  <SettingToggle
                    label="Show AI Chat launcher"
                    description="Open the study assistant from the writing screen."
                    value={!w.settings.chatHidden}
                    onChange={(v) => update("chatHidden", !v)}
                  />
                  <button
                    className="secondary"
                    onClick={() =>
                      mutate((w) => {
                        w.settings.onboardingComplete = false;
                      })
                    }
                  >
                    Revisit welcome walkthrough
                  </button>
                  <SettingToggle
                    label="Colored collection rows"
                    description="Bring a little more of each collection’s color into the explorer."
                    value={w.settings.coloredRows}
                    onChange={(v) => update("coloredRows", v)}
                  />
                </>
              )}
              {settingsTab === "Editor" && (
                <>
                  <Field label="Writing font">
                    <select
                      value={w.settings.fontFamily}
                      onChange={(e) => update("fontFamily", e.target.value)}
                    >
                      <option value="sans">Clean sans serif</option>
                      <option value="serif">Literary serif</option>
                      <option value="mono">Monospace</option>
                    </select>
                  </Field>
                  <Field label={"Font size · " + w.settings.fontSize + " px"}>
                    <input
                      type="range"
                      min={12}
                      max={28}
                      value={w.settings.fontSize}
                      onChange={(e) =>
                        update("fontSize", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label={"Line height · " + w.settings.lineHeight}>
                    <input
                      type="range"
                      min={1.3}
                      max={2.2}
                      step={0.05}
                      value={w.settings.lineHeight}
                      onChange={(e) =>
                        update("lineHeight", Number(e.target.value))
                      }
                    />
                  </Field>
                  <SettingToggle
                    label="Full-width writing"
                    description="Let your note use all the available writing space."
                    value={w.settings.fullWidth}
                    onChange={(v) => update("fullWidth", v)}
                  />
                  <Field label="Default editor mode">
                    <select
                      value={w.settings.defaultMode}
                      onChange={(e) =>
                        update(
                          "defaultMode",
                          e.target.value as typeof w.settings.defaultMode,
                        )
                      }
                    >
                      <option value="live">Live preview</option>
                      <option value="source">Source</option>
                      <option value="reading">Reading</option>
                    </select>
                  </Field>
                  <Field label="Daily journal template">
                    <textarea
                      rows={7}
                      value={w.settings.journalTemplate}
                      onChange={(e) =>
                        update("journalTemplate", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Dream journal template">
                    <textarea
                      rows={7}
                      value={w.settings.dreamTemplate}
                      onChange={(e) => update("dreamTemplate", e.target.value)}
                    />
                  </Field>
                </>
              )}
              {settingsTab === "Shortcuts" && (
                <>
                  <p className="muted">
                    Mod means Ctrl on Windows/Linux and Cmd on macOS.
                    Browser-reserved shortcuts may need a different mapping.
                  </p>
                  {Object.entries(w.settings.shortcuts).map(([action, key]) => (
                    <Field key={action} label={action}>
                      <input
                        value={key}
                        onChange={(e) =>
                          update("shortcuts", {
                            ...w.settings.shortcuts,
                            [action]: e.target.value,
                          })
                        }
                      />
                      {Object.values(w.settings.shortcuts).filter(
                        (k) => k.toLowerCase() === key.toLowerCase(),
                      ).length > 1 && (
                        <small className="danger">
                          This shortcut is assigned to more than one action.
                        </small>
                      )}
                    </Field>
                  ))}
                  <p className="field-hint">
                    In the editor: Ctrl/Cmd B = bold, I = italic, K = link, F =
                    find/replace. Tab indents a list. F2 renames a focused tree
                    item. Escape closes the top dialog or exits Zen.
                  </p>
                </>
              )}
              {settingsTab === "Sources" && (
                <>
                  <SettingToggle
                    label="Capture research links"
                    description="URLs in note prose become Sources. Code, image embeds, and local paths are excluded."
                    value={w.settings.autoCapture}
                    onChange={(v) => update("autoCapture", v)}
                  />
                  <SettingToggle
                    label="Automatic identifier enrichment"
                    description="Allow DOI, arXiv, and ISBN identifiers to be sent to Crossref, arXiv, or Open Library by the background worker."
                    value={w.settings.autoEnrich}
                    onChange={(v) => update("autoEnrich", v)}
                  />
                  <p className="field-hint">
                    Manual title and author edits take precedence over provider
                    metadata.
                  </p>
                </>
              )}
              {settingsTab === "AI" && (
                <>
                  <SettingToggle
                    label="Allow explicit study requests"
                    description="Only context selected for a study request is sent to the configured provider. Journals are excluded from broad context."
                    value={w.settings.aiConsent}
                    onChange={(v) => update("aiConsent", v)}
                  />
                  <p>
                    Provider credentials are configured on the server. The
                    editor works independently of AI availability.
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      mutate((s) => {
                        s.ai = [];
                      }, "AI conversation history deleted.")
                    }
                  >
                    Delete my AI history
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void ctx.exportData({ full: true })}
                  >
                    Export AI history in a private backup
                  </button>
                </>
              )}
              {settingsTab === "Review" && (
                <>
                  <Field label="Timezone">
                    <input
                      value={w.settings.timezone}
                      onChange={(e) => {
                        try {
                          new Intl.DateTimeFormat("en", {
                            timeZone: e.target.value,
                          });
                          update("timezone", e.target.value);
                        } catch {
                          /* Keep the last valid timezone. */
                        }
                      }}
                      list="timezones"
                    />
                    <datalist id="timezones">
                      {Intl.supportedValuesOf("timeZone").map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Daily new-card limit">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={w.settings.newCap}
                      onChange={(e) =>
                        update(
                          "newCap",
                          Math.max(0, Math.min(500, Number(e.target.value))),
                        )
                      }
                    />
                  </Field>
                  <Field label="Daily review limit">
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={w.settings.reviewCap}
                      onChange={(e) =>
                        update(
                          "reviewCap",
                          Math.max(0, Math.min(1000, Number(e.target.value))),
                        )
                      }
                    />
                  </Field>
                  <p className="field-hint">
                    Studyspace scheduler v1 uses deterministic learning steps
                    and increasing review intervals. Missed days never erase
                    your history.
                  </p>
                </>
              )}
              {settingsTab === "Notifications" && (
                <SettingToggle
                  label="In-app notifications"
                  description="Replies, clarification updates, and available upstream versions. No journal text in previews."
                  value={w.settings.notifications}
                  onChange={(v) => update("notifications", v)}
                />
              )}
              {settingsTab === "Privacy" && (
                <>
                  <SettingToggle
                    label="Load remote images"
                    description="External image servers can receive your IP address when their images load. This is off by default."
                    value={w.settings.remoteImages}
                    onChange={(v) => update("remoteImages", v)}
                  />
                  <p>
                    New notes, definitions, sources, journals, and annotations
                    are private. Publishing creates a separate reviewed
                    snapshot.
                  </p>
                  <p>
                    Private access is enforced through account permissions.
                    Studyspace does not provide end-to-end encryption.
                  </p>
                  <h3>Your publications</h3>
                  {w.publications.map((p) => (
                    <div className="library-row" key={p.id}>
                      <span>
                        {p.current.title} · v{p.current.version} · {p.status}
                      </span>
                      <button
                        onClick={async () => {
                          if (ctx.demo)
                            mutate((s) => {
                              s.publications.find(
                                (x) => x.id === p.id,
                              )!.status = "unpublished";
                            });
                          else {
                            const r = await fetch("/api/publications", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "unpublish",
                                publicationId: p.id,
                              }),
                            });
                            ctx.toast(
                              r.ok
                                ? "Public access removed."
                                : "Unable to unpublish.",
                            );
                          }
                        }}
                      >
                        Unpublish
                      </button>
                    </div>
                  ))}
                  <p className="field-hint">
                    Unpublishing revokes app access immediately; independent
                    copies and previous downloads remain with their owners.
                  </p>
                </>
              )}
              {settingsTab === "Account" && (
                <>
                  <Field label="Public display name">
                    <input
                      value={w.settings.displayName}
                      maxLength={80}
                      onChange={(e) => update("displayName", e.target.value)}
                    />
                  </Field>
                  <Field label="Biography">
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={w.settings.bio}
                      onChange={(e) => update("bio", e.target.value)}
                    />
                  </Field>
                  {ctx.demo ? (
                    <p className="demo-disclosure">
                      You’re in the local demo. There is no simulated account or
                      cloud sync.{" "}
                      <a href="/auth">Sign in to a configured account</a>
                    </p>
                  ) : (
                    <>
                      <Field label="New password">
                        <input
                          type="password"
                          value={password}
                          minLength={8}
                          autoComplete="new-password"
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </Field>
                      <button
                        className="secondary"
                        disabled={password.length < 8}
                        onClick={async () => {
                          const { error } =
                            await browserClient().auth.updateUser({ password });
                          ctx.toast(error?.message ?? "Password updated.");
                          setPassword("");
                        }}
                      >
                        Update password
                      </button>
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            await ctx.signOut();
                          } catch (e) {
                            ctx.toast((e as Error).message);
                          }
                        }}
                      >
                        <LogOut size={15} /> Sign out
                      </button>
                    </>
                  )}
                  <a className="text-button" href="/policies">
                    Privacy, community, and reuse information
                  </a>
                </>
              )}
              {settingsTab === "Data" && (
                <>
                  <button
                    className="primary"
                    onClick={() => void ctx.exportData()}
                  >
                    Export all Markdown notes as ZIP
                  </button>
                  <p className="muted">
                    Includes your folder hierarchy and readable filenames. The
                    archive is prepared in the background; your browser controls
                    the final download.
                  </p>
                  <div className="storage-summary">
                    <strong>
                      {(
                        w.attachments
                          .filter((a) => !a.trashed)
                          .reduce((n, a) => n + a.size, 0) / 1048576
                      ).toFixed(1)}{" "}
                      MB
                    </strong>
                    <span>
                      in attachments ·{" "}
                      {w.notes.filter((n) => !n.trashed).length} notes
                    </span>
                  </div>
                  <div className="stack-actions">
                    <button
                      className="primary"
                      onClick={() => void ctx.exportData({ full: true })}
                    >
                      <Download size={15} /> Download a full personal backup
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setDialog({ type: "import" })}
                    >
                      <Upload size={15} /> Import notes
                    </button>
                  </div>
                  <JobStatus demo={ctx.demo} />
                  <h3>Trash</h3>
                  <p className="field-hint">
                    Trashed content stays recoverable until you purge it. The
                    operator can configure a 30-day retention job.
                  </p>
                  {w.notes
                    .filter((n) => n.trashed)
                    .map((n) => (
                      <div className="trash-row" key={n.id}>
                        <FileText size={14} />
                        <span>{noteDisplayTitle(n)}</span>
                        <button
                          onClick={() =>
                            mutate((s) => {
                              const target = s.notes.find(
                                (x) => x.id === n.id,
                              )!;
                              target.trashed = false;
                              if (
                                s.containers.find(
                                  (c) => c.id === target.containerId,
                                )?.trashed
                              )
                                target.containerId = general(s).id;
                            }, "Note restored.")
                          }
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                      </div>
                    ))}
                  {w.containers
                    .filter(
                      (c) =>
                        c.trashed &&
                        (!c.parentId ||
                          !w.containers.find((x) => x.id === c.parentId)
                            ?.trashed),
                    )
                    .map((c) => (
                      <div className="trash-row" key={c.id}>
                        <Folder size={14} />
                        <span>{c.title}</span>
                        <button
                          onClick={() =>
                            mutate((s) => trashItems(s, [c.id], true))
                          }
                        >
                          Restore tree
                        </button>
                      </div>
                    ))}
                  {w.definitions
                    .filter((d) => d.trashed)
                    .map((d) => (
                      <div className="trash-row" key={d.id}>
                        <BookA size={14} />
                        <span>{d.term}</span>
                        <button
                          onClick={() =>
                            mutate((s) => {
                              s.definitions.find(
                                (x) => x.id === d.id,
                              )!.trashed = false;
                            })
                          }
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  {w.attachments
                    .filter((a) => a.trashed)
                    .map((a) => (
                      <div className="trash-row" key={a.id}>
                        <span>{a.filename}</span>
                        <button
                          onClick={() =>
                            mutate((s) => {
                              s.attachments.find(
                                (x) => x.id === a.id,
                              )!.trashed = false;
                            })
                          }
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  <h3>Archived items</h3>
                  {[...w.containers, ...w.notes]
                    .filter((n) => n.archived)
                    .map((n) => (
                      <div className="trash-row" key={n.id}>
                        <Archive size={14} />
                        <span>
                          {"body" in n ? noteDisplayTitle(n) : n.title}
                        </span>
                        <button
                          onClick={() =>
                            mutate((s) => {
                              const item =
                                s.containers.find((c) => c.id === n.id) ??
                                s.notes.find((c) => c.id === n.id);
                              if (item) item.archived = false;
                            })
                          }
                        >
                          Unarchive
                        </button>
                      </div>
                    ))}
                  <h3>Delete account</h3>
                  <p className="field-hint">
                    This removes active private data and publications.
                    Independent study copies and backup retention follow the
                    operator policy.
                  </p>
                  <button
                    className="secondary danger"
                    onClick={() => ctx.setDialog({ type: "delete-account" })}
                  >
                    Review account deletion
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }
  return <Empty title="Choose a note to begin">Your workspace is ready.</Empty>;
}
function SettingToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
