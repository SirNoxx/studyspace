"use client";
import { useState } from "react";
import { CalendarDays, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { uid } from "@/lib/model";
import {
  shiftDate,
  type CheckupAnswer,
  type CheckupDay,
  type CheckupTask,
} from "@/lib/weekly-checkups";
import { IconButton } from "./ui";

export const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function planDays(value?: CheckupAnswer): CheckupDay[] {
  return Array.isArray(value) &&
    value.length === 7 &&
    typeof value[0] === "object" &&
    "dinner" in value[0]
    ? (value as CheckupDay[])
    : Array.from({ length: 7 }, () => ({ focus: "", dinner: "", event: "" }));
}
export function planTasks(value?: CheckupAnswer): CheckupTask[] {
  return Array.isArray(value) &&
    value.every((v) => typeof v === "object" && "title" in v)
    ? (value as CheckupTask[])
    : [];
}
export function WeekCalendar({
  week,
  day,
  onDayChange,
  tasks = [],
}: {
  week: string;
  day: number;
  onDayChange: (day: number) => void;
  tasks?: CheckupTask[];
}) {
  return (
    <section className="meeting-calendar" aria-label="Weekly planning calendar">
      <div className="meeting-calendar-heading">
        <CalendarDays size={17} />
        <strong>
          {new Date(week + "T12:00:00Z").toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </strong>
        <span>Your week, at a glance</span>
      </div>
      <div className="meeting-calendar-days">
        {dayNames.map((name, i) => (
          <button
            key={name}
            type="button"
            aria-label={`${name}, ${shiftDate(week, i)}`}
            aria-pressed={day === i}
            onClick={() => onDayChange(i)}
          >
            <span>{name.slice(0, 3)}</span>
            <strong>{Number(shiftDate(week, i).slice(8))}</strong>
            <small>
              {tasks.some((t) => t.day === i)
                ? `${tasks.filter((t) => t.day === i).length} task${tasks.filter((t) => t.day === i).length === 1 ? "" : "s"}`
                : "·"}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
export function TaskPlanner({
  value,
  onChange,
  week,
  disabled = false,
  selectedDay,
  onSelectDay,
  showCalendar = true,
  label = "Tasks for the week",
}: {
  value?: CheckupAnswer;
  onChange: (value: CheckupAnswer) => void;
  week: string;
  disabled?: boolean;
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
  showCalendar?: boolean;
  label?: string;
}) {
  const [localDay, setLocalDay] = useState(0),
    [title, setTitle] = useState("");
  const day = selectedDay ?? localDay,
    setDay = onSelectDay ?? setLocalDay;
  const tasks = planTasks(value),
    visible = tasks.filter((t) => day < 0 || t.day === day);
  return (
    <section className="meeting-task-planner" aria-label={label}>
      {showCalendar && (
        <WeekCalendar
          week={week}
          day={day}
          onDayChange={setDay}
          tasks={tasks}
        />
      )}
      <div className="meeting-list-heading">
        <h2>{day < 0 ? "Your task list" : `${dayNames[day]}'s tasks`}</h2>
        <button
          type="button"
          className="meeting-text-button"
          aria-pressed={day < 0}
          onClick={() => setDay(day < 0 ? 0 : -1)}
        >
          {day < 0 ? "Show Monday" : "View all week"}
        </button>
      </div>
      <div className="meeting-task-list">
        {visible.map((task) => (
          <div className="meeting-task-row" key={task.id}>
            <label>
              <input
                type="checkbox"
                disabled={disabled}
                checked={task.done}
                onChange={(e) =>
                  onChange(
                    tasks.map((t) =>
                      t.id === task.id ? { ...t, done: e.target.checked } : t,
                    ),
                  )
                }
              />
              <span className={task.done ? "is-done" : ""}>{task.title}</span>
            </label>
            <span className="meeting-task-day">
              {dayNames[task.day].slice(0, 3)}
            </span>
            {!disabled && (
              <IconButton
                label={`Remove task ${task.title}`}
                onClick={() => onChange(tasks.filter((t) => t.id !== task.id))}
              >
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
        ))}
        {!visible.length && (
          <p className="meeting-empty-line">
            A little breathing room. Add what you want to make time for
            {day >= 0 ? ` on ${dayNames[day]}` : " this week"}.
          </p>
        )}
      </div>
      {!disabled && (
        <form
          className="meeting-task-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || tasks.length >= 100) return;
            onChange([
              ...tasks,
              {
                id: uid(),
                title: title.trim(),
                day: Math.max(0, day),
                done: false,
              },
            ]);
            setTitle("");
          }}
        >
          <input
            aria-label="New task"
            placeholder="What needs your attention?"
            maxLength={240}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            aria-label="Task day"
            value={Math.max(0, day)}
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {dayNames.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="meeting-add-button"
            disabled={!title.trim() || tasks.length >= 100}
            aria-label="Add task"
          >
            <Plus size={18} />
          </button>
        </form>
      )}
      <small className="meeting-muted">
        {tasks.filter((t) => t.done).length} of {tasks.length} tasks done this
        week
      </small>
    </section>
  );
}
export function MealPlanner({
  value,
  onChange,
  week,
  disabled,
  label,
}: {
  value?: CheckupAnswer;
  onChange: (value: CheckupAnswer) => void;
  week: string;
  disabled?: boolean;
  label: string;
}) {
  const days = planDays(value);
  return (
    <section className="meeting-meals" aria-label={label}>
      {days.map((day, i) => (
        <div className="meeting-meal-day" key={i}>
          <div className="meeting-meal-date">
            <UtensilsCrossed size={16} />
            <strong>{dayNames[i]}</strong>
            <span>{shiftDate(week, i).slice(5)}</span>
          </div>
          {(["breakfast", "lunch", "dinner"] as const).map((meal) => (
            <label key={meal}>
              <span>{meal[0].toUpperCase() + meal.slice(1)}</span>
              <input
                aria-label={`${dayNames[i]} ${meal}`}
                disabled={disabled}
                placeholder={
                  meal === "dinner"
                    ? "Something to look forward to…"
                    : "Keep it simple…"
                }
                value={day[meal] ?? ""}
                maxLength={4000}
                onChange={(e) =>
                  onChange(
                    days.map((d, index) =>
                      index === i ? { ...d, [meal]: e.target.value } : d,
                    ),
                  )
                }
              />
            </label>
          ))}
        </div>
      ))}
    </section>
  );
}
