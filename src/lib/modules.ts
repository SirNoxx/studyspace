import { z } from "zod";
import { codeFence } from "./code-blocks";

const text = z.string().max(20000);
const item = z.object({ text, done: z.boolean() });
export const moduleSchema = z.discriminatedUnion("kind", [
  z.object({
    version: z.literal(1),
    kind: z.literal("calendar"),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    entries: z.record(z.string(), text),
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("cornell"),
    cues: text,
    notes: text,
    summary: text,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("paper"),
    text,
    style: z.enum(["ruled", "plain", "grid"]),
  }),
  z
    .object({
      version: z.literal(1),
      kind: z.literal("table"),
      headers: z.array(text).min(1).max(12),
      rows: z.array(z.array(text).min(1).max(12)).max(100),
    })
    .refine((d) => d.rows.every((r) => r.length === d.headers.length)),
  z.object({
    version: z.literal(1),
    kind: z.literal("venn"),
    left: text,
    right: text,
    leftOnly: text,
    shared: text,
    rightOnly: text,
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("chart"),
    style: z.enum(["bar", "line", "pie", "candlestick"]),
    candles: z
      .array(
        z.object({
          label: text,
          open: z.number().finite().min(-1e9).max(1e9),
          high: z.number().finite().min(-1e9).max(1e9),
          low: z.number().finite().min(-1e9).max(1e9),
          close: z.number().finite().min(-1e9).max(1e9),
        }),
      )
      .min(1)
      .max(24)
      .optional(),
    rows: z
      .array(
        z.object({
          label: text,
          value: z.number().finite().min(-1e9).max(1e9),
        }),
      )
      .min(1)
      .max(24),
  }),
  z.object({
    version: z.literal(1),
    kind: z.literal("list"),
    style: z.enum(["bullets", "numbered", "todo"]),
    items: z.array(item).max(100),
  }),
]);
export type ModuleData = z.infer<typeof moduleSchema>;
export type ChartData = Extract<ModuleData, { kind: "chart" }>;
export type Candle = NonNullable<ChartData["candles"]>[number];
export function chartCandles(data: ChartData): Candle[] {
  return (
    data.candles ??
    data.rows.map((r) => ({
      label: r.label,
      open: 0,
      close: r.value,
      high: Math.max(0, r.value),
      low: Math.min(0, r.value),
    }))
  );
}
export function validCandle(c: Candle) {
  return (
    c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close)
  );
}
export const moduleTemplates = [
  {
    id: "calendar",
    title: "Calendar",
    description: "A monthly planner with space for daily notes.",
    category: "Planning",
    preview: "calendar",
  },
  {
    id: "cornell",
    title: "Cornell notes",
    description: "Capture cues, detailed notes, and a summary.",
    category: "Writing",
    preview: "cornell",
  },
  {
    id: "paper",
    title: "Paper",
    description: "A lined writing surface for longer thoughts.",
    category: "Writing",
    preview: "paper",
  },
  {
    id: "table",
    title: "Table",
    description: "Editable cells with buttons to add rows and columns.",
    category: "Data",
    preview: "table",
  },
  {
    id: "venn",
    title: "Venn diagram",
    description: "Compare two topics and their shared ideas.",
    category: "Visuals",
    preview: "venn",
  },
  {
    id: "chart",
    title: "Chart",
    description:
      "Edit labels and values for bar, line, pie, or candlestick charts.",
    category: "Visuals",
    preview: "chart",
  },
  {
    id: "list",
    title: "Formatted list",
    description: "Organize ideas using bullets or numbered steps.",
    category: "Writing",
    preview: "list",
  },
  {
    id: "todo",
    title: "To-do list",
    description: "Check off tasks as you complete them.",
    category: "Planning",
    preview: "todo",
  },
] as const;
export type ModuleTemplate = (typeof moduleTemplates)[number]["id"];
export function createModuleData(
  kind: ModuleTemplate,
  date = new Date(),
): ModuleData {
  switch (kind) {
    case "calendar":
      return {
        version: 1,
        kind,
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        entries: {},
      };
    case "cornell":
      return { version: 1, kind, cues: "", notes: "", summary: "" };
    case "paper":
      return { version: 1, kind, text: "", style: "ruled" };
    case "table":
      return {
        version: 1,
        kind,
        headers: ["Topic", "Details", "Example"],
        rows: [
          ["", "", ""],
          ["", "", ""],
        ],
      };
    case "venn":
      return {
        version: 1,
        kind,
        left: "Topic A",
        right: "Topic B",
        leftOnly: "",
        shared: "",
        rightOnly: "",
      };
    case "chart":
      return {
        version: 1,
        kind,
        style: "bar",
        rows: [
          { label: "A", value: 3 },
          { label: "B", value: 5 },
          { label: "C", value: 4 },
        ],
      };
    default:
      return {
        version: 1,
        kind: "list",
        style: kind === "todo" ? "todo" : "bullets",
        items: [
          { text: "", done: false },
          { text: "", done: false },
          { text: "", done: false },
        ],
      };
  }
}
export function newModule(kind: ModuleTemplate) {
  return (
    "\n\n" +
    codeFence({
      id: crypto.randomUUID(),
      language: "module",
      collapsed: false,
      title: moduleTemplates.find((t) => t.id === kind)!.title,
      code: JSON.stringify(createModuleData(kind)),
    }) +
    "\n\n"
  );
}
export function parseModule(code: string): ModuleData | null {
  try {
    return moduleSchema.parse(JSON.parse(code));
  } catch {
    return null;
  }
}
export function moduleText(code: string): string {
  const d = parseModule(code);
  if (!d) return code;
  switch (d.kind) {
    case "calendar":
      return (
        `${d.month}\n` +
        Object.entries(d.entries)
          .map(([day, t]) => `${day}: ${t}`)
          .join("\n")
      );
    case "cornell":
      return `Cues: ${d.cues}\nNotes: ${d.notes}\nSummary: ${d.summary}`;
    case "paper":
      return d.text;
    case "table":
      return [d.headers, ...d.rows].map((r) => r.join(" | ")).join("\n");
    case "venn":
      return `${d.left}: ${d.leftOnly}\nShared: ${d.shared}\n${d.right}: ${d.rightOnly}`;
    case "chart":
      if (d.style === "candlestick")
        return chartCandles(d)
          .map(
            (r) =>
              `${r.label}: Open ${r.open}, High ${r.high}, Low ${r.low}, Close ${r.close}${validCandle(r) ? "" : " (invalid range)"}`,
          )
          .join("\n");
      return d.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    case "list":
      return d.items
        .map(
          (i, n) =>
            `${d.style === "todo" ? (i.done ? "[x]" : "[ ]") : d.style === "numbered" ? `${n + 1}.` : "-"} ${i.text}`,
        )
        .join("\n");
  }
}
