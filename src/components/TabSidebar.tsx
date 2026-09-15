"use client";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Layers,
  Plus,
  BookA,
  Link2,
} from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import { noteDisplayTitle } from "@/lib/journal-date";
import { cardsInGroup } from "@/lib/enhancements";
import { ancestry } from "@/lib/model";
export type SidebarRequest = {
  kind: "journal" | "review";
  id: string;
  sequence: number;
};
export default function TabSidebar({
  ctx,
  view,
  onReviewGroup,
}: {
  ctx: AppContext;
  view: string;
  onReviewGroup: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const quickList = useRef<HTMLElement>(null);
  useEffect(() => {
    if (view === "quick-notes")
      quickList.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [view, ctx.active?.id]);
  const visibleNotes = ctx.w.notes.filter(
    (n) =>
      !n.trashed && ancestry(ctx.w, n.containerId).every((c) => !c.trashed),
  );
  const toggle = (key: string, defaultOpen = false) =>
    setExpanded((old) => ({ ...old, [key]: !(old[key] ?? defaultOpen) }));
  const notes = (items: typeof visibleNotes, journal = false) =>
    items.map((note) => (
      <button
        key={note.id}
        className={
          "context-sidebar-item" +
          (ctx.active?.id === note.id ? " selected" : "")
        }
        aria-current={ctx.active?.id === note.id ? "page" : undefined}
        title={noteDisplayTitle(note)}
        onClick={() =>
          journal ? ctx.openJournalNote(note.id) : ctx.openNote(note.id)
        }
      >
        <FileText size={15} />
        <span>
          {noteDisplayTitle(note)}
          {journal && note.journalDate && (
            <small>
              {note.journalDate}
              {note.kind === "dream" ? " · Dream" : ""}
            </small>
          )}
        </span>
      </button>
    ));
  if (view === "journal" || view === "dreams") {
    const entries = visibleNotes
      .filter((n) => n.kind === "journal" || n.kind === "dream")
      .sort((a, b) =>
        (b.journalDate ?? b.createdAt).localeCompare(
          a.journalDate ?? a.createdAt,
        ),
      );
    const months = [
      ...new Set(
        entries.map((n) => (n.journalDate ?? n.createdAt).slice(0, 7)),
      ),
    ];
    return (
      <>
        <div className="tree-heading">
          <span>JOURNAL</span>
          <span className="badge">{entries.length}</span>
        </div>
        <nav
          className="tree-scroll context-sidebar"
          aria-label="Journal entries by month"
        >
          {months.map((month, index) => {
            const label = new Date(month + "-01T12:00:00").toLocaleDateString(
              undefined,
              { month: "long", year: "numeric" },
            );
            const children = entries.filter((n) =>
              (n.journalDate ?? n.createdAt).startsWith(month),
            );
            const open = expanded[month] ?? index === 0;
            return (
              <section key={month}>
                <button
                  className="context-sidebar-group"
                  aria-expanded={open}
                  onClick={() => toggle(month, index === 0)}
                >
                  <ChevronRight size={14} className={open ? "expanded" : ""} />
                  <CalendarDays size={16} />
                  <strong>{label}</strong>
                  <span className="badge">{children.length}</span>
                </button>
                {open && (
                  <div className="context-sidebar-children">
                    {notes(children, true)}
                  </div>
                )}
              </section>
            );
          })}
          {!entries.length && (
            <p className="tree-hint">
              Your journal entries will appear here, grouped by month.
            </p>
          )}
        </nav>
      </>
    );
  }
  if (view === "review") {
    const groups = [
      ...(ctx.w.settings.cardGroups ?? []).map((g) => ({
        id: g.id,
        title: g.title,
      })),
      { id: "", title: "Ungrouped" },
    ];
    return (
      <>
        <div className="tree-heading">
          <span>STUDY GROUPS</span>
          <span className="badge">{ctx.w.review.length}</span>
        </div>
        <nav
          className="tree-scroll context-sidebar"
          aria-label="Review study groups"
        >
          <button
            className="context-sidebar-item"
            onClick={() => onReviewGroup("all")}
          >
            <Layers size={16} />
            All study cards
          </button>
          {groups.map((group) => {
            const cards = cardsInGroup(ctx.w, group.id),
              key = "review:" + group.id,
              open = expanded[key] ?? false;
            return (
              <section key={key}>
                <div className="context-sidebar-group">
                  <button
                    className="context-sidebar-toggle"
                    aria-label={(open ? "Collapse " : "Expand ") + group.title}
                    aria-expanded={open}
                    onClick={() => toggle(key)}
                  >
                    <ChevronRight
                      size={14}
                      className={open ? "expanded" : ""}
                    />
                  </button>
                  <button
                    className="context-sidebar-group-title"
                    onClick={() => {
                      onReviewGroup(group.id);
                      setExpanded((old) => ({ ...old, [key]: true }));
                    }}
                  >
                    <Layers size={16} />
                    <strong>{group.title}</strong>
                    <span className="badge">{cards.length}</span>
                  </button>
                </div>
                {open && (
                  <div className="context-sidebar-children">
                    {cards.map((card) => (
                      <button
                        className="context-sidebar-item"
                        key={card.id}
                        title={card.front}
                        onClick={() =>
                          ctx.setDialog({ type: "review-preview", id: card.id })
                        }
                      >
                        <BookA size={14} />
                        <span>{card.front || "Untitled card"}</span>
                      </button>
                    ))}
                    {!cards.length && (
                      <p className="tree-hint">
                        No study cards in this group yet.
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
      </>
    );
  }
  if (view === "quick-notes") {
    const quick = visibleNotes
      .filter((n) => n.kind === "quick")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return (
      <>
        <div className="tree-heading">
          <span>QUICK NOTES</span>
          <button
            className="icon-button"
            aria-label="New quick note"
            onClick={() => ctx.setDialog({ type: "quick" })}
          >
            <Plus size={16} />
          </button>
        </div>
        <nav
          ref={quickList}
          className="tree-scroll context-sidebar"
          aria-label="Quick notes"
        >
          {notes(quick)}
          {!quick.length && (
            <p className="tree-hint">
              Capture a thought with Quick note above.
            </p>
          )}
        </nav>
      </>
    );
  }
  const title = view
    .split("-")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
  return (
    <>
      <div className="tree-heading">
        <span>{title.toUpperCase()}</span>
      </div>
      <nav
        className="tree-scroll context-sidebar"
        aria-label={title + " sidebar"}
      >
        {view === "dictionary" ? (
          ctx.w.definitions
            .filter((d) => !d.trashed)
            .map((d) => (
              <button
                className="context-sidebar-item"
                key={d.id}
                onClick={() =>
                  ctx.setDialog({ type: "definition-detail", id: d.id })
                }
              >
                <BookA size={15} />
                <span>{d.term}</span>
              </button>
            ))
        ) : view === "sources" ? (
          ctx.w.sources.map((source) => (
            <button
              className="context-sidebar-item"
              key={source.id}
              onClick={() =>
                ctx.setDialog({ type: "source-detail", id: source.id })
              }
            >
              <Link2 size={15} />
              <span>{source.title}</span>
            </button>
          ))
        ) : (
          <p className="tree-hint">
            {view === "planner" || view === "calendar"
              ? "Your schedule and tasks are shown beside this sidebar."
              : "Use the main area to explore " + title.toLowerCase() + "."}
          </p>
        )}
      </nav>
    </>
  );
}
