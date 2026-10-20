"use client";
import "./weekly-checkups.css";
import { useEffect, useState } from "react";
import CheckupSession from "./CheckupSession";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Copy,
  History,
  LayoutTemplate,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { AppContext } from "./WorkspaceApp";
import type { SidebarRequest } from "./TabSidebar";
import { IconButton, Modal } from "./ui";
import { TemplateBuilder } from "./CheckupForms";
import { localDate, now, uid } from "@/lib/model";
import {
  answerText,
  checkupProgress,
  changeCheckupTemplate,
  checkupStats,
  comparisonRows,
  createCheckup,
  defaultCheckupTemplates,
  emptyCheckups,
  lifeAreas,
  lifeGoalSchema,
  shiftDate,
  weekLabel,
  weekStart,
  type CheckupCommitment,
  type CheckupEntry,
  type CheckupTemplate,
  type LifeGoal,
  type WeeklyCheckupsData,
} from "@/lib/weekly-checkups";

type Mode = "week" | "history" | "compare" | "goals" | "templates";
const outcomes: Record<CheckupCommitment["outcome"], string> = {
  pending: "Not reviewed",
  done: "Accomplished",
  partial: "Partly accomplished",
  missed: "Not this time",
};

export default function WeeklyCheckups({
  ctx,
  sidebarRequest,
}: {
  ctx: AppContext;
  sidebarRequest?: SidebarRequest;
}) {
  const today = localDate(ctx.w.settings.timezone),
    thisWeek = weekStart(today);
  const data = ctx.w.settings.weeklyCheckups ?? emptyCheckups();
  const [mode, setMode] = useState<Mode>("week"),
    [selectedWeek, setSelectedWeek] = useState(thisWeek),
    [sessionOpen, setSessionOpen] = useState(false);
  const [changingTemplate, setChangingTemplate] = useState(false);
  const [templateId, setTemplateId] = useState(defaultCheckupTemplates[0].id);
  const [builder, setBuilder] = useState<CheckupTemplate | null>(null),
    [goalEditor, setGoalEditor] = useState<LifeGoal | null>(null);
  const [remove, setRemove] = useState<{
    kind: "entry" | "template";
    id: string;
  } | null>(null);
  const [search, setSearch] = useState(""),
    [historyFilter, setHistoryFilter] = useState("all");
  const [leftId, setLeftId] = useState(""),
    [rightId, setRightId] = useState("");
  const templates = [...defaultCheckupTemplates, ...data.templates];
  const entries = [...data.entries].sort((a, b) =>
    b.week.localeCompare(a.week),
  );
  const entry = entries.find((e) => e.week === selectedWeek),
    previous = entries.find((e) => e.week === shiftDate(selectedWeek, -7));
  const stats = checkupStats(entries, today);
  const filteredEntries = entries.filter(
    (e) =>
      (historyFilter === "all" ||
        !!e.completedAt === (historyFilter === "complete")) &&
      `${e.week} ${weekLabel(e.week)} ${e.template.name} ${Object.values(e.answers).map(answerText).join(" ")} ${e.commitments.map((c) => `${c.title} ${c.goalTitle ?? ""} ${c.reflection}`).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const update = (fn: (draft: WeeklyCheckupsData) => void) =>
    ctx.mutate((w) => fn((w.settings.weeklyCheckups ??= emptyCheckups())));
  const editEntry = (id: string, fn: (draft: CheckupEntry) => void) =>
    update((d) => {
      const item = d.entries.find((e) => e.id === id);
      if (item) {
        fn(item);
        item.updatedAt = now();
      }
    });
  const openWeek = (week: string) => {
    setSelectedWeek(week);
    setSessionOpen(false);
    setChangingTemplate(false);
    setMode("week");
  };
  useEffect(() => {
    if (sidebarRequest?.kind === "checkup") {
      const item = data.entries.find((e) => e.id === sidebarRequest.id);
      openWeek(item?.week ?? thisWeek);
    }
    // A new request is an explicit navigation action, not a workspace update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarRequest]);
  const newTemplate = () =>
    setBuilder({
      id: uid(),
      name: "My weekly checkup",
      description: "A weekly meeting with myself.",
      sections: [
        {
          id: uid(),
          title: "Reflect & plan",
          description: "Make time for what matters.",
          fields: [
            {
              id: uid(),
              type: "textarea",
              label: "What matters most this week?",
              help: "",
              required: true,
              options: [],
            },
          ],
        },
      ],
    });
  const left = entries.find((e) => e.id === leftId) ?? entries[1] ?? entries[0];
  const right = entries.find((e) => e.id === rightId) ?? entries[0];
  if (ctx.collaboration)
    return (
      <div className="workspace-view">
        <h1>Weekly checkups</h1>
        <p>Open your personal workspace to plan and reflect.</p>
      </div>
    );
  if (sessionOpen && entry)
    return (
      <CheckupSession
        key={entry.id}
        entry={entry}
        previous={previous}
        goals={data.goals}
        today={today}
        editEntry={editEntry}
        onExit={() => setSessionOpen(false)}
      />
    );
  return (
    <div className="workspace-view checkups-view">
      <section className="checkup-overview" aria-label="Weekly consistency">
        <div>
          <strong>{stats.streak}</strong>
          <span>week{stats.streak === 1 ? "" : "s"} in a row</span>
        </div>
        <div>
          <strong>{stats.total}</strong>
          <span>completed checkups</span>
        </div>
        <div>
          <strong>
            {stats.commitments ? `${stats.done}/${stats.commitments}` : "—"}
          </strong>
          <span>past commitments accomplished</span>
        </div>
        <div className="checkup-activity">
          <span>Last 12 weeks</span>
          <div>
            {stats.weeks.map((week) => (
              <button
                key={week}
                className={
                  stats.completed.has(week)
                    ? "complete"
                    : entries.some((e) => e.week === week)
                      ? "draft"
                      : ""
                }
                aria-label={`${weekLabel(week)}: ${stats.completed.has(week) ? "complete" : entries.some((e) => e.week === week) ? "draft" : "no checkup"}`}
                title={weekLabel(week)}
                onClick={() => openWeek(week)}
              >
                {stats.completed.has(week) && <Check size={12} />}
              </button>
            ))}
          </div>
          <small>
            {stats.partial} partly accomplished · {stats.pending} awaiting
            reflection
          </small>
        </div>
      </section>
      <nav className="checkup-tabs" aria-label="Checkup sections">
        {(
          [
            ["week", "My week", CalendarCheck],
            ["history", "History", History],
            ["compare", "Compare weeks", TrendingUp],
            ["goals", "Long-term goals", Target],
            ["templates", "Templates", LayoutTemplate],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            aria-current={mode === value ? "page" : undefined}
            onClick={() => {
              setMode(value);
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {mode === "week" && (
        <>
          <div className="checkup-week-heading">
            <div>
              <span className="eyebrow">
                {selectedWeek === thisWeek
                  ? "THIS WEEK"
                  : selectedWeek > thisWeek
                    ? "LOOKING AHEAD"
                    : "PAST CHECKUP"}
              </span>
              <h2>{weekLabel(selectedWeek)}</h2>
            </div>
            <div className="checkup-actions">
              <IconButton
                label="Previous week"
                onClick={() => openWeek(shiftDate(selectedWeek, -7))}
              >
                <ArrowLeft size={17} />
              </IconButton>
              <label>
                <span className="sr-only">Week containing</span>
                <input
                  aria-label="Week containing"
                  type="date"
                  value={selectedWeek}
                  onChange={(e) => {
                    if (e.target.value && e.target.validity.valid)
                      openWeek(weekStart(e.target.value));
                  }}
                />
              </label>
              <IconButton
                label="Next week"
                onClick={() => openWeek(shiftDate(selectedWeek, 7))}
              >
                <ArrowRight size={17} />
              </IconButton>
              {selectedWeek !== thisWeek && (
                <button onClick={() => openWeek(thisWeek)}>This week</button>
              )}
            </div>
          </div>
          {!entry || changingTemplate ? (
            <section className="checkup-start">
              <span className="checkup-emblem">
                <CalendarCheck size={30} strokeWidth={1.4} />
              </span>
              <h2>Start with a little intention.</h2>
              <p>
                Choose your template, take a breath, and begin. One segment at a
                time — tasks, meals, money, and a little space for you.
              </p>
              <div className="checkup-template-grid">
                {templates.map((t) => (
                  <button
                    className="checkup-template-choice"
                    key={t.id}
                    aria-pressed={templateId === t.id}
                    onClick={() => setTemplateId(t.id)}
                  >
                    <LayoutTemplate size={20} />
                    <strong>{t.name}</strong>
                    <span>{t.description}</span>
                    <small>
                      {t.sections.length + 2} guided segments
                      {templateId === t.id ? " · Selected" : ""}
                    </small>
                  </button>
                ))}
              </div>
              {changingTemplate && (
                <p className="checkup-callout">
                  Changing templates keeps commitments and responses to matching
                  prompts. Responses to removed prompts will be discarded when
                  you press Begin.{" "}
                  <button onClick={() => setChangingTemplate(false)}>
                    Cancel
                  </button>
                </p>
              )}
              <button
                className="primary"
                onClick={() => {
                  const template =
                    templates.find((t) => t.id === templateId) ?? templates[0];
                  if (entry) {
                    editEntry(entry.id, (e) =>
                      changeCheckupTemplate(e, template),
                    );
                  } else
                    update((d) => {
                      createCheckup(d, selectedWeek, template);
                    });
                  setChangingTemplate(false);
                  setSessionOpen(true);
                }}
              >
                <Plus size={16} />
                Begin
              </button>
            </section>
          ) : (
            <section className="meeting-resume">
              <span className="checkup-emblem">
                <CalendarCheck size={30} />
              </span>
              <span className="eyebrow">
                {entry.completedAt
                  ? "YOUR WEEK, PLANNED"
                  : "A LITTLE SPACE IS WAITING"}
              </span>
              <h2>
                {entry.completedAt
                  ? "Your plan is ready to return to."
                  : "Pick up where you left off."}
              </h2>
              <p>
                {entry.template.name} · {checkupProgress(entry).answered}/
                {checkupProgress(entry).total} prompts explored
              </p>
              <div className="checkup-actions">
                <button
                  className="primary"
                  onClick={() => setSessionOpen(true)}
                >
                  {entry.completedAt ? "View checkup" : "Resume checkup"}
                  <ArrowRight size={16} />
                </button>
                {entry.completedAt ? (
                  <button
                    className="secondary"
                    onClick={() => {
                      editEntry(entry.id, (e) => {
                        delete e.completedAt;
                        e.sessionStep = 0;
                      });
                      setSessionOpen(true);
                    }}
                  >
                    Reopen checkup
                  </button>
                ) : (
                  <button
                    className="secondary"
                    onClick={() => {
                      setTemplateId(entry.template.id);
                      setChangingTemplate(true);
                    }}
                  >
                    Change template
                  </button>
                )}
              </div>
              <div className="meeting-preview-route">
                {entry.template.sections.map((s, i) => (
                  <span key={s.id}>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                    {s.title}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {mode === "history" && (
        <section>
          <div className="checkup-section-heading">
            <div>
              <h2>Your weeks, collected</h2>
              <p>Return to a reflection or pick up an unfinished checkup.</p>
            </div>
            <button onClick={() => openWeek(thisWeek)}>
              <Plus size={16} />
              This week's checkup
            </button>
          </div>
          <div className="checkup-actions checkup-history-filters">
            <input
              aria-label="Search checkup history"
              placeholder="Search reflections, goals, or dates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter checkup history"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            >
              <option value="all">All checkups</option>
              <option value="complete">Completed</option>
              <option value="draft">Drafts</option>
            </select>
          </div>
          <div className="checkup-history-list">
            {filteredEntries.map((e) => (
              <article className="checkup-history-item" key={e.id}>
                <button
                  className="checkup-history-open"
                  onClick={() => openWeek(e.week)}
                >
                  <span className="checkup-history-date">
                    <CalendarCheck size={21} />
                  </span>
                  <div>
                    <h3>{weekLabel(e.week)}</h3>
                    <p>{String(e.answers.intention || e.template.name)}</p>
                    <small>
                      {e.completedAt ? "Completed" : "Draft"} ·{" "}
                      {checkupProgress(e).answered}/{checkupProgress(e).total}{" "}
                      prompts ·{" "}
                      {e.commitments.filter((c) => c.outcome === "done").length}
                      /{e.commitments.length} commitments accomplished
                    </small>
                  </div>
                </button>
                <div className="checkup-actions">
                  <button
                    onClick={() => {
                      setRightId(e.id);
                      setLeftId(
                        entries.find((v) => v.week < e.week)?.id ??
                          entries.find((v) => v.id !== e.id)?.id ??
                          e.id,
                      );
                      setMode("compare");
                    }}
                  >
                    Compare
                  </button>
                  <IconButton
                    label={`Delete checkup ${e.week}`}
                    onClick={() => setRemove({ kind: "entry", id: e.id })}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </article>
            ))}
          </div>
          {!entries.length && (
            <div className="checkup-empty">
              <History size={30} />
              <h3>Your history starts here</h3>
              <p>
                Start a checkup in My week. Drafts and completed weeks will
                appear here.
              </p>
            </div>
          )}
          {entries.length > 0 && !filteredEntries.length && (
            <p>No checkups match your search.</p>
          )}
        </section>
      )}

      {mode === "compare" && (
        <section>
          <div className="checkup-section-heading">
            <div>
              <h2>Notice what is changing</h2>
              <p>
                Compare any two weeks. Number changes show the second week minus
                the first.
              </p>
            </div>
          </div>
          {entries.length < 2 ? (
            <div className="checkup-empty">
              <TrendingUp size={30} />
              <h3>A little history goes a long way</h3>
              <p>
                Create checkups for two different weeks to compare them here.
              </p>
            </div>
          ) : (
            <>
              <div className="checkup-two-columns checkup-compare-selectors">
                {(
                  [
                    ["First week", left!, setLeftId],
                    ["Second week", right!, setRightId],
                  ] as const
                ).map(([label, selected, setter]) => (
                  <label className="checkup-field" key={label}>
                    {label}
                    <select
                      value={selected.id}
                      onChange={(e) => setter(e.target.value)}
                    >
                      {entries.map((e) => (
                        <option key={e.id} value={e.id}>
                          {weekLabel(e.week)}
                          {e.completedAt ? "" : " (draft)"}
                        </option>
                      ))}
                    </select>
                    <small>
                      {selected.template.name} · {selected.currency}
                    </small>
                  </label>
                ))}
              </div>
              {left?.id === right?.id ? (
                <p className="checkup-callout">
                  Choose two different weeks to see changes.
                </p>
              ) : (
                left &&
                right && (
                  <>
                    <div className="checkup-comparison">
                      <div className="checkup-comparison-row checkup-comparison-header">
                        <strong>Prompt</strong>
                        <strong>{weekLabel(left.week)}</strong>
                        <strong>{weekLabel(right.week)}</strong>
                      </div>
                      <div className="checkup-comparison-row">
                        <strong>Commitments</strong>
                        {[left, right].map((e) => (
                          <div key={e.id}>
                            <p>
                              {
                                e.commitments.filter(
                                  (c) => c.outcome === "done",
                                ).length
                              }
                              /{e.commitments.length} accomplished
                            </p>
                            {e.commitments.map((c) => (
                              <p key={c.id}>
                                {c.title} — {outcomes[c.outcome]}
                                {c.reflection && ` · ${c.reflection}`}
                              </p>
                            ))}
                          </div>
                        ))}
                      </div>
                      {comparisonRows(left, right).map((row) => (
                        <div
                          className={`checkup-comparison-row${row.changed ? " changed" : ""}`}
                          key={row.id}
                        >
                          <div>
                            <strong>{row.label}</strong>
                            {row.delta !== undefined && (
                              <small className="checkup-delta">
                                {row.delta > 0 ? "+" : ""}
                                {row.delta} change
                              </small>
                            )}
                            {row.changed && <small>Changed</small>}
                          </div>
                          <p>{row.left}</p>
                          <p>{row.right}</p>
                        </div>
                      ))}
                    </div>
                    {left.currency !== right.currency && (
                      <p className="checkup-muted">
                        These weeks use different currencies. Money amounts are
                        shown as recorded without conversion or change
                        calculations.
                      </p>
                    )}
                  </>
                )
              )}
            </>
          )}
        </section>
      )}

      {mode === "goals" && (
        <section>
          <div className="checkup-section-heading">
            <div>
              <h2>Keep the bigger picture close</h2>
              <p>
                Set a direction, then link small commitments to it in each
                weekly checkup.
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setGoalEditor({
                  id: uid(),
                  title: "",
                  area: "Personal",
                  why: "",
                  archived: false,
                  createdAt: now(),
                })
              }
            >
              <Plus size={16} />
              New goal
            </button>
          </div>
          {!data.goals.length && (
            <div className="checkup-empty">
              <Target size={30} />
              <h3>What are you working toward?</h3>
              <p>
                An emergency fund, finishing a course, better sleep, or more
                time with family. Give it a name and a reason.
              </p>
            </div>
          )}
          <div className="checkup-goal-grid">
            {data.goals.map((g) => {
              const commitments = entries
                  .filter((e) => e.completedAt && e.week <= thisWeek)
                  .flatMap((e) => e.commitments)
                  .filter((c) => c.goalId === g.id),
                done = commitments.filter((c) => c.outcome === "done").length;
              return (
                <article
                  className={`checkup-card${g.archived ? " checkup-archived" : ""}`}
                  key={g.id}
                >
                  <span className="eyebrow">
                    {g.area}
                    {g.archived ? " · Archived" : ""}
                  </span>
                  <h3>{g.title}</h3>
                  <p>{g.why || "Add why this goal matters to you."}</p>
                  {g.targetDate && <small>Target: {g.targetDate}</small>}
                  <div className="checkup-goal-progress">
                    <progress
                      max={Math.max(1, commitments.length)}
                      value={done}
                      aria-label={`Weekly actions accomplished for ${g.title}`}
                    />
                    <small>
                      {done}/{commitments.length} linked actions accomplished ·{" "}
                      {
                        commitments.filter((c) => c.outcome === "partial")
                          .length
                      }{" "}
                      partial
                    </small>
                  </div>
                  <div className="checkup-actions">
                    <button onClick={() => setGoalEditor(g)}>Edit goal</button>
                    <button
                      onClick={() =>
                        update((d) => {
                          const goal = d.goals.find((v) => v.id === g.id);
                          if (goal) goal.archived = !goal.archived;
                        })
                      }
                    >
                      {g.archived ? "Restore goal" : "Archive goal"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="checkup-muted">
            Progress counts linked actions from completed checkups through this
            week. It measures follow-through, not how close you are to finishing
            the whole goal. Archived goals keep their history.
          </p>
        </section>
      )}

      {mode === "templates" && (
        <section>
          <div className="checkup-section-heading">
            <div>
              <h2>A format that fits your life</h2>
              <p>
                Use a starter, make it your own, or build a guided form from
                scratch.
              </p>
            </div>
            <button className="primary" onClick={newTemplate}>
              <Plus size={16} />
              New template
            </button>
          </div>
          <div className="checkup-template-grid">
            {templates.map((t) => {
              const custom = data.templates.some((v) => v.id === t.id);
              return (
                <article className="checkup-card" key={t.id}>
                  <span className="eyebrow">
                    {custom ? "YOUR TEMPLATE" : "STUDYSPACE STARTER"}
                  </span>
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                  <small>
                    {t.sections.length} sections ·{" "}
                    {t.sections.reduce((n, s) => n + s.fields.length, 0)}{" "}
                    prompts
                  </small>
                  <div className="checkup-actions">
                    {custom && (
                      <button onClick={() => setBuilder(t)}>Edit</button>
                    )}
                    <button
                      onClick={() =>
                        setBuilder({
                          ...t,
                          id: uid(),
                          name: `${t.name} — my version`.slice(0, 240),
                        })
                      }
                    >
                      <Copy size={14} />
                      Customize a copy
                    </button>
                    {custom && (
                      <IconButton
                        label={`Delete template ${t.name}`}
                        onClick={() =>
                          setRemove({ kind: "template", id: t.id })
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="checkup-callout">
            <LayoutTemplate size={20} />
            <span>
              Mix short answers, reflections, numbers, ratings, checklists, and
              a seven-day planner. Reorder sections and prompts, add hints, and
              choose what is required. Template changes apply to new checkups.
            </span>
          </div>
        </section>
      )}

      {builder && (
        <TemplateBuilder
          initial={builder}
          week={selectedWeek}
          onClose={() => setBuilder(null)}
          onSave={(template) => {
            if (
              data.templates.length >= 100 &&
              !data.templates.some((t) => t.id === template.id)
            ) {
              ctx.toast(
                "You can keep up to 100 templates. Delete an unused template before adding another.",
              );
              return;
            }
            update((d) => {
              const index = d.templates.findIndex((t) => t.id === template.id);
              if (index >= 0) d.templates[index] = template;
              else d.templates.push(template);
            });
            setTemplateId(template.id);
            setBuilder(null);
            ctx.toast("Template saved. Choose it when starting a new checkup.");
          }}
        />
      )}
      {goalEditor && (
        <GoalEditor
          initial={goalEditor}
          onClose={() => setGoalEditor(null)}
          onSave={(goal) => {
            if (
              data.goals.length >= 500 &&
              !data.goals.some((g) => g.id === goal.id)
            ) {
              ctx.toast(
                "Your workspace has reached its limit of 500 long-term goals.",
              );
              return;
            }
            update((d) => {
              const index = d.goals.findIndex((g) => g.id === goal.id);
              if (index >= 0) d.goals[index] = goal;
              else d.goals.push(goal);
            });
            setGoalEditor(null);
          }}
        />
      )}
      {remove && (
        <Modal
          title={
            remove.kind === "entry"
              ? "Delete this weekly checkup?"
              : "Delete this template?"
          }
          description={
            remove.kind === "entry"
              ? "This removes the responses, commitments, and reflections for this week and recalculates consistency. This cannot be undone."
              : "Saved checkups keep their original form and responses. This template will no longer be available for new checkups."
          }
          onClose={() => setRemove(null)}
        >
          <div className="checkup-actions">
            <button onClick={() => setRemove(null)}>Cancel</button>
            <button
              className="danger"
              onClick={() => {
                update((d) => {
                  if (remove.kind === "entry")
                    d.entries = d.entries.filter((e) => e.id !== remove.id);
                  else
                    d.templates = d.templates.filter((t) => t.id !== remove.id);
                });
                setRemove(null);
              }}
            >
              Delete {remove.kind === "entry" ? "checkup" : "template"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GoalEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: LifeGoal;
  onSave: (goal: LifeGoal) => void;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState(initial),
    [error, setError] = useState("");
  return (
    <Modal
      title={initial.title ? "Edit long-term goal" : "New long-term goal"}
      description="Choose a direction you can return to each week."
      onClose={onClose}
    >
      <form
        className="checkup-goal-form"
        onSubmit={(e) => {
          e.preventDefault();
          const result = lifeGoalSchema.safeParse(goal);
          if (!result.success) {
            setError(
              "Give your goal a name and choose a valid target date, or leave the date blank.",
            );
            return;
          }
          onSave(result.data);
        }}
      >
        <label className="checkup-field">
          Goal name
          <input
            required
            maxLength={240}
            value={goal.title}
            placeholder="Build a $1,000 emergency fund"
            onChange={(e) => setGoal((g) => ({ ...g, title: e.target.value }))}
          />
        </label>
        <label className="checkup-field">
          Life area
          <select
            value={goal.area}
            onChange={(e) =>
              setGoal((g) => ({
                ...g,
                area: e.target.value as LifeGoal["area"],
              }))
            }
          >
            {lifeAreas.map((area) => (
              <option key={area}>{area}</option>
            ))}
          </select>
        </label>
        <label className="checkup-field">
          Why this matters & what success looks like
          <textarea
            rows={4}
            maxLength={4000}
            value={goal.why}
            onChange={(e) => setGoal((g) => ({ ...g, why: e.target.value }))}
          />
        </label>
        <label className="checkup-field">
          Target date (optional)
          <input
            type="date"
            value={goal.targetDate ?? ""}
            onChange={(e) =>
              setGoal((g) => ({
                ...g,
                targetDate: e.target.value || undefined,
              }))
            }
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="checkup-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save goal
          </button>
        </div>
      </form>
    </Modal>
  );
}
