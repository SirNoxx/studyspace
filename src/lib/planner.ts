import { localDateKey } from "./dates";
export interface PlannerTask {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  due_time: string | null;
  timezone: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
  revision: number;
  owner_id?: string;
  assignee_id?: string;
}
export function newPlannerTask(): PlannerTask {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    due_date: null,
    due_time: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    priority: "medium",
    completed: false,
    revision: 0,
  };
}
export function calendarRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    from: new Date(y, m - 1, 1).toISOString(),
    to: new Date(y, m, 1).toISOString(),
  };
}

export function plannerWeek(anchor: string) {
  const start = new Date(anchor + "T12:00:00");
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return localDateKey(date);
  });
}
export function plannerGroups(tasks: PlannerTask[], today: string) {
  const sorted = [...tasks].sort(
    (a, b) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      (a.due_time ?? "99").localeCompare(b.due_time ?? "99") ||
      a.title.localeCompare(b.title),
  );
  return {
    todo: sorted.filter(
      (t) => !t.completed && (!t.due_date || t.due_date >= today),
    ),
    overdue: sorted.filter(
      (t) => !t.completed && !!t.due_date && t.due_date < today,
    ),
    completed: sorted.filter((t) => t.completed),
  };
}
