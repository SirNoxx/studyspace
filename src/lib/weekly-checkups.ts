import { z } from "zod";
import { uid, now, type Workspace } from "./model";

export const lifeAreas = [
  "Personal",
  "Work & learning",
  "Health",
  "Relationships",
  "Home",
  "Finances",
  "Fun & rest",
] as const;
export const fieldTypes = [
  "text",
  "textarea",
  "number",
  "rating",
  "checklist",
  "week",
  "tasks",
] as const;
const id = z.string().min(1).max(160);
const short = z.string().max(240);
const date = z.iso.date();
export const checkupFieldSchema = z.object({
  id,
  label: short.trim().min(1),
  type: z.enum(fieldTypes),
  help: z.string().max(1000),
  required: z.boolean(),
  money: z.boolean().optional(),
  options: z.array(short.trim().min(1)).max(30),
});
export const checkupTemplateSchema = z
  .object({
    id,
    name: short.trim().min(1),
    description: z.string().max(1000),
    sections: z
      .array(
        z.object({
          id,
          title: short.trim().min(1),
          description: z.string().max(1000),
          layout: z
            .enum(["reflection", "tasks", "meals", "finances"])
            .optional(),
          fields: z.array(checkupFieldSchema).min(1).max(30),
        }),
      )
      .min(1)
      .max(16),
  })
  .superRefine((template, ctx) => {
    const ids = template.sections.flatMap((s) => [
      s.id,
      ...s.fields.map((f) => f.id),
    ]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Every section and prompt needs a unique identity.",
      });
    for (const s of template.sections)
      for (const f of s.fields)
        if (
          f.type === "checklist" &&
          (!f.options.length || new Set(f.options).size !== f.options.length)
        )
          ctx.addIssue({
            code: "custom",
            message: "Checklist options must be nonempty and unique.",
          });
  });
export type CheckupField = z.infer<typeof checkupFieldSchema>;
export type CheckupTemplate = z.infer<typeof checkupTemplateSchema>;
const daySchema = z.object({
  focus: z.string().max(4000),
  dinner: z.string().max(4000),
  breakfast: z.string().max(4000).optional(),
  lunch: z.string().max(4000).optional(),
  event: z.string().max(4000),
});
export type CheckupDay = z.infer<typeof daySchema>;
const taskSchema = z.object({
  id,
  title: short.trim().min(1),
  day: z.number().int().min(0).max(6),
  done: z.boolean(),
});
export type CheckupTask = z.infer<typeof taskSchema>;
const answerSchema = z.union([
  z.string().max(20000),
  z.number().finite(),
  z.array(z.string().max(240)).max(30),
  z.array(daySchema).length(7),
  z.array(taskSchema).max(100),
]);
export type CheckupAnswer = z.infer<typeof answerSchema>;
export const commitmentSchema = z.object({
  id,
  title: short.trim().min(1),
  goalId: id.optional(),
  goalTitle: short.optional(),
  outcome: z.enum(["pending", "done", "partial", "missed"]),
  reflection: z.string().max(4000),
});
export type CheckupCommitment = z.infer<typeof commitmentSchema>;
export const checkupEntrySchema = z
  .object({
    id,
    week: date.refine(
      (d) => date.safeParse(d).success && weekStart(d) === d,
      "Choose a Monday.",
    ),
    template: checkupTemplateSchema,
    answers: z.record(z.string(), answerSchema),
    commitments: z.array(commitmentSchema).max(40),
    currency: z.string().regex(/^[A-Z]{3}$/),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    sessionStep: z.number().int().min(0).max(32).optional(),
  })
  .superRefine((entry, ctx) => {
    const fields = new Map(
      entry.template.sections.flatMap((s) => s.fields).map((f) => [f.id, f]),
    );
    for (const [id, answer] of Object.entries(entry.answers)) {
      const field = fields.get(id);
      let valid = false;
      if (field) {
        if (answer === "") valid = true;
        else if (field.type === "text" || field.type === "textarea")
          valid = typeof answer === "string";
        else if (field.type === "number") valid = typeof answer === "number";
        else if (field.type === "rating")
          valid =
            typeof answer === "number" &&
            Number.isInteger(answer) &&
            answer >= 1 &&
            answer <= 5;
        else if (field.type === "week")
          valid =
            Array.isArray(answer) &&
            answer.length === 7 &&
            answer.every((day) => typeof day === "object" && "dinner" in day);
        else if (field.type === "tasks")
          valid =
            Array.isArray(answer) &&
            answer.every(
              (task) => typeof task === "object" && "title" in task,
            ) &&
            new Set(
              answer.map((task) =>
                typeof task === "object" && "id" in task ? task.id : "",
              ),
            ).size === answer.length;
        else
          valid =
            Array.isArray(answer) &&
            answer.every(
              (option) =>
                typeof option === "string" && field.options.includes(option),
            );
      }
      if (!valid)
        ctx.addIssue({
          code: "custom",
          message: "A response does not match its saved prompt.",
          path: ["answers", id],
        });
    }
    if (
      new Set(entry.commitments.map((c) => c.id)).size !==
      entry.commitments.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate commitment identity.",
      });
  });
