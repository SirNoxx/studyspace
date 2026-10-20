import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { emptyWorkspace, general, now, uid } from "../src/lib/model";
import { validateWorkspace } from "../src/lib/domain";
import { applyPatch, makePatch } from "../src/lib/workspace-patch";
import {
  commitImport,
  exportWorkspace,
  prepareImport,
} from "../src/lib/transfer";
import {
  answerText,
  changeCheckupTemplate,
  checkupStats,
  comparisonRows,
  completionErrors,
  createCheckup,
  defaultCheckupTemplates,
  emptyCheckups,
  hasAnswer,
  restoreCheckups,
  shiftDate,
  weeklyCheckupsSchema,
  weekStart,
} from "../src/lib/weekly-checkups";

describe("weekly checkups", () => {
  it("switches draft templates without invalid checklist responses or lost legacy dinners", () => {
    const data = emptyCheckups(),
      template = structuredClone(defaultCheckupTemplates[0]);
    template.sections[0].fields.push({
      id: "chores",
      label: "Chores",
      type: "checklist",
      required: false,
      help: "",
      options: ["Laundry", "Groceries"],
    });
    const entry = createCheckup(data, "2026-10-19", template);
    entry.answers.chores = ["Laundry", "Groceries"];
    entry.answers["week-plan"] = Array.from({ length: 7 }, () => ({
      focus: "",
      event: "",
      dinner: "Soup",
    }));
    entry.sessionStep = 4;
    template.sections[0].fields.find((f) => f.id === "chores")!.options = [
      "Groceries",
    ];
    changeCheckupTemplate(entry, template);
    expect(entry.answers.chores).toEqual(["Groceries"]);
    expect(answerText(entry.answers["meal-plan"])).toContain("Dinner: Soup");
    expect(entry.sessionStep).toBe(0);
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(true);
    entry.completedAt = now();
    expect(() => changeCheckupTemplate(entry, template)).toThrow("Reopen");
  });
  it("starts each built-in journey with tasks, meals and finances and validates its modules", () => {
    for (const template of defaultCheckupTemplates) {
      expect(
        template.sections.slice(0, 3).map((section) => section.layout),
      ).toEqual(["tasks", "meals", "finances"]);
      const data = emptyCheckups();
      createCheckup(data, "2026-10-19", template);
      expect(weeklyCheckupsSchema.safeParse(data).success).toBe(true);
    }
  });
  it("persists tasks, meal details and resume position in a workspace backup", async () => {
    const source = emptyWorkspace();
    const entry = createCheckup(
      (source.settings.weeklyCheckups = emptyCheckups()),
      "2026-10-19",
      defaultCheckupTemplates[0],
    );
    entry.sessionStep = 2;
    entry.answers["tasks-list"] = [
      { id: uid(), title: "Book dentist", day: 2, done: true },
    ];
    entry.answers["meal-plan"] = Array.from({ length: 7 }, () => ({
      focus: "",
      event: "",
      dinner: "Pasta",
      breakfast: "Oatmeal",
      lunch: "Salad",
    }));
    validateWorkspace(source);
    expect(hasAnswer(entry.answers["tasks-list"])).toBe(true);
    expect(answerText(entry.answers["tasks-list"])).toContain(
      "Wed: ✓ Book dentist",
    );
    expect(answerText(entry.answers["meal-plan"])).toContain(
      "Breakfast: Oatmeal",
    );
    const zip = await exportWorkspace(source, { full: true });
    const restored = emptyWorkspace();
    commitImport(
      restored,
      await prepareImport([
        new File([Uint8Array.from(zip).buffer], "backup.zip"),
      ]),
      general(restored).id,
    );
    expect(restored.settings.weeklyCheckups!.entries[0].sessionStep).toBe(2);
    expect(restored.settings.weeklyCheckups!.entries[0].answers).toEqual(
      entry.answers,
    );
  });
  it("accepts saved templates from before segment layouts and rejects invalid task dates", () => {
    const data = emptyCheckups();
    const entry = createCheckup(data, "2026-10-19", {
      id: "legacy",
      name: "Original form",
      description: "",
      sections: [
        {
          id: "week",
          title: "Plan your week",
          description: "",
          fields: [
            {
              id: "week-plan",
              label: "Weekly plan",
              type: "week",
              help: "",
              options: [],
              required: false,
            },
          ],
        },
      ],
    });
    entry.answers["week-plan"] = Array.from({ length: 7 }, () => ({
      focus: "Read",
      event: "",
      dinner: "Soup",
    }));
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(true);
    const next = createCheckup(data, "2026-10-26", defaultCheckupTemplates[0]);
    next.answers["tasks-list"] = [
      { id: uid(), title: "Oops", day: 7, done: false },
    ];
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(false);
  });
  it("uses Monday calendar weeks across DST and year boundaries", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(shiftDate("2026-10-26", 7)).toBe("2026-11-02");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("keeps one checkup per week and freezes the template as a snapshot", () => {
    const data = emptyCheckups();
    const template = structuredClone(defaultCheckupTemplates[0]);
    const entry = createCheckup(data, "2026-10-20", template);
    template.sections[0].fields[0].label = "Changed later";
    expect(entry.template.sections[0].fields[0].label).not.toBe(
      "Changed later",
    );
    expect(
      createCheckup(data, "2026-10-25", defaultCheckupTemplates[1]).id,
    ).toBe(entry.id);
    expect(data.entries).toHaveLength(1);
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(true);
  });

  it("does not treat an untouched rating, whitespace, or empty day grid as an answer", () => {
    const data = emptyCheckups(),
      entry = createCheckup(data, "2026-10-19", defaultCheckupTemplates[0]);
    expect(completionErrors(entry)).toContain("This week's intention");
    expect(hasAnswer(0)).toBe(true);
    expect(hasAnswer("  ")).toBe(false);
    expect(
      hasAnswer(
        Array.from({ length: 7 }, () => ({ focus: "", dinner: "", event: "" })),
      ),
    ).toBe(false);
    entry.answers.intention = "Make room for family";
    expect(completionErrors(entry)).toEqual([]);
  });

  it("counts consecutive completed weeks, grants the current week time, and excludes future and draft commitments", () => {
    const data = emptyCheckups();
    for (const day of [
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]) {
      const e = createCheckup(data, day, defaultCheckupTemplates[0]);
      if (day !== "2026-10-19") e.completedAt = now();
      e.commitments = ["done", "partial", "pending"].map((outcome) => ({
        id: uid(),
        title: "An action",
        outcome: outcome as "done" | "partial" | "pending",
        reflection: "",
      }));
    }
    expect(checkupStats(data.entries, "2026-10-21")).toMatchObject({
      streak: 3,
      total: 3,
      done: 3,
      partial: 3,
      pending: 3,
      commitments: 9,
    });
    expect(checkupStats(data.entries, "2026-11-09").streak).toBe(0);
    data.entries[3].completedAt = now();
    expect(checkupStats(data.entries, "2026-10-21").streak).toBe(4);
    delete data.entries[2].completedAt;
    expect(checkupStats(data.entries, "2026-10-21").streak).toBe(1);
  });

  it("compares stable field identities, zero amounts, different templates and currencies", () => {
    const data = emptyCheckups(),
      a = createCheckup(data, "2026-10-12", defaultCheckupTemplates[0]),
      b = createCheckup(data, "2026-10-19", defaultCheckupTemplates[2]);
    a.answers["money-savings"] = 0;
    b.answers["money-savings"] = 50;
    expect(
      comparisonRows(a, b).find((r) => r.id === "money-savings"),
    ).toMatchObject({ left: "0", right: "50", delta: 50, changed: true });
    expect(comparisonRows(a, b).find((r) => r.id === "fallback")?.left).toBe(
      "Not in this template",
    );
    b.currency = "EUR";
    expect(
      comparisonRows(a, b).find((r) => r.id === "money-savings")?.delta,
    ).toBeUndefined();
    b.answers.energy = 4;
    a.answers.energy = 2;
    expect(comparisonRows(a, b).find((r) => r.id === "energy")?.delta).toBe(2);
  });

  it("survives normal workspace patches without migrating older workspaces", () => {
    const base = emptyWorkspace(),
      next = structuredClone(base);
    validateWorkspace(base);
    next.settings.weeklyCheckups = emptyCheckups();
    createCheckup(
      next.settings.weeklyCheckups,
      "2026-10-19",
      defaultCheckupTemplates[0],
    );
    const restored = applyPatch(base, makePatch(next, base));
    expect(restored.settings.weeklyCheckups).toEqual(
      next.settings.weeklyCheckups,
    );
    validateWorkspace(restored);
    restored.settings.weeklyCheckups!.entries.push(
      structuredClone(restored.settings.weeklyCheckups!.entries[0]),
    );
    expect(() => validateWorkspace(restored)).toThrow(
      "Weekly checkup data is invalid",
    );
  });

  it("treats custom currency amounts explicitly instead of guessing from the prompt name", () => {
    const data = emptyCheckups(),
      template = structuredClone(defaultCheckupTemplates[0]);
    template.sections[0].fields.push({
      id: "custom-amount",
      label: "Holiday fund",
      help: "",
      type: "number",
      money: true,
      required: false,
      options: [],
    });
    const a = createCheckup(data, "2026-10-12", template),
      b = createCheckup(data, "2026-10-19", template);
    a.answers["custom-amount"] = 50;
    b.answers["custom-amount"] = 100;
    expect(
      comparisonRows(a, b).find((r) => r.id === "custom-amount")?.delta,
    ).toBe(50);
    b.currency = "EUR";
    expect(
      comparisonRows(a, b).find((r) => r.id === "custom-amount")?.delta,
    ).toBeUndefined();
  });

  it("includes private checkups in full backups, restores linked goals, and excludes them from collection exports", async () => {
    const source = emptyWorkspace();
    const data = (source.settings.weeklyCheckups = emptyCheckups());
    const template = structuredClone(defaultCheckupTemplates[0]);
    template.id = uid();
    data.templates.push(template);
    data.goals.push({
      id: uid(),
      title: "Emergency fund",
      why: "Stability",
      area: "Finances",
      archived: false,
      createdAt: now(),
    });
    const entry = createCheckup(data, "2026-10-19", template);
    entry.answers.intention = "Private financial reflection";
    entry.commitments.push({
      id: uid(),
      title: "Save 50",
      goalId: data.goals[0].id,
      goalTitle: data.goals[0].title,
      outcome: "done",
      reflection: "Transferred on Friday",
    });
    const zip = await exportWorkspace(source, { full: true });
    const plan = await prepareImport([
      new File([Uint8Array.from(zip).buffer], "backup.zip", {
        type: "application/zip",
      }),
    ]);
    const restored = emptyWorkspace();
    commitImport(restored, plan, general(restored).id);
    const target = restored.settings.weeklyCheckups!;
    expect(target.entries[0].answers).toEqual(entry.answers);
    expect(target.entries[0].commitments[0].goalId).toBe(target.goals[0].id);
    expect(target.entries[0].template.id).toBe(target.templates[0].id);
    validateWorkspace(restored);
    const warnings: string[] = [];
    restoreCheckups(restored, data, warnings);
    expect(target.entries).toHaveLength(1);
    expect(target.goals).toHaveLength(1);
    expect(target.templates).toHaveLength(1);
    expect(warnings[0]).toContain("Kept 1 existing");
    const collection = unzipSync(
      await exportWorkspace(source, { containerId: general(source).id }),
    );
    expect(strFromU8(collection["studyspace-manifest.json"])).not.toContain(
      "weeklyCheckups",
    );
  });
  it("rejects malformed dates and answers without throwing from safeParse", () => {
    const data = emptyCheckups();
    const entry = createCheckup(data, "2026-10-19", defaultCheckupTemplates[0]);
    entry.week = "not-a-date";
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(false);
    entry.week = "2026-10-19";
    entry.answers.energy = 99;
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(false);
    entry.answers.energy = 4;
    entry.answers["week-plan"] = ["not a day"];
    expect(weeklyCheckupsSchema.safeParse(data).success).toBe(false);
  });
});
