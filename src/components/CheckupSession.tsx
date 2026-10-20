"use client";
import "./checkup-session.css";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Flag,
  Target,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { CheckupInput } from "./CheckupForms";
import {
  dayNames,
  MealPlanner,
  planDays,
  planTasks,
  TaskPlanner,
  WeekCalendar,
} from "./CheckupPlanning";
import { IconButton } from "./ui";
import { now, uid } from "@/lib/model";
import {
  checkupProgress,
  completionErrors,
  hasAnswer,
  shiftDate,
  weekLabel,
  type CheckupAnswer,
  type CheckupCommitment,
  type CheckupEntry,
  type CheckupTemplate,
  type LifeGoal,
} from "@/lib/weekly-checkups";

const outcomes: Record<CheckupCommitment["outcome"], string> = {
  pending: "Not reviewed",
  done: "Accomplished",
  partial: "Partly accomplished",
  missed: "Not this time",
};
export default function CheckupSession({
  entry,
  previous,
  goals,
  today,
  editEntry,
  onExit,
}: {
  entry: CheckupEntry;
  previous?: CheckupEntry;
  goals: LifeGoal[];
  today: string;
  editEntry: (id: string, change: (entry: CheckupEntry) => void) => void;
  onExit: () => void;
}) {
  const sections = entry.template.sections;
  const [step, setStep] = useState(() =>
    Math.min(entry.sessionStep ?? 0, sections.length + 1),
  );
  const [error, setError] = useState(""),
    [finished, setFinished] = useState(false);
  const [title, setTitle] = useState(""),
    [goalId, setGoalId] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const session = useRef<HTMLDivElement>(null);
  const readOnly = !!entry.completedAt,
    total = sections.length + 2;
  const segment = sections[step];
  const titles = [
    ...sections.map((s) => s.title),
    "Reflect on last week",
    "Commit to the week",
  ];
  const edit = (fn: (e: CheckupEntry) => void) => editEntry(entry.id, fn);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    session.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [step, finished]);
  const go = (index: number, validate = false) => {
    if (validate && segment && !readOnly) {
      const missing = segment.fields.filter(
        (f) => f.required && !hasAnswer(entry.answers[f.id]),
      );
      if (missing.length) {
        setError(
          `A little more before moving on: ${missing.map((f) => f.label).join(" · ")}`,
        );
        return;
      }
    }
    setError("");
    setStep(index);
    if (!readOnly)
      edit((e) => {
        e.sessionStep = index;
      });
  };
  const complete = () => {
    const missing = completionErrors(entry);
    if (missing.length) {
      setError(`Before completing: ${missing.join(" · ")}`);
      return;
    }
    edit((e) => {
      e.completedAt = now();
    });
    setFinished(true);
  };
  const review = (item: CheckupEntry, editable: boolean) => (
    <div className="meeting-outcomes">
      {item.commitments.map((c) => (
        <article key={c.id} className="meeting-outcome">
          <strong>{c.title}</strong>
          {c.goalTitle && (
            <small>
              <Target size={13} />
              {c.goalTitle}
            </small>
          )}
          <div
            className="meeting-outcome-options"
            role="group"
            aria-label={`Outcome for ${c.title}`}
          >
            {Object.entries(outcomes).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={c.outcome === value}
                disabled={!editable}
                onClick={() =>
                  editEntry(item.id, (e) => {
                    const commitment = e.commitments.find((v) => v.id === c.id);
                    if (commitment)
                      commitment.outcome =
                        value as CheckupCommitment["outcome"];
                  })
                }
              >
                {c.outcome === value && <Check size={14} />}
                {label}
              </button>
            ))}
          </div>
          <label className="checkup-field">
            <span>Reflection on {c.title}</span>
            <textarea
              rows={2}
              disabled={!editable}
              maxLength={4000}
              value={c.reflection}
              placeholder="What helped? What would make next week easier?"
              onChange={(event) =>
                editEntry(item.id, (e) => {
                  const commitment = e.commitments.find((v) => v.id === c.id);
                  if (commitment) commitment.reflection = event.target.value;
                })
              }
            />
          </label>
        </article>
      ))}
    </div>
  );
  return (
    <div
      className="checkup-session"
      ref={session}
      aria-label="Guided weekly checkup"
    >
      <header className="meeting-topbar">
        <button type="button" onClick={onExit}>
          <ArrowLeft size={16} />
          {finished ? "Back to checkups" : "Save & exit"}
        </button>
        <span>
          {entry.template.name}
          <small>{weekLabel(entry.week)}</small>
        </span>
        <IconButton label="Close guided checkup" onClick={onExit}>
          <X size={18} />
        </IconButton>
      </header>
      {finished ? (
        <section className="meeting-finished">
          <span className="meeting-finished-icon">
            <CheckCheck size={38} />
          </span>
          <span className="eyebrow">A LITTLE CLEARER. A LITTLE LIGHTER.</span>
          <h1 ref={heading} tabIndex={-1}>
            Your week has a direction.
          </h1>
          <p>
            You made space for what matters. Your plans are here whenever you
            need them.
          </p>
          <div className="meeting-finished-stats">
            <span>
              <strong>{checkupProgress(entry).answered}</strong>prompts explored
            </span>
            <span>
              <strong>{entry.commitments.length}</strong>commitments to return
              to
            </span>
          </div>
          <button className="primary" onClick={onExit}>
            Back to my week
            <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <>
          <div className="meeting-progress">
            <div className="meeting-progress-label">
              <span>
                {readOnly ? "Your saved checkup" : "YOUR WEEKLY RESET"}
              </span>
              <label>
                <span className="sr-only">Go to segment</span>
                <select
                  aria-label="Go to segment"
                  value={step}
                  onChange={(e) => go(Number(e.target.value))}
                >
                  {titles.map((label, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {label}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {String(step + 1).padStart(2, "0")} /{" "}
                {String(total).padStart(2, "0")}
              </span>
            </div>
            <div
              className="meeting-progress-track"
              role="progressbar"
              aria-label="Checkup journey"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={step + 1}
            >
              {titles.map((title, i) => (
                <span
                  key={i}
                  className={i <= step ? "reached" : ""}
                  title={title}
                />
              ))}
            </div>
          </div>
          <section className="meeting-screen" key={step}>
            <header className="meeting-screen-heading">
              <span className="eyebrow">
                {segment?.layout === "tasks"
                  ? "MAKE ROOM FOR WHAT MATTERS"
                  : segment?.layout === "meals"
                    ? "ONE LESS THING TO THINK ABOUT"
                    : segment?.layout === "finances"
                      ? "A CLEARER PICTURE"
                      : step === sections.length
                        ? "PROGRESS, NOT PERFECTION"
                        : "A MOMENT FOR YOU"}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {segment?.title ??
                  (step === sections.length
                    ? "Look back. Learn a little."
                    : "Small steps. Real progress.")}
              </h1>
              <p>
                {segment?.description ??
                  (step === sections.length
                    ? `Reflect on your commitments from ${weekLabel(shiftDate(entry.week, -7))}.`
                    : "Choose a few things you can actually do. Your future self will thank you.")}
              </p>
            </header>
            {segment ? (
              <PlanningSegment
                section={segment}
                entry={entry}
                onAnswer={(id, value) =>
                  edit((e) => {
                    e.answers[id] = value;
                  })
                }
                onCurrency={(currency) =>
                  edit((e) => {
                    e.currency = currency;
                  })
                }
              />
            ) : step === sections.length ? (
              <div className="meeting-reflection">
                {previous?.commitments.length ? (
                  <>
                    <p className="meeting-muted">
                      Your reflections stay with last week's record.
                      {!previous.completedAt &&
                        " That checkup is still a draft; complete it for it to count toward consistency."}
                    </p>
                    {review(previous, !readOnly)}
                    {!readOnly &&
                      previous.commitments.some(
                        (c) => c.outcome !== "done",
                      ) && (
                        <button
                          className="secondary"
                          onClick={() =>
                            edit((e) => {
                              for (const c of previous.commitments.filter(
                                (c) => c.outcome !== "done",
                              ))
                                if (
                                  e.commitments.length < 40 &&
                                  !e.commitments.some(
                                    (v) =>
                                      v.title === c.title &&
                                      v.goalId === c.goalId,
                                  )
                                )
                                  e.commitments.push({
                                    ...c,
                                    id: uid(),
                                    outcome: "pending",
                                    reflection: "",
                                  });
                            })
                          }
                        >
                          Carry unfinished commitments forward
                        </button>
                      )}
                  </>
                ) : (
                  <div className="meeting-quiet-state">
                    <Flag size={30} />
                    <h2>A fresh place to begin</h2>
                    <p>
                      {previous
                        ? "No commitments were set last week."
                        : "There isn't a checkup for last week yet."}{" "}
                      The plans you make today will give you something to
                      reflect on next time.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="meeting-commitments">
                {!readOnly && (
                  <form
                    className="meeting-commitment-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!title.trim() || entry.commitments.length >= 40)
                        return;
                      edit((e) => {
                        const goal = goals.find((g) => g.id === goalId);
                        e.commitments.push({
                          id: uid(),
                          title: title.trim(),
                          ...(goal
                            ? { goalId: goal.id, goalTitle: goal.title }
                            : {}),
                          outcome: "pending",
                          reflection: "",
                        });
                      });
                      setTitle("");
                    }}
                  >
                    <label className="checkup-field">
                      <span>One concrete action</span>
                      <input
                        required
                        maxLength={240}
                        value={title}
                        placeholder="e.g. Put $50 into my emergency fund on Friday"
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </label>
                    <div className="meeting-commitment-controls">
                      <label>
                        <span className="sr-only">
                          Connect to a long-term goal
                        </span>
                        <select
                          aria-label="Connect to a long-term goal"
                          value={goalId}
                          onChange={(e) => setGoalId(e.target.value)}
                        >
                          <option value="">Standalone commitment</option>
                          {goals
                            .filter((g) => !g.archived)
                            .map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        className="secondary"
                        disabled={
                          !title.trim() || entry.commitments.length >= 40
                        }
                      >
                        Add commitment
                      </button>
                    </div>
                  </form>
                )}
                {entry.commitments.map((c) => (
                  <div className="checkup-planned-commitment" key={c.id}>
                    <Target size={18} />
                    <div>
                      <strong>{c.title}</strong>
                      <small>
                        {c.goalTitle ?? "For this week"} · {outcomes[c.outcome]}
                      </small>
                    </div>
                    {!readOnly && (
                      <IconButton
                        label={`Remove commitment ${c.title}`}
                        onClick={() =>
                          edit((e) => {
                            e.commitments = e.commitments.filter(
                              (v) => v.id !== c.id,
                            );
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    )}
                  </div>
                ))}
                {!entry.commitments.length && (
                  <p className="meeting-muted">
                    One small commitment is a good start. You can also finish
                    with just your plans.
                  </p>
                )}
                {readOnly &&
                  entry.week <= today &&
                  !!entry.commitments.length && (
                    <details className="checkup-review-now">
                      <summary>Reflect on this week's outcomes</summary>
                      {review(entry, true)}
                    </details>
                  )}
                {readOnly && (
                  <button
                    className="secondary"
                    onClick={() =>
                      edit((e) => {
                        delete e.completedAt;
                      })
                    }
                  >
                    Reopen checkup
                  </button>
                )}
              </div>
            )}
            {error && (
              <p className="checkup-error" role="alert">
                {error}
              </p>
            )}
          </section>
          <footer className="meeting-footer">
            <button
              className="meeting-back"
              disabled={step === 0}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <span>
              {step < total - 1
                ? `Up next: ${titles[step + 1]}`
                : "Ready when you are."}
            </span>
            {step < total - 1 ? (
              <button className="primary" onClick={() => go(step + 1, true)}>
                Next
                <ArrowRight size={17} />
              </button>
            ) : readOnly ? (
              <button className="primary" onClick={onExit}>
                Back to my week
              </button>
            ) : (
              <button className="primary" onClick={complete}>
                Finish checkup
                <Check size={17} />
              </button>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

function PlanningSegment({
  section,
  entry,
  onAnswer,
  onCurrency,
}: {
  section: CheckupTemplate["sections"][number];
  entry: CheckupEntry;
  onAnswer: (id: string, value: CheckupAnswer) => void;
  onCurrency: (currency: string) => void;
}) {
  const [day, setDay] = useState(0);
  const disabled = !!entry.completedAt;
  const tasks = section.fields.find((f) => f.type === "tasks"),
    agenda = section.fields.find((f) => f.type === "week");
  const input = (field: (typeof section.fields)[number]) => (
    <CheckupInput
      key={field.id}
      field={field}
      value={entry.answers[field.id]}
      week={entry.week}
      disabled={disabled}
      onChange={(v) => onAnswer(field.id, v)}
    />
  );
  if (section.layout === "tasks") {
    const days = planDays(agenda ? entry.answers[agenda.id] : undefined),
      index = Math.max(0, day);
    return (
      <>
        <WeekCalendar
          week={entry.week}
          day={day}
          onDayChange={setDay}
          tasks={tasks ? planTasks(entry.answers[tasks.id]) : []}
        />
        <div className="meeting-planning-columns">
          <div>
            {tasks && (
              <TaskPlanner
                value={entry.answers[tasks.id]}
                week={entry.week}
                disabled={disabled}
                onChange={(v) => onAnswer(tasks.id, v)}
                selectedDay={day}
                onSelectDay={setDay}
                showCalendar={false}
                label={tasks.label}
              />
            )}
            {agenda && (
              <div className="meeting-day-details">
                <h2>{dayNames[index]} · Focus & events</h2>
                {(["focus", "event"] as const).map((key) => (
                  <label className="checkup-field" key={key}>
                    <span>
                      {key === "focus" ? "Daily focus" : "Events & time"}
                    </span>
                    <input
                      disabled={disabled}
                      aria-label={`${dayNames[index]} ${key === "focus" ? "Daily focus" : "Events & time"}`}
                      placeholder={
                        key === "event"
                          ? "Add an event, time, or place…"
                          : "One thing that matters today…"
                      }
                      maxLength={4000}
                      value={days[index][key]}
                      onChange={(e) =>
                        onAnswer(
                          agenda.id,
                          days.map((d, i) =>
                            i === index ? { ...d, [key]: e.target.value } : d,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
          <aside className="meeting-notepad">
            {section.fields
              .filter((f) => f !== tasks && f !== agenda)
              .map(input)}
            {section.fields.length === (tasks ? 1 : 0) + (agenda ? 1 : 0) && (
              <p className="meeting-muted">
                Keep your list realistic. A few clear priorities leave room for
                the unexpected.
              </p>
            )}
          </aside>
        </div>
      </>
    );
  }
  if (section.layout === "meals")
    return (
      <>
        {section.fields.map((f) =>
          f.type === "week" ? (
            <MealPlanner
              key={f.id}
              value={entry.answers[f.id]}
              onChange={(v) => onAnswer(f.id, v)}
              week={entry.week}
              disabled={disabled}
              label={f.label}
            />
          ) : (
            input(f)
          ),
        )}
      </>
    );
  if (section.layout === "finances") {
    const savings = entry.answers["money-savings"],
      target = entry.answers["money-target"];
    return (
      <>
        <div className="meeting-finance-heading">
          <span>
            <Wallet size={18} />
            Your weekly money snapshot
          </span>
          <label>
            Currency{" "}
            <select
              aria-label="Checkup currency"
              value={entry.currency}
              disabled={disabled}
              onChange={(e) => onCurrency(e.target.value)}
            >
              {[
                ...new Set([
                  entry.currency,
                  "USD",
                  "EUR",
                  "GBP",
                  "CAD",
                  "AUD",
                  "NZD",
                  "JPY",
                  "INR",
                  "CHF",
                  "CNY",
                  "BRL",
                  "MXN",
                  "ZAR",
                  "KRW",
                  "SEK",
                  "NOK",
                  "DKK",
                  "SGD",
                  "PHP",
                ]),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="meeting-money-grid">
          {section.fields
            .filter((f) => f.type === "number")
            .map((f) => (
              <div className="meeting-money-card" key={f.id}>
                {input(f)}
                {f.money && <small>{entry.currency}</small>}
              </div>
            ))}
        </div>
        {typeof savings === "number" &&
          typeof target === "number" &&
          target > 0 && (
            <div className="meeting-savings">
              <div>
                <Target size={17} />
                <span>
                  {Math.round(Math.max(0, savings / target) * 100)}% of your
                  savings goal
                </span>
              </div>
              <progress
                aria-label="Savings goal progress"
                value={Math.max(0, Math.min(savings, target))}
                max={target}
              />
            </div>
          )}
        {section.fields.filter((f) => f.type !== "number").map(input)}
      </>
    );
  }
  return <div className="meeting-prompts">{section.fields.map(input)}</div>;
}