export type CheckupEntry = z.infer<typeof checkupEntrySchema>;
export const lifeGoalSchema = z.object({
  id,
  title: short.trim().min(1),
  area: z.enum(lifeAreas),
  why: z.string().max(4000),
  targetDate: date.optional(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type LifeGoal = z.infer<typeof lifeGoalSchema>;
export const weeklyCheckupsSchema = z
  .object({
    entries: z.array(checkupEntrySchema).max(5200),
    templates: z.array(checkupTemplateSchema).max(100),
    goals: z.array(lifeGoalSchema).max(500),
  })
  .superRefine((data, ctx) => {
    for (const keys of [
      data.entries.map((e) => e.week),
      data.entries.map((e) => e.id),
      data.templates.map((t) => t.id),
      data.goals.map((g) => g.id),
    ])
      if (new Set(keys).size !== keys.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate checkup, template, or goal.",
        });
  });
export type WeeklyCheckupsData = z.infer<typeof weeklyCheckupsSchema>;
export const emptyCheckups = (): WeeklyCheckupsData => ({
  entries: [],
  templates: [],
  goals: [],
});

// Calendar arithmetic is UTC-based so daylight-saving changes cannot shift a week.
export function shiftDate(day: string, days: number) {
  const value = new Date(day + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function weekStart(day: string) {
  const value = new Date(day + "T12:00:00Z");
  if (!Number.isFinite(value.getTime()))
    throw new Error("Choose a valid date.");
  return shiftDate(day, -((value.getUTCDay() + 6) % 7));
}
export function weekLabel(week: string) {
  const format = (value: string) =>
    new Date(value + "T12:00:00Z").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${format(week)} – ${format(shiftDate(week, 6))}, ${week.slice(0, 4)}`;
}
const field = (
  id: string,
  label: string,
  type: CheckupField["type"] = "textarea",
  help = "",
  required = false,
): CheckupField => ({
  id,
  label,
  type,
  help,
  required,
  options: [],
  ...(type === "number" && id.startsWith("money-") ? { money: true } : {}),
});
const section = (
  id: string,
  title: string,
  description: string,
  fields: CheckupField[],
): CheckupTemplate["sections"][number] => ({ id, title, description, fields });
const reflection = section(
  "reflect",
  "Pause & reflect",
  "Notice what worked before deciding what comes next.",
  [
    field(
      "wins",
      "What went well last week?",
      "textarea",
      "Small wins count. Think about progress, connection, and moments you enjoyed.",
    ),
    field("lessons", "What felt difficult, and what will you change?"),
    field("energy", "Energy", "rating", "1 = running on empty · 5 = energized"),
    field(
      "balance",
      "Life balance",
      "rating",
      "1 = stretched thin · 5 = balanced",
    ),
  ],
);
const direction = section(
  "direction",
  "Choose your direction",
  "Make room for the things that matter most.",
  [
    field(
      "intention",
      "This week's intention",
      "text",
      "A short phrase to return to during the week.",
      true,
    ),
    field(
      "priorities",
      "Your three most important priorities",
      "textarea",
      "What would make this week feel meaningful? Include work, learning, or personal projects.",
    ),
  ],
);
const care = section(
  "care",
  "Care for your whole life",
  "Your plans should support you, too.",
  [
    field(
      "health",
      "Health, movement & sleep",
      "textarea",
      "Choose a realistic routine and any appointments you need.",
    ),
    field(
      "relationships",
      "Relationships & connection",
      "textarea",
      "Who would you like to check in with or spend time with?",
    ),
    field(
      "home",
      "Home & life admin",
      "textarea",
      "Chores, errands, maintenance, and anything you have been putting off.",
    ),
    field(
      "rest",
      "Fun, creativity & rest",
      "textarea",
      "Protect a little time that doesn't have to be productive.",
    ),
  ],
);
const money = section(
  "money",
  "A moment for your money",
  "Take a snapshot, then decide on one useful next step. Use the currency selected for this checkup.",
  [
    field(
      "money-available",
      "Available balance",
      "number",
      "Money available today in your chosen currency.",
    ),
    field("money-spending", "Planned spending this week", "number"),
    field("money-savings", "Savings balance", "number"),
    field("money-target", "Savings goal", "number"),
    field(
      "money-bills",
      "Bills, upcoming costs & financial next step",
      "textarea",
      "Include due dates, dinner or event budgets, and one action toward your financial goals.",
    ),
  ],
);
const tasks: CheckupTemplate["sections"][number] = {
  ...section(
    "tasks",
    "Upcoming tasks",
    "Start with the shape of your week. Make space for the things that matter.",
    [
      field("tasks-list", "Tasks for the week", "tasks"),
      field("week-plan", "Daily focus & events", "week"),
      field(
        "planning-notes",
        "Planning notes",
        "textarea",
        "Deadlines, reminders, or anything you want to keep in mind.",
      ),
    ],
  ),
  layout: "tasks",
};
const meals: CheckupTemplate["sections"][number] = {
  ...section(
    "meals",
    "Meal plan",
    "A little planning now makes dinner easier later.",
    [
      field("meal-plan", "Dinners for the week", "week"),
      field(
        "groceries",
        "Groceries & prep notes",
        "textarea",
        "What do you need to pick up or prepare ahead of time?",
      ),
    ],
  ),
  layout: "meals",
};
money.layout = "finances";
export const defaultCheckupTemplates: CheckupTemplate[] = [
  {
    id: "life-reset",
    name: "Whole-life reset",
    description:
      "A thoughtful 20-minute meeting: reflection, priorities, wellbeing, money, meals, and plans.",
    sections: [tasks, meals, money, care, reflection, direction],
  },
  {
    id: "quick-reset",
    name: "The 10-minute check-in",
    description:
      "A lighter reset with a short prompt for every major part of life.",
    sections: [
      tasks,
      meals,
      money,
      section(
        "quick-reflect",
        "Look back, look ahead",
        "A few honest sentences are enough.",
        [
          field("wins", "What went well last week?"),
          field("lessons", "What will you do differently?"),
          field(
            "intention",
            "This week's intention",
            "text",
            "Choose one thing to keep in mind.",
            true,
          ),
          field("energy", "Energy", "rating", "1 = low · 5 = high"),
        ],
      ),
      section(
        "quick-life",
        "Check in with your life",
        "Make one small plan for each area.",
        [
          field("priorities", "Work, learning & personal priorities"),
          field("health", "Health, sleep & movement"),
          field("relationships", "People you want to connect with"),
          field("home", "Home, errands & admin"),
          field("rest", "Fun & time to recharge"),
        ],
      ),
    ],
  },
  {
    id: "intentional-week",
    name: "Goals into action",
    description:
      "Connect long-term goals to small weekly steps, anticipate obstacles, and protect your time.",
    sections: [
      tasks,
      meals,
      money,
      reflection,
      section(
        "intentional",
        "Turn intention into action",
        "Start with a direction, then make the next step small enough to take.",
        [
          field(
            "intention",
            "This week's intention",
            "text",
            "What matters most right now?",
            true,
          ),
          field("priorities", "Which long-term goals need attention?"),
          field("obstacles", "What could get in the way?"),
          field(
            "fallback",
            "Your if–then plan",
            "textarea",
            "If an obstacle appears, then I will…",
          ),
          field("boundaries", "What will you say no to this week?"),
        ],
      ),
      care,
    ],
  },
];
export function createCheckup(
  data: WeeklyCheckupsData,
  day: string,
  template: CheckupTemplate,
): CheckupEntry {
  const week = weekStart(day);
  const existing = data.entries.find((e) => e.week === week);
  if (existing) return existing;
  const entry: CheckupEntry = {
    id: uid(),
    week,
    template: JSON.parse(JSON.stringify(checkupTemplateSchema.parse(template))),
    answers: {},
    commitments: [],
    currency: "USD",
    createdAt: now(),
    updatedAt: now(),
  };
  data.entries.push(entry);
  return entry;
}
export function changeCheckupTemplate(
  entry: CheckupEntry,
  template: CheckupTemplate,
) {
  if (entry.completedAt)
    throw new Error("Reopen this checkup before changing its template.");
  const next = checkupTemplateSchema.parse(template);
  const oldFields = entry.template.sections.flatMap((s) => s.fields);
  const answers: Record<string, CheckupAnswer> = {};
  for (const field of next.sections.flatMap((s) => s.fields)) {
    const old = oldFields.find((f) => f.id === field.id);
    if (
      !old ||
      old.type !== field.type ||
      (field.type === "number" && !!old.money !== !!field.money)
    )
      continue;
    const value = entry.answers[field.id];
    if (value === undefined) continue;
    answers[field.id] =
      field.type === "checklist" && Array.isArray(value)
        ? (value as string[]).filter((option) => field.options.includes(option))
        : value;
  }
  // Older default forms kept dinners in the combined weekly planner.
  if (
    !answers["meal-plan"] &&
    next.sections.some((s) =>
      s.fields.some((f) => f.id === "meal-plan" && f.type === "week"),
    ) &&
    Array.isArray(entry.answers["week-plan"]) &&
    entry.answers["week-plan"].every(
      (v) => typeof v === "object" && "dinner" in v,
    )
  ) {
    answers["meal-plan"] = (entry.answers["week-plan"] as CheckupDay[]).map(
      (day) => ({
        focus: "",
        event: "",
        dinner: day.dinner,
        breakfast: day.breakfast ?? "",
        lunch: day.lunch ?? "",
      }),
    );
  }
  entry.template = JSON.parse(JSON.stringify(next));
  entry.answers = JSON.parse(JSON.stringify(answers));
  entry.sessionStep = 0;
  entry.updatedAt = now();
}
export function hasAnswer(value: CheckupAnswer | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return !!value.trim();
  return !!value?.some((v) =>
    typeof v === "string"
      ? !!v.trim()
      : "title" in v
        ? !!v.title.trim()
        : Object.values(v).some((t) => typeof t === "string" && t.trim()),
  );
}
export function checkupProgress(entry: CheckupEntry) {
  const fields = entry.template.sections.flatMap((s) => s.fields);
  return {
    answered: fields.filter((f) => hasAnswer(entry.answers[f.id])).length,
    total: fields.length,
  };
}
export function completionErrors(entry: CheckupEntry): string[] {
  const errors = entry.template.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && !hasAnswer(entry.answers[f.id]))
    .map((f) => f.label);
  if (!checkupProgress(entry).answered && !entry.commitments.length)
    errors.push(
      "Add a response or a commitment before completing your checkup.",
    );
  return errors;
}
export function checkupStats(entries: CheckupEntry[], today: string) {
  const current = weekStart(today);
  const completed = new Set(
    entries
      .filter((e) => e.completedAt && e.week <= current)
      .map((e) => e.week),
  );
  let streak = 0,
    cursor = completed.has(current) ? current : shiftDate(current, -7);
  while (completed.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -7);
  }
  const weeks = Array.from({ length: 12 }, (_, i) =>
    shiftDate(current, (i - 11) * 7),
  );
  // Unreviewed commitments remain in the denominator; drafts and future weeks don't count.
  const commitments = entries
    .filter((e) => e.completedAt && e.week < current)
    .flatMap((e) => e.commitments);
  return {
    streak,
    total: completed.size,
    weeks,
    completed,
    done: commitments.filter((c) => c.outcome === "done").length,
    partial: commitments.filter((c) => c.outcome === "partial").length,
    pending: commitments.filter((c) => c.outcome === "pending").length,
    commitments: commitments.length,
  };
}
export function answerText(value: CheckupAnswer | undefined) {
  if (!hasAnswer(value)) return "Not answered";
  if (!Array.isArray(value)) return String(value);
  return value
    .map((v, i) =>
      typeof v === "string"
        ? v
        : "title" in v
          ? `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][v.day]}: ${v.done ? "✓ " : ""}${v.title}`
          : `${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}: ${[v.focus && `Focus: ${v.focus}`, v.breakfast && `Breakfast: ${v.breakfast}`, v.lunch && `Lunch: ${v.lunch}`, v.dinner && `Dinner: ${v.dinner}`, v.event && `Events: ${v.event}`].filter(Boolean).join(" · ") || "—"}`,
    )
    .join("\n");
}
export function comparisonRows(a: CheckupEntry, b: CheckupEntry) {
  const fields = (e: CheckupEntry) =>
    e.template.sections.flatMap((s) => s.fields);
  const left = fields(a),
    right = fields(b);
  const keys = [...new Set([...left, ...right].map((f) => f.id))];
  return keys.map((id) => {
    const l = left.find((f) => f.id === id),
      r = right.find((f) => f.id === id);
    const av = a.answers[id],
      bv = b.answers[id];
    const compatible =
      !!l &&
      !!r &&
      l.type === r.type &&
      (l.type !== "number" || !!l.money === !!r.money);
    const delta =
      compatible &&
      (l.type === "number" || l.type === "rating") &&
      typeof av === "number" &&
      typeof bv === "number" &&
      (!(l.type === "number" && l.money) || a.currency === b.currency)
        ? Math.round((bv - av) * 100) / 100
        : undefined;
    return {
      id,
      label: r?.label ?? l!.label,
      left: l ? answerText(av) : "Not in this template",
      right: r ? answerText(bv) : "Not in this template",
      delta,
      changed:
        !compatible ||
        JSON.stringify(av) !== JSON.stringify(bv) ||
        (!!l?.money && a.currency !== b.currency),
    };
  });
}

// Full workspace backups carry private checkups; collection exports do not.
// Preserve existing weeks and goal/template identities so repeated imports are idempotent.
export function restoreCheckups(
  w: Workspace,
  incoming: WeeklyCheckupsData,
  warnings: string[],
) {
  const data = (w.settings.weeklyCheckups ??= emptyCheckups());
  const goalIds = new Map<string, string>();
  for (const goal of incoming.goals) {
    const existing = data.goals.find((g) => g.id === goal.id);
    const id = goal.id;
    goalIds.set(goal.id, id);
    if (!existing) data.goals.push({ ...goal, id });
  }
  const templateIds = new Map<string, string>();
  for (const template of incoming.templates) {
    const existing = data.templates.find((t) => t.id === template.id);
    const id = template.id;
    templateIds.set(template.id, id);
    if (!existing) data.templates.push({ ...template, id });
  }
  let skipped = 0;
  for (const entry of incoming.entries) {
    if (data.entries.some((e) => e.week === entry.week)) {
      skipped++;
      continue;
    }
    data.entries.push({
      ...entry,
      id: uid(),
      template: {
        ...entry.template,
        id: templateIds.get(entry.template.id) ?? entry.template.id,
      },
      commitments: entry.commitments.map((c) => ({
        ...c,
        id: uid(),
        goalId: c.goalId ? goalIds.get(c.goalId) : undefined,
      })),
    });
  }
  if (skipped)
    warnings.push(
      `Kept ${skipped} existing weekly checkup(s) instead of replacing them from the backup.`,
    );
}
