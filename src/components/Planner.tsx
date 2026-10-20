"use client";
import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { type AppContext } from "./WorkspaceApp";
import { Modal } from "./ui";
import { localDateKey } from "@/lib/dates";
import {
  newPlannerTask,
  calendarRange,
  plannerWeek,
  plannerGroups,
  type PlannerTask,
} from "@/lib/planner";
import { serviceCommand } from "@/lib/services";
import { connectAccount } from "@/lib/device";
import CollaborationPanel from "./social/CollaborationPanel";
export default function Planner({
  ctx,
  calendar = false,
}: {
  ctx: AppContext;
  calendar?: boolean;
}) {
  const [month, setMonth] = useState(localDateKey().slice(0, 7)),
    [selected, setSelected] = useState(localDateKey()),
    [weekAnchor, setWeekAnchor] = useState(localDateKey());
  const [remote, setRemote] = useState<any>(null),
    [google, setGoogle] = useState<any>(null),
    [draft, setDraft] = useState<PlannerTask | null>(null),
    [assignee, setAssignee] = useState(""),
    [people, setPeople] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const week = plannerWeek(weekAnchor);
  const weekEnd = new Date(week[6] + "T00:00:00");
  weekEnd.setDate(weekEnd.getDate() + 1);
  const eventRange = calendar
    ? calendarRange(month)
    : {
        from: new Date(week[0] + "T00:00:00").toISOString(),
        to: weekEnd.toISOString(),
      };
  const connected = !!ctx.cloudAccount || !ctx.demo;
  const load = async () => {
    if (!connected) {
      setRemote(null);
      setGoogle(null);
      return;
    }
    try {
      const r = await fetch("/api/collaboration");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRemote(d);
      const g = await fetch("/api/google?" + new URLSearchParams(eventRange));
      const gd = await g.json();
      if (!g.ok) throw Error(gd.error);
      setGoogle(gd);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [connected, eventRange.from, eventRange.to]);
  const tasks: PlannerTask[] = [
    ...(ctx.w.settings.plannerTasks ?? []),
    ...(remote?.tasks ?? []),
  ];
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const updateLocal = (task: PlannerTask) =>
    ctx.mutate((w) => {
      w.settings.plannerTasks = [
        ...(w.settings.plannerTasks ?? []).filter((t) => t.id !== task.id),
        { ...task, revision: task.revision + 1 },
      ];
    });
  const edit = (task: PlannerTask) => {
    setDraft({ ...task });
    setAssignee(task.assignee_id ?? "");
  };
  const googleAction = async (
    action: string,
    data: Record<string, unknown> = {},
  ) => {
    const r = await fetch("/api/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    if (d.url) window.open(d.url, "_blank", "noopener,noreferrer");
    else await load();
    return d;
  };
  const today = localDateKey();
  const groups = plannerGroups(tasks, today);
  const visible = tasks.filter((t) => t.due_date === selected);
  const shiftWeek = (amount: number) => {
    const date = new Date(weekAnchor + "T12:00:00");
    date.setDate(date.getDate() + amount * 7);
    setWeekAnchor(localDateKey(date));
  };
  const first = new Date(month + "-01T12:00:00"),
    days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const renderTasks = (items: PlannerTask[]) => (
    <div className="planner-tasks">
      {items.map((t) => (
        <article
          className={"planner-task-row" + (t.completed ? " is-completed" : "")}
          key={t.id}
        >
          <input
            type="checkbox"
            aria-label={"Complete " + t.title}
            checked={t.completed}
            disabled={busy}
            onChange={() =>
              void act(async () => {
                if (t.owner_id) {
                  await serviceCommand("task-save", {
                    ...t,
                    completed: !t.completed,
                  });
                  await load();
                } else updateLocal({ ...t, completed: !t.completed });
              })
            }
          />
          <div className="planner-task-body">
            <div className="social-row">
              <button className="planner-task-title" onClick={() => edit(t)}>
                {t.title}
              </button>
              <span className="social-tag">{t.priority}</span>
            </div>
            <p>{t.description}</p>
            <small>
              {t.due_date || "No due date"} {t.due_time?.slice(0, 5)} ·{" "}
              {t.owner_id ? "Shared task" : "On this device"}
            </small>
            {t.due_date && t.due_date < today && !t.completed && (
              <span className="social-error"> Overdue</span>
            )}
            <div className="social-row">
              <button onClick={() => edit(t)}>Edit</button>
              {(!t.owner_id || t.owner_id === remote?.viewer) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      if (t.owner_id) {
                        await serviceCommand("task-delete", {
                          id: t.id,
                          revision: t.revision,
                        });
                        await load();
                      } else
                        ctx.mutate((w) => {
                          w.settings.plannerTasks =
                            w.settings.plannerTasks?.filter(
                              (n) => n.id !== t.id,
                            );
                        });
                    })
                  }
                >
                  Delete
                </button>
              )}
              {google?.connected && t.due_date && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await googleAction("sync-task", { task: t });
                      setMessage(
                        "Task saved to your selected Google calendar.",
                      );
                    })
                  }
                >
                  Save to Google Calendar
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <section className="view-scroll">
      <div className="social-page planner-page">
        <header className="social-heading">
          <div>
            <span className="eyebrow">MAKE TIME TO LEARN</span>
            <h1>{calendar ? "Calendar" : "Planner"}</h1>
            <p>
              Private plans stay on this device. Share individual tasks with
              accepted collaborators.
            </p>
          </div>
          <button
            className="primary"
            onClick={() => edit({ ...newPlannerTask(), due_date: selected })}
          >
            <Plus size={16} /> New task
          </button>
        </header>
        {!calendar && (
          <section className="planner-week" aria-label="Week calendar">
            <div className="planner-week-heading">
              <h2>
                {new Date(week[0] + "T12:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                –{" "}
                {new Date(week[6] + "T12:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
              <div className="inline-actions">
                <button
                  aria-label="Previous week"
                  onClick={() => shiftWeek(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => {
                    setWeekAnchor(today);
                    setSelected(today);
                  }}
                >
                  Today
                </button>
                <button aria-label="Next week" onClick={() => shiftWeek(1)}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="planner-week-scroll">
              <div className="planner-week-grid">
                {week.map((date) => {
                  const dayTasks = tasks.filter(
                    (t) => t.due_date === date && !t.completed,
                  );
                  const events = (google?.events ?? []).filter(
                    (event: any) =>
                      (event.start?.date ||
                        (event.start?.dateTime
                          ? localDateKey(new Date(event.start.dateTime))
                          : undefined)) === date,
                  );
                  return (
                    <button
                      className="planner-week-day"
                      key={date}
                      aria-label={
                        date +
                        ", " +
                        dayTasks.length +
                        " tasks, " +
                        events.length +
                        " events"
                      }
                      aria-current={date === today ? "date" : undefined}
                      aria-pressed={date === selected}
                      onClick={() => setSelected(date)}
                    >
                      <span className="planner-week-weekday">
                        {new Date(date + "T12:00:00").toLocaleDateString(
                          undefined,
                          { weekday: "short" },
                        )}
                      </span>
                      <strong>{Number(date.slice(-2))}</strong>
                      <span className="planner-week-items">
                        {dayTasks.slice(0, 3).map((t) => (
                          <span key={t.id} title={t.title}>
                            {t.title}
                          </span>
                        ))}
                        {events.slice(0, 2).map((e: any) => (
                          <span
                            className="planner-week-event"
                            key={e.id}
                            title={e.summary}
                          >
                            {e.summary || "Calendar event"}
                          </span>
                        ))}
                        {dayTasks.length > 3 && (
                          <small>+{dayTasks.length - 3} tasks</small>
                        )}
                        {events.length > 2 && (
                          <small>+{events.length - 2} events</small>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="field-hint">
              New tasks use{" "}
              {new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
              . Select a day to change it.
            </p>
          </section>
        )}
        <div className="social-row">
          {calendar && (
            <button onClick={() => ctx.setView("planner")}>Open planner</button>
          )}
          {connected ? (
            <>
              <button onClick={() => setPeople(true)}>
                Planner collaborators
              </button>
              <button disabled={busy} onClick={() => void act(load)}>
                Refresh shared tasks
              </button>
            </>
          ) : (
            <button
              onClick={() =>
                void connectAccount().catch((e) => setError(e.message))
              }
            >
              Sign in to share plans
            </button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {calendar && (
          <>
            <div className="planner-month social-row">
              <button
                aria-label="Previous calendar month"
                onClick={() =>
                  setMonth(
                    localDateKey(
                      new Date(first.getFullYear(), first.getMonth() - 1, 1),
                    ).slice(0, 7),
                  )
                }
              >
                <ChevronLeft />
              </button>
              <h2>
                {first.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <button
                aria-label="Next calendar month"
                onClick={() =>
                  setMonth(
                    localDateKey(
                      new Date(first.getFullYear(), first.getMonth() + 1, 1),
                    ).slice(0, 7),
                  )
                }
              >
                <ChevronRight />
              </button>
              <button
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelected(today);
                }}
              >
                Today
              </button>
            </div>
            <div className="planner-calendar">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <strong key={d}>{d}</strong>
              ))}
              {Array.from({ length: first.getDay() }, (_, i) => (
                <span key={"blank" + i} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const date = month + "-" + String(i + 1).padStart(2, "0"),
                  count = tasks.filter(
                    (t) => t.due_date === date && !t.completed,
                  ).length;
                return (
                  <button
                    key={date}
                    aria-current={date === today ? "date" : undefined}
                    aria-pressed={date === selected}
                    aria-label={date + (count ? `, ${count} tasks` : "")}
                    onClick={() => setSelected(date)}
                  >
                    <span>{i + 1}</span>
                    {count > 0 && <small>{count} tasks</small>}
                  </button>
                );
              })}
            </div>
            <h2>
              {new Date(selected + "T12:00:00").toLocaleDateString(undefined, {
                dateStyle: "full",
              })}
            </h2>
          </>
        )}
        {calendar ? (
          <>
            {renderTasks(visible)}
            {!visible.length && <p>No tasks for this day.</p>}
          </>
        ) : (
          <div className="planner-checklist">
            <section aria-label="To do tasks">
              <h2>
                To do <span className="badge">{groups.todo.length}</span>
              </h2>
              {renderTasks(groups.todo)}
              {!groups.todo.length && (
                <p className="muted">
                  Nothing to do yet. Add your next task below.
                </p>
              )}
              <button
                className="planner-add-task"
                onClick={() =>
                  edit({ ...newPlannerTask(), due_date: selected })
                }
              >
                <Plus size={17} /> Add task
              </button>
            </section>
            <section aria-label="Overdue tasks">
              <h2>
                Overdue <span className="badge">{groups.overdue.length}</span>
              </h2>
              {renderTasks(groups.overdue)}
              {!groups.overdue.length && (
                <p className="muted">You’re all caught up. No overdue tasks.</p>
              )}
            </section>
            <details className="planner-completed">
              <summary>
                Completed{" "}
                <span className="badge">{groups.completed.length}</span>
              </summary>
              {renderTasks(groups.completed)}
              {!groups.completed.length && (
                <p className="muted">Completed tasks will appear here.</p>
              )}
            </details>
          </div>
        )}
        {calendar && (
          <section className="social-card">
            <h2>
              <CalendarDays size={20} /> Google Calendar
            </h2>
            {!connected ? (
              <p>Sign in to connect a calendar.</p>
            ) : !google?.configured ? (
              <p>
                Google Calendar is not configured yet. The app operator needs to
                add Google OAuth credentials.
              </p>
            ) : !google.connected ? (
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await googleAction("connect");
                    setMessage(
                      "Complete authorization in your browser, then refresh Calendar.",
                    );
                  })
                }
              >
                Connect Google Calendar
              </button>
            ) : (
              <>
                <label>
                  Calendar
                  <select
                    value={google.calendarId}
                    disabled={busy}
                    onChange={(e) =>
                      void act(() =>
                        googleAction("select", {
                          calendarId: e.target.value,
                        }).then(() => {}),
                      )
                    }
                  >
                    {google.calendars?.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() => googleAction("disconnect").then(() => {}))
                  }
                >
                  Disconnect Google Calendar
                </button>
                {google.events
                  ?.filter(
                    (e: any) =>
                      (e.start?.date ||
                        (e.start?.dateTime
                          ? localDateKey(new Date(e.start.dateTime))
                          : undefined)) === selected,
                  )
                  .map((e: any) => (
                    <div className="social-card" key={e.id}>
                      <strong>{e.summary || "Untitled event"}</strong>
                      <p>
                        {e.start?.dateTime
                          ? new Date(e.start.dateTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "All day"}
                      </p>
                      <button
                        onClick={() =>
                          edit({
                            ...newPlannerTask(),
                            title: e.summary || "Calendar event",
                            description: e.description ?? "",
                            due_date: selected,
                          })
                        }
                      >
                        Copy into private planner
                      </button>
                      {e.htmlLink && (
                        <a
                          href={e.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open event
                        </a>
                      )}
                    </div>
                  ))}
              </>
            )}
          </section>
        )}
        {draft && (
          <Modal
            title={draft.revision ? "Edit task" : "New task"}
            onClose={() => setDraft(null)}
          >
            <form
              className="social-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  if (assignee || draft.owner_id) {
                    await serviceCommand("task-save", { ...draft, assignee });
                    if (!draft.owner_id)
                      ctx.mutate((w) => {
                        w.settings.plannerTasks =
                          w.settings.plannerTasks?.filter(
                            (t) => t.id !== draft.id,
                          );
                      });
                    await load();
                  } else updateLocal(draft);
                  setDraft(null);
                });
              }}
            >
              <label>
                Task title
                <input
                  required
                  maxLength={240}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  maxLength={20000}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={draft.due_date ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, due_date: e.target.value || null })
                  }
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={draft.due_time?.slice(0, 5) ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, due_time: e.target.value || null })
                  }
                />
              </label>
              <label>
                Priority
                <select
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      priority: e.target.value as PlannerTask["priority"],
                    })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              {connected && (
                <label>
                  Share with
                  <select
                    disabled={!!draft.owner_id}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">Private · this device</option>
                    {remote?.connections?.map((p: any) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {assignee && (
                <p>
                  This task's title, description and dates will be stored in the
                  cloud and emailed to your collaborator when delivery is
                  configured.
                </p>
              )}
              {error && <p role="alert">{error}</p>}
              <button className="primary" disabled={busy}>
                Save task
              </button>
            </form>
          </Modal>
        )}
        {people && (
          <Modal title="Planner collaborators" onClose={() => setPeople(false)}>
            <CollaborationPanel
              kind="planner"
              canInvite
              onChange={() => void load()}
            />
          </Modal>
        )}
      </div>
    </section>
  );
}
