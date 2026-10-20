import { describe, it, expect } from "vitest";
import { plannerWeek, plannerGroups, newPlannerTask } from "../src/lib/planner";
describe("planner organization", () => {
  it("shows a complete local week spanning months and years", () => {
    expect(plannerWeek("2027-01-01")).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(plannerWeek("2026-03-08")).toHaveLength(7);
  });
  it("separates overdue and completed tasks without hiding undated or due-today tasks", () => {
    const tasks = [
      { ...newPlannerTask(), title: "No date" },
      { ...newPlannerTask(), title: "Today", due_date: "2026-09-14" },
      { ...newPlannerTask(), title: "Late", due_date: "2026-09-13" },
      {
        ...newPlannerTask(),
        title: "Done",
        due_date: "2026-09-01",
        completed: true,
      },
    ];
    const groups = plannerGroups(tasks, "2026-09-14");
    expect(groups.todo.map((t) => t.title)).toEqual(["Today", "No date"]);
    expect(groups.overdue.map((t) => t.title)).toEqual(["Late"]);
    expect(groups.completed.map((t) => t.title)).toEqual(["Done"]);
    expect(tasks.map((t) => t.title)).toEqual([
      "No date",
      "Today",
      "Late",
      "Done",
    ]);
  });
});
