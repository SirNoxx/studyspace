import { codeFence } from "./code-blocks";
export type Point = [number, number];
export type DrawingTool =
  "pen" | "brush" | "highlighter" | "line" | "arrow" | "rectangle" | "ellipse";
export interface BoardStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  points: Point[];
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
          ].includes(s.tool) &&
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
              p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000),
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
