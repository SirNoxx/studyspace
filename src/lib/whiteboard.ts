import { codeFence } from "./code-blocks";
export const BOARD_LIMIT = 1000000;
export const MIN_BOARD_ZOOM = 0.05,
  MAX_BOARD_ZOOM = 16;
export const boardCoordinate = (value: number) =>
  Math.max(-BOARD_LIMIT, Math.min(BOARD_LIMIT, value));
export type Point = [number, number];
export type DrawingTool =
  | "pen"
  | "brush"
  | "highlighter"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text";
export interface BoardStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  points: Point[];
  text?: string;
  boxWidth?: number;
  boxHeight?: number;
  bold?: boolean;
  italic?: boolean;
  autoSize?: boolean;
}
export interface BoardData {
  version: 1;
  background: "blank" | "dots" | "grid" | "ruled";
  strokes: BoardStroke[];
}
export const emptyBoard = (): BoardData => ({
  version: 1,
  background: "dots",
  strokes: [],
});
export function parseBoard(code: string): BoardData | null {
  try {
    const value = JSON.parse(code);
    if (
      value.version !== 1 ||
      !["blank", "dots", "grid", "ruled"].includes(value.background) ||
      !Array.isArray(value.strokes) ||
      value.strokes.length > 1000
    )
      return null;
    if (
      !value.strokes.every(
        (s: BoardStroke) =>
          typeof s.id === "string" &&
          [
            "pen",
            "brush",
            "highlighter",
            "line",
            "arrow",
            "rectangle",
            "ellipse",
            "text",
          ].includes(s.tool) &&
          (s.tool !== "text" ||
            (typeof s.text === "string" && s.text.length <= 4000)) &&
          (s.boxWidth === undefined ||
            (Number.isFinite(s.boxWidth) &&
              s.boxWidth >= 40 &&
              s.boxWidth <= 10000)) &&
          (s.boxHeight === undefined ||
            (Number.isFinite(s.boxHeight) &&
              s.boxHeight >= 32 &&
              s.boxHeight <= 10000)) &&
          (s.bold === undefined || typeof s.bold === "boolean") &&
          (s.italic === undefined || typeof s.italic === "boolean") &&
          (s.autoSize === undefined || typeof s.autoSize === "boolean") &&
          /^#[\da-f]{6}$/i.test(s.color) &&
          Number.isFinite(s.width) &&
          s.width >= 1 &&
          s.width <= 60 &&
          Array.isArray(s.points) &&
          s.points.length > 0 &&
          s.points.length <= 4000 &&
          s.points.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              p.every((n) => Number.isFinite(n) && Math.abs(n) <= BOARD_LIMIT),
          ),
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function newWhiteboard() {
  return (
    "\n\n" +
    codeFence({
      id: crypto.randomUUID(),
      language: "whiteboard",
      title: "Whiteboard",
      collapsed: false,
      code: JSON.stringify(emptyBoard()),
    }) +
    "\n\n"
  );
}
export function boardBounds(data: BoardData) {
  if (!data.strokes.length) return { x: 0, y: 0, width: 1000, height: 625 };
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const stroke of data.strokes) {
    if (stroke.tool === "text") {
      const b = textBox(stroke);
      left = Math.min(left, b.x);
      top = Math.min(top, b.y);
      right = Math.max(right, b.x + b.width);
      bottom = Math.max(bottom, b.y + b.height);
    } else
      for (const [x, y] of strokePoints(stroke)) {
        left = Math.min(left, x - stroke.width);
        top = Math.min(top, y - stroke.width);
        right = Math.max(right, x + stroke.width);
        bottom = Math.max(bottom, y + stroke.width);
      }
  }
  return {
    x: left - 32,
    y: top - 32,
    width: Math.max(100, right - left + 64),
    height: Math.max(62.5, bottom - top + 64),
  };
}
export function strokePoints(stroke: BoardStroke): Point[] {
  const a = stroke.points[0],
    b = stroke.points.at(-1)!;
  if (stroke.tool === "rectangle") return [a, [b[0], a[1]], b, [a[0], b[1]], a];
  if (stroke.tool === "ellipse")
    return Array.from({ length: 49 }, (_, i) => {
      const angle = (i * Math.PI) / 24;
      return [
        (a[0] + b[0]) / 2 + (Math.cos(angle) * Math.abs(b[0] - a[0])) / 2,
        (a[1] + b[1]) / 2 + (Math.sin(angle) * Math.abs(b[1] - a[1])) / 2,
      ] as Point;
    });
  if (stroke.tool === "line" || stroke.tool === "arrow") return [a, b];
  return stroke.points;
}
export function strokeHit(stroke: BoardStroke, point: Point, radius: number) {
  if (stroke.tool === "text") {
    const box = textBox(stroke);
    return (
      point[0] >= box.x - radius &&
      point[0] <= box.x + box.width + radius &&
      point[1] >= box.y - radius &&
      point[1] <= box.y + box.height + radius
    );
  }
  const pts = strokePoints(stroke);
  const distance = (a: Point, b: Point) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length,
          ),
        )
      : 0;
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
  };
  return pts.some(
    (p, i) => distance(pts[Math.max(0, i - 1)], p) <= radius + stroke.width / 2,
  );
}

/** Old text positions used a baseline; new boxes store their top-left corner. */
export function textBox(stroke: BoardStroke) {
  const lines = (stroke.text ?? "").split("\n");
  return {
    x: stroke.points[0][0],
    y:
      stroke.boxWidth === undefined
        ? Math.max(0, stroke.points[0][1] - stroke.width)
        : stroke.points[0][1],
    width:
      stroke.boxWidth ??
      Math.min(
        1000,
        Math.max(
          80,
          ...lines.map((line) => line.length * stroke.width * 0.65 + 16),
        ),
      ),
    height:
      stroke.boxHeight ??
      Math.min(625, Math.max(48, lines.length * stroke.width * 1.3 + 16)),
  };
}

/** The SVG and export use the same word wrapping, including long unbroken words. */
export function wrapBoardText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if (line && measure(line + word.trimEnd()) > width) {
        result.push(line.trimEnd());
        line = "";
      }
      for (const char of word) {
        if (!char.trim()) {
          line += char;
          continue;
        }
        if (line && measure(line + char) > width) {
          result.push(line.trimEnd());
          line = "";
        }
        line += char;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}
