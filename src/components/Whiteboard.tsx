"use client";
import {
  useId,
  useRef,
  useState,
  useEffect,
  useMemo,
  memo,
  useCallback,
} from "react";
import {
  PenLine,
  Paintbrush,
  Eraser,
  Highlighter,
  Undo2,
  Redo2,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  Maximize2,
  Download,
  ChevronDown,
  ChevronRight,
  Trash2,
  Hand,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MoreHorizontal,
  Save,
  Globe,
  FolderInput,
  BookOpen,
  Type,
  Bold,
  Italic,
} from "lucide-react";
import type { StudyCodeBlock, BlockAction } from "@/lib/code-blocks";
import {
  parseBoard,
  BOARD_LIMIT,
  MIN_BOARD_ZOOM,
  MAX_BOARD_ZOOM,
  boardCoordinate,
  boardBounds,
  strokePoints,
  strokeHit,
  textBox,
  wrapBoardText,
  type BoardData,
  type BoardStroke,
  type DrawingTool,
  type Point,
} from "@/lib/whiteboard";
import { Modal, Menu } from "./ui";

const tools = [
  { id: "text", label: "Text", icon: Type },
  { id: "hand", label: "Pan", icon: Hand },
  { id: "pen", label: "Pen", icon: PenLine },
  { id: "brush", label: "Brush", icon: Paintbrush },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "line", label: "Line", icon: Minus },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
] as const;
const colors = [
  "#21312a",
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#eab308",
  "#ec4899",
];
function textMeasure(stroke: BoardStroke) {
  const ctx =
    typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
  if (ctx)
    ctx.font = `${stroke.italic ? "italic " : ""}${stroke.bold ? "bold " : ""}${stroke.width}px Arial`;
  return (text: string) =>
    ctx?.measureText(text).width ?? text.length * stroke.width * 0.6;
}
function fitText(stroke: BoardStroke): BoardStroke {
  const box = textBox(stroke),
    measure = textMeasure(stroke);
  const boxWidth = Math.min(
    560,
    Math.max(
      40,
      ...(stroke.text ?? "")
        .split("\n")
        .map((line) => Math.ceil(measure(line)) + 18),
    ),
  );
  const lines = wrapBoardText(stroke.text ?? "", boxWidth - 16, measure);
  const boxHeight = Math.min(
    10000,
    Math.max(32, Math.ceil(lines.length * stroke.width * 1.3) + 16),
  );
  return {
    ...stroke,
    autoSize: true,
    boxWidth,
    boxHeight,
    points: [
      [
        boardCoordinate(box.x + (box.width - boxWidth) / 2),
        boardCoordinate(box.y + (box.height - boxHeight) / 2),
      ],
    ],
  };
}
function textLayout(stroke: BoardStroke) {
  const box = textBox(stroke),
    measure = textMeasure(stroke);
  const lines = wrapBoardText(stroke.text ?? "", box.width - 16, measure);
  return {
    box,
    lines,
    widths: lines.map(measure),
    top: Math.max(8, (box.height - lines.length * stroke.width * 1.3) / 2),
  };
}
const Stroke = memo(function Stroke({
  stroke,
  editing = false,
}: {
  stroke: BoardStroke;
  editing?: boolean;
}) {
  const clip = useId().replace(/:/g, "");
  if (stroke.tool === "text") {
    const { box, lines, top, widths } = textLayout(stroke);
    return (
      <g
        data-stroke-id={stroke.id}
        role="img"
        aria-label={stroke.text || "Empty text box"}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={box.x} y={box.y} width={box.width} height={box.height} />
          </clipPath>
        </defs>
        {lines.map((line, i) => (
          <rect
            key={i}
            data-text-hit="true"
            clipPath={`url(#${clip})`}
            x={box.x + (box.width - Math.max(8, widths[i])) / 2 - 4}
            y={box.y + top + i * stroke.width * 1.3 - 2}
            width={Math.max(8, widths[i]) + 8}
            height={stroke.width * 1.3 + 4}
            fill="transparent"
          />
        ))}
        <text
          clipPath={`url(#${clip})`}
          x={box.x + box.width / 2}
          y={box.y + top + stroke.width}
          textAnchor="middle"
          visibility={editing ? "hidden" : undefined}
          data-editing-text={editing ? "true" : undefined}
          fill={stroke.color}
          fontSize={stroke.width}
          fontFamily="Arial, sans-serif"
          fontWeight={stroke.bold ? "bold" : "normal"}
          fontStyle={stroke.italic ? "italic" : "normal"}
          style={{ whiteSpace: "pre" }}
        >
          {lines.map((line, i) => (
            <tspan
              key={i}
              x={box.x + box.width / 2}
              dy={i ? stroke.width * 1.3 : 0}
            >
              {line || " "}
            </tspan>
          ))}
        </text>
      </g>
    );
  }
  const pts = strokePoints(stroke),
    first = pts[0],
    last = pts.at(-1)!;
  let path = pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  if (stroke.tool === "arrow") {
    const angle = Math.atan2(last[1] - first[1], last[0] - first[0]),
      length = Math.max(16, stroke.width * 3);
    path += ` M${last[0] - length * Math.cos(angle - 0.5)} ${last[1] - length * Math.sin(angle - 0.5)} L${last[0]} ${last[1]} L${last[0] - length * Math.cos(angle + 0.5)} ${last[1] - length * Math.sin(angle + 0.5)}`;
  }
  return (
    <g
      data-stroke-id={stroke.id}
      opacity={
        stroke.tool === "highlighter" ? 0.3 : stroke.tool === "brush" ? 0.8 : 1
      }
    >
      {pts.length === 1 ? (
        <circle
          cx={first[0]}
          cy={first[1]}
          r={stroke.width / 2}
          fill={stroke.color}
        />
      ) : (
        <path
          d={path}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
});
export default function Whiteboard({
  block,
  onChange,
  onAction,
  readOnly = false,
}: {
  block: StudyCodeBlock;
  onChange?: (patch: Partial<StudyCodeBlock>) => void;
  onAction?: (action: BlockAction) => void;
  readOnly?: boolean;
}) {
  const data = useMemo(() => parseBoard(block.code), [block.code]);
  const [tool, setTool] = useState<DrawingTool | "eraser" | "hand">("pen"),
    [color, setColor] = useState(colors[0]),
    [width, setWidth] = useState(4);
  const [expanded, setExpanded] = useState(false),
    [message, setMessage] = useState("");
  const [textEdit, setTextEdit] = useState<BoardStroke | null>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textInput.current?.focus({ preventScroll: true });
  }, [textEdit?.id]);
  const textSession = useRef<string | null>(null);
  const resize = useRef<{
    pointer: number;
    start: BoardStroke;
    mode: "resize" | "move";
    point: Point;
  } | null>(null);
  const [draft, setDraft] = useState<BoardStroke | null>(null),
    [erased, setErased] = useState<string[]>([]);
  const [undo, setUndo] = useState<BoardData[]>([]),
    [redo, setRedo] = useState<BoardData[]>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [surfaceSize, setSurfaceSize] = useState({ width: 1000, height: 625 });
  const surfaceWidth = surfaceSize.width,
    canvasHeight = (1000 * surfaceSize.height) / surfaceWidth;
  const pan = useRef<{
    pointer: number;
    x: number;
    y: number;
    start: typeof viewport;
  } | null>(null);
  const spacePan = useRef(false);
  const zoom = (factor: number) =>
    setViewport((v) => {
      const next = Math.max(
        MIN_BOARD_ZOOM,
        Math.min(MAX_BOARD_ZOOM, v.zoom * factor),
      );
      return {
        zoom: next,
        x: boardCoordinate(v.x + 500 / v.zoom - 500 / next),
        y: boardCoordinate(
          v.y + canvasHeight / 2 / v.zoom - canvasHeight / 2 / next,
        ),
      };
    });
  const fitDrawing = () => {
    if (!data) return;
    const b = boardBounds(data),
      z = Math.max(
        MIN_BOARD_ZOOM,
        Math.min(
          MAX_BOARD_ZOOM,
          Math.min(1000 / b.width, canvasHeight / b.height),
        ),
      );
    setViewport({
      x: b.x + b.width / 2 - 500 / z,
      y: b.y + b.height / 2 - canvasHeight / 2 / z,
      zoom: z,
    });
  };
  const gesture = useRef<{
    pointer: number;
    stroke: BoardStroke | null;
    removed: Set<string>;
    base: BoardData;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    pattern = useId().replace(/:/g, "");
  const [surface, setSurface] = useState<SVGSVGElement | null>(null);
  const attachSurface = useCallback((node: SVGSVGElement | null) => {
    svg.current = node;
    setSurface(node);
  }, []);
  useEffect(() => {
    if (!surface) return;
    const observer = new ResizeObserver(([entry]) =>
      setSurfaceSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    observer.observe(surface);
    return () => observer.disconnect();
  }, [surface]);
  useEffect(() => {
    if (!surface) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = surface.getBoundingClientRect(),
        units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      setViewport((v) => {
        const next = Math.max(
            MIN_BOARD_ZOOM,
            Math.min(
              MAX_BOARD_ZOOM,
              v.zoom * Math.exp(-e.deltaY * units * 0.002),
            ),
          ),
          px = ((e.clientX - r.left) / r.width) * 1000,
          py = ((e.clientY - r.top) / r.height) * canvasHeight;
        return {
          zoom: next,
          x: boardCoordinate(v.x + px / v.zoom - px / next),
          y: boardCoordinate(v.y + py / v.zoom - py / next),
        };
      });
    };
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, [surface, canvasHeight]);
  const latest = useRef({ data, onChange });
  latest.current = { data, onChange };
  useEffect(() => {
    setUndo([]);
    setRedo([]);
    setDraft(null);
    setTextEdit(null);
    textSession.current = null;
    resize.current = null;
    setErased([]);
    gesture.current = null;
  }, [block.id]);
  const commit = (next: BoardData) => {
    if (!latest.current.data) return;
    setUndo((old) => [...old.slice(-29), latest.current.data!]);
    setRedo([]);
    latest.current.onChange?.({ code: JSON.stringify(next) });
  };
  // Persist every edit without replacing the textarea or splitting one editing
  // session into an undo entry per keystroke / pointer movement.
  const updateText = (next: BoardStroke) => {
    const base = latest.current.data;
    if (!base || readOnly) return;
    if (next.autoSize !== false) next = fitText(next);
    if (textSession.current !== next.id) {
      setUndo((old) => [...old.slice(-29), base]);
      textSession.current = next.id;
    }
    setRedo([]);
    setTextEdit(next);
    const exists = base.strokes.some((s) => s.id === next.id);
    const updated = {
      ...base,
      strokes: exists
        ? base.strokes.map((s) => (s.id === next.id ? next : s))
        : [...base.strokes, next],
    };
    latest.current.data = updated;
    latest.current.onChange?.({ code: JSON.stringify(updated) });
  };
  const deselectText = () => {
    setTextEdit(null);
    textSession.current = null;
  };
  const point = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const r = event.currentTarget.getBoundingClientRect();
    return [
      boardCoordinate(
        Math.round(
          (viewport.x +
            (((event.clientX - r.left) / r.width) * 1000) / viewport.zoom) *
            10,
        ) / 10,
      ),
      boardCoordinate(
        Math.round(
          (viewport.y +
            (((event.clientY - r.top) / r.height) * canvasHeight) /
              viewport.zoom) *
            10,
        ) / 10,
      ),
    ];
  };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    if (resize.current?.pointer === event.pointerId) {
      const active = resize.current,
        box = textBox(active.start),
        p = point(event);
      if (active.mode === "resize")
        updateText({
          ...active.start,
          autoSize: false,
          boxWidth: Math.max(
            40,
            Math.min(10000, box.width + p[0] - active.point[0]),
          ),
          boxHeight: Math.max(
            32,
            Math.min(10000, box.height + p[1] - active.point[1]),
          ),
        });
      else
        updateText({
          ...active.start,
          points: [
            [
              boardCoordinate(box.x + p[0] - active.point[0]),
              boardCoordinate(box.y + p[1] - active.point[1]),
            ],
          ],
        });
      return;
    }
    const panning = pan.current;
    if (panning?.pointer === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect(),
        start = panning.start;
      setViewport({
        ...start,
        x: boardCoordinate(
          start.x -
            (((event.clientX - panning.x) / rect.width) * 1000) / start.zoom,
        ),
        y: boardCoordinate(
          start.y -
            (((event.clientY - panning.y) / rect.height) * canvasHeight) /
              start.zoom,
        ),
      });
      return;
    }
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const p = point(event);
    if (!current.stroke) {
      for (const stroke of current.base.strokes)
        if (strokeHit(stroke, p, Math.max(8, width * 2)))
          current.removed.add(stroke.id);
      setErased([...current.removed]);
      return;
    }
    const stroke = current.stroke;
    if (["line", "arrow", "rectangle", "ellipse"].includes(stroke.tool))
      stroke.points = [stroke.points[0], p];
    else if (
      stroke.points.length < 4000 &&
      Math.hypot(
        p[0] - stroke.points.at(-1)![0],
        p[1] - stroke.points.at(-1)![1],
      ) >= 0.8
    )
      stroke.points.push(p);
    setDraft({ ...stroke, points: [...stroke.points] });
  };
  const finish = (event: React.PointerEvent<SVGSVGElement>, cancel = false) => {
    if (resize.current?.pointer === event.pointerId) {
      if (cancel) updateText(resize.current.start);
      else move(event);
      resize.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (pan.current?.pointer === event.pointerId) {
      if (cancel) setViewport(pan.current.start);
      pan.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!cancel) move(event);
    gesture.current = null;
    setDraft(null);
    setErased([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && (current.stroke || current.removed.size))
      commit({
        ...current.base,
        strokes: current.stroke
          ? [...current.base.strokes, current.stroke]
          : current.base.strokes.filter((s) => !current.removed.has(s.id)),
      });
  };
  const exportImage = async () => {
    if (!svg.current) return;
    try {
      const full = svg.current.cloneNode(true) as SVGSVGElement;
      full
        .querySelectorAll("[data-editing-text]")
        .forEach((text) => text.removeAttribute("visibility"));
      full
        .querySelectorAll("[data-text-controls]")
        .forEach((el) => el.remove());
      const bounds = boardBounds(data!);
      full.setAttribute(
        "viewBox",
        `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
      );
      const imageScale = 2000 / Math.max(bounds.width, bounds.height);
      full.setAttribute(
        "width",
        String(Math.max(1, Math.round(bounds.width * imageScale))),
      );
      full.setAttribute(
        "height",
        String(Math.max(1, Math.round(bounds.height * imageScale))),
      );
      const source = new XMLSerializer().serializeToString(full);
      const url = URL.createObjectURL(
        new Blob([source], { type: "image/svg+xml" }),
      );
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        const scale = 2000 / Math.max(bounds.width, bounds.height);
        canvas.width = Math.max(1, Math.round(bounds.width * scale));
        canvas.height = Math.max(1, Math.round(bounds.height * scale));
        canvas
          .getContext("2d")!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error();
        const output = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = output;
        link.download =
          (block.title || "Whiteboard").replace(/[<>:"/\\|?*]/g, "-") + ".png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(output), 1000);
        setMessage("Whiteboard exported as PNG.");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setMessage(
        "The image could not be exported. Your drawing is still saved.",
      );
    }
  };
  if (!data)
    return (
      <section className="whiteboard-invalid">
        This whiteboard could not be read. Its original data is preserved in
        Source mode.
      </section>
    );
  const content = () => (
    <>
      {!readOnly && (
        <div
          className="whiteboard-tools"
          role="toolbar"
          aria-label="Whiteboard tools"
        >
          <div className="whiteboard-tool-group">
            {tools.map((item) => (
              <button
                key={item.id}
                title={item.label}
                aria-label={item.label}
                aria-pressed={tool === item.id}
                onClick={() => {
                  deselectText();
                  setTool(item.id);
                  if (item.id === "highlighter" && color === colors[0])
                    setColor("#eab308");
                }}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="whiteboard-tool-group">
            {colors.map((value) => (
              <button
                key={value}
                className="whiteboard-swatch"
                style={{ backgroundColor: value }}
                aria-label={"Stroke color " + value}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
              />
            ))}
            <input
              type="color"
              aria-label="Custom stroke color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <label>
              Size
              <input
                aria-label="Stroke size"
                type="range"
                min="1"
                max="20"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="whiteboard-tool-group">
            <button
              aria-label="Undo drawing"
              disabled={!undo.length}
              onClick={() => {
                deselectText();
                const prev = undo.at(-1)!;
                setUndo(undo.slice(0, -1));
                setRedo((old) => [...old, data]);
                onChange?.({ code: JSON.stringify(prev) });
              }}
            >
              <Undo2 size={16} />
              Undo
            </button>
            <button
              aria-label="Redo drawing"
              disabled={!redo.length}
              onClick={() => {
                deselectText();
                const next = redo.at(-1)!;
                setRedo(redo.slice(0, -1));
                setUndo((old) => [...old, data]);
                onChange?.({ code: JSON.stringify(next) });
              }}
            >
              <Redo2 size={16} />
              Redo
            </button>
            <select
              aria-label="Whiteboard background"
              value={data.background}
              onChange={(e) =>
                commit({
                  ...data,
                  background: e.target.value as BoardData["background"],
                })
              }
            >
              <option value="blank">Blank</option>
              <option value="dots">Dots</option>
              <option value="grid">Grid</option>
              <option value="ruled">Ruled</option>
            </select>
            <button
              aria-label="Clear whiteboard"
              disabled={!data.strokes.length}
              onClick={() => {
                deselectText();
                commit({ ...data, strokes: [] });
              }}
            >
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </div>
      )}
      <svg
        ref={attachSurface}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${viewport.x} ${viewport.y} ${1000 / viewport.zoom} ${canvasHeight / viewport.zoom}`}
        width="1000"
        height="625"
        className={"whiteboard-surface tool-" + tool}
        role={readOnly ? "img" : "group"}
        aria-label={
          readOnly ? "Saved whiteboard drawing" : "Whiteboard drawing surface"
        }
        tabIndex={0}
        onKeyUp={(e) => {
          if (e.code === "Space") spacePan.current = false;
        }}
        onBlur={() => {
          spacePan.current = false;
        }}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget) {
            if (e.code === "Space") {
              e.preventDefault();
              spacePan.current = true;
              return;
            }
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              setViewport((v) => ({
                ...v,
                x: boardCoordinate(
                  v.x +
                    (e.key === "ArrowRight"
                      ? 80
                      : e.key === "ArrowLeft"
                        ? -80
                        : 0) /
                      v.zoom,
                ),
                y: boardCoordinate(
                  v.y +
                    (e.key === "ArrowDown"
                      ? 80
                      : e.key === "ArrowUp"
                        ? -80
                        : 0) /
                      v.zoom,
                ),
              }));
              return;
            }
            if (e.key === "+" || e.key === "=") {
              e.preventDefault();
              zoom(1.25);
              return;
            }
            if (e.key === "-") {
              e.preventDefault();
              zoom(1 / 1.25);
              return;
            }
          }
          if (readOnly) return;
          if (e.key === "Escape") {
            deselectText();
            e.stopPropagation();
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
            deselectText();
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
              if (redo.length) {
                setRedo(redo.slice(0, -1));
                setUndo([...undo, data]);
                onChange?.({ code: JSON.stringify(redo.at(-1)) });
              }
            } else if (undo.length) {
              setUndo(undo.slice(0, -1));
              setRedo([...redo, data]);
              onChange?.({ code: JSON.stringify(undo.at(-1)) });
            }
          }
        }}
        onPointerDown={(e) => {
          if (![0, 1].includes(e.button) || gesture.current) return;
          e.preventDefault();
          e.currentTarget.focus();
          if (
            tool === "hand" ||
            e.button === 1 ||
            spacePan.current ||
            readOnly
          ) {
            deselectText();
            pan.current = {
              pointer: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              start: viewport,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          const control = (e.target as Element)
            .closest("[data-text-gesture]")
            ?.getAttribute("data-text-gesture");
          if (textEdit && (control === "resize" || control === "move")) {
            resize.current = {
              pointer: e.pointerId,
              start: textEdit,
              mode: control,
              point: point(e),
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
          }
          const id = (e.target as Element)
            .closest("[data-stroke-id]")
            ?.getAttribute("data-stroke-id");
          const existing = data.strokes.find(
            (s) => s.id === id && s.tool === "text",
          );
          if (existing && tool !== "eraser") {
            const box = textBox(existing);
            textSession.current = null;
            setTextEdit({
              ...existing,
              points: [[box.x, box.y]],
              boxWidth: box.width,
              boxHeight: box.height,
            });
            return;
          }
          deselectText();
          if (tool === "text") {
            if (data.strokes.length < 1000) {
              const p = point(e),
                x = boardCoordinate(p[0] - 20),
                y = boardCoordinate(p[1] - 24);
              updateText({
                id: crypto.randomUUID(),
                tool: "text",
                text: "",
                color,
                width: 24,
                points: [[x, y]],
                boxWidth: 40,
                boxHeight: 48,
                autoSize: true,
              });
            } else
              setMessage(
                "This board has 1,000 objects. Add another whiteboard to keep writing.",
              );
            return;
          }
          if (data.strokes.length >= 1000 && tool !== "eraser") {
            setMessage(
              "This board has 1,000 strokes. Add another whiteboard to keep drawing.",
            );
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          const stroke: BoardStroke | null =
            tool === "eraser"
              ? null
              : {
                  id: crypto.randomUUID(),
                  tool,
                  color,
                  width: Math.min(
                    60,
                    width *
                      (tool === "brush" ? 2 : tool === "highlighter" ? 3 : 1),
                  ),
                  points: [point(e)],
                };
          gesture.current = {
            pointer: e.pointerId,
            stroke,
            removed: new Set(),
            base: data,
          };
          setDraft(stroke);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
      >
        <defs>
          <pattern
            id={pattern}
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            {data.background === "dots" ? (
              <circle cx="2" cy="2" r="1" fill="#cbd5e1" />
            ) : data.background === "grid" ? (
              <path
                d="M25 0H0V25"
                fill="none"
                stroke="#dbe3ec"
                strokeWidth="1"
              />
            ) : data.background === "ruled" ? (
              <path d="M0 24H25" stroke="#dbe3ec" strokeWidth="1" />
            ) : null}
          </pattern>
        </defs>
        <rect
          x={-BOARD_LIMIT}
          y={-BOARD_LIMIT}
          width={BOARD_LIMIT * 2}
          height={BOARD_LIMIT * 2}
          fill="#ffffff"
        />
        {data.background !== "blank" && (
          <rect
            x={-BOARD_LIMIT}
            y={-BOARD_LIMIT}
            width={BOARD_LIMIT * 2}
            height={BOARD_LIMIT * 2}
            fill={`url(#${pattern})`}
          />
        )}
        {data.strokes
          .filter((s) => !erased.includes(s.id))
          .map((s) => (
            <Stroke key={s.id} stroke={s} editing={textEdit?.id === s.id} />
          ))}
        {draft && <Stroke stroke={draft} />}
        {!readOnly &&
          textEdit &&
          (() => {
            const box = textBox(textEdit);
            const handleSize = (24 * 1000) / surfaceWidth / viewport.zoom;
            return (
              <g data-text-controls="true">
                <foreignObject
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                >
                  <textarea
                    key={textEdit.id}
                    ref={textInput}
                    aria-label="Whiteboard text box"
                    className="whiteboard-inline-text"
                    value={textEdit.text ?? ""}
                    maxLength={4000}
                    spellCheck
                    style={{
                      fontSize: textEdit.width,
                      color: textEdit.color,
                      fontWeight: textEdit.bold ? 700 : 400,
                      fontStyle: textEdit.italic ? "italic" : "normal",
                      paddingTop: textLayout(textEdit).top,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") {
                        deselectText();
                        svg.current?.focus();
                      }
                      if (
                        (e.ctrlKey || e.metaKey) &&
                        ["b", "i"].includes(e.key.toLowerCase())
                      ) {
                        e.preventDefault();
                        updateText({
                          ...textEdit,
                          ...(e.key.toLowerCase() === "b"
                            ? { bold: !textEdit.bold }
                            : { italic: !textEdit.italic }),
                        });
                      }
                    }}
                    onChange={(e) =>
                      updateText({ ...textEdit, text: e.target.value })
                    }
                  />
                </foreignObject>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={2 / viewport.zoom}
                  pointerEvents="none"
                />
                <rect
                  data-text-gesture="move"
                  x={box.x + Math.max(0, box.width / 2 - 24)}
                  y={box.y - 12}
                  width={48}
                  height={12}
                  rx={4}
                  fill="#2563eb"
                  style={{ cursor: "move" }}
                >
                  <title>Drag to move text box</title>
                </rect>
                <g
                  data-text-gesture="resize"
                  role="button"
                  tabIndex={0}
                  aria-label="Resize text box"
                  transform={`translate(${box.x + box.width} ${box.y + box.height}) scale(${handleSize / 24})`}
                  style={{ cursor: "nwse-resize" }}
                  onKeyDown={(e) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    e.stopPropagation();
                    const step = e.shiftKey ? 10 : 1;
                    updateText({
                      ...textEdit,
                      autoSize: false,
                      boxWidth: Math.max(
                        40,
                        Math.min(
                          10000,
                          box.width +
                            (e.key === "ArrowRight"
                              ? step
                              : e.key === "ArrowLeft"
                                ? -step
                                : 0),
                        ),
                      ),
                      boxHeight: Math.max(
                        32,
                        Math.min(
                          10000,
                          box.height +
                            (e.key === "ArrowDown"
                              ? step
                              : e.key === "ArrowUp"
                                ? -step
                                : 0),
                        ),
                      ),
                    });
                  }}
                >
                  <title>
                    Drag to resize, or use arrow keys (Shift for larger steps)
                  </title>
                  <rect width="24" height="24" fill="transparent" />
                  <path
                    d="M5 5h7M5 5v7M5 5l14 14M19 19v-7M19 19h-7"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                </g>
              </g>
            );
          })()}
      </svg>
      {!readOnly && (
        <div
          className="whiteboard-text-editor"
          role="toolbar"
          aria-label="Text box formatting"
        >
          {textEdit ? (
            <>
              <label>
                Text size
                <input
                  type="number"
                  min={8}
                  max={60}
                  value={textEdit.width}
                  onChange={(e) =>
                    updateText({
                      ...textEdit,
                      width: Math.max(8, Math.min(60, Number(e.target.value))),
                    })
                  }
                />
              </label>
              <button
                aria-label="Bold text"
                title="Bold"
                aria-pressed={!!textEdit.bold}
                onClick={() =>
                  updateText({ ...textEdit, bold: !textEdit.bold })
                }
              >
                <Bold size={17} /> <span>Bold</span>
              </button>
              <button
                aria-label="Italic text"
                title="Italic"
                aria-pressed={!!textEdit.italic}
                onClick={() =>
                  updateText({ ...textEdit, italic: !textEdit.italic })
                }
              >
                <Italic size={17} /> <span>Italic</span>
              </button>
              <label>
                Text color
                <input
                  type="color"
                  value={textEdit.color}
                  onChange={(e) =>
                    updateText({ ...textEdit, color: e.target.value })
                  }
                />
              </label>
              <button
                className="whiteboard-text-action"
                onClick={() => {
                  commit({
                    ...data,
                    strokes: data.strokes.filter((s) => s.id !== textEdit.id),
                  });
                  deselectText();
                }}
              >
                Delete text box
              </button>
              <button className="whiteboard-text-action" onClick={deselectText}>
                Done
              </button>
            </>
          ) : (
            <span>
              Choose Text and click the board to place a text box. Select a box
              to format it.
            </span>
          )}
        </div>
      )}
      <footer className="whiteboard-footer">
        <button onClick={fitDrawing}>Fit drawing</button>
        <div className="whiteboard-navigation">
          <button
            aria-label="Zoom out whiteboard"
            disabled={viewport.zoom <= MIN_BOARD_ZOOM}
            onClick={() => zoom(1 / 1.25)}
          >
            <ZoomOut size={15} />
          </button>
          <button
            aria-label="Reset whiteboard view"
            onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in whiteboard"
            disabled={viewport.zoom >= MAX_BOARD_ZOOM}
            onClick={() => zoom(1.25)}
          >
            <ZoomIn size={15} />
          </button>
        </div>
        <span>
          {readOnly
            ? "Saved drawing"
            : tool === "hand"
              ? "Scroll to zoom · Space + drag to pan"
              : tool === "text"
                ? "Click to place a text box · Select a box to format, move, or resize"
                : tool === "eraser"
                  ? "Erase whole strokes · Undo restores them"
                  : "Draw with a mouse, touch, or stylus · Scroll to zoom"}{" "}
          · {data.strokes.length} strokes
        </span>
        <button onClick={() => void exportImage()}>
          <Download size={15} />
          Export PNG
        </button>
      </footer>
      {message && (
        <p className="whiteboard-message" role="status">
          {message}
        </p>
      )}
    </>
  );
  return (
    <section
      className="study-whiteboard"
      aria-label="Whiteboard"
      onContextMenu={(e) => e.stopPropagation()}
    >
      <header className="whiteboard-header">
        {!readOnly && (
          <button
            aria-label={
              block.collapsed ? "Expand whiteboard" : "Collapse whiteboard"
            }
            aria-expanded={!block.collapsed}
            onClick={() => onChange?.({ collapsed: !block.collapsed })}
          >
            {block.collapsed ? (
              <ChevronRight size={17} />
            ) : (
              <ChevronDown size={17} />
            )}
          </button>
        )}
        {readOnly ? (
          <strong>{block.title || "Whiteboard"}</strong>
        ) : (
          <input
            aria-label="Whiteboard title"
            value={block.title ?? ""}
            placeholder="Whiteboard"
            maxLength={120}
            onChange={(e) => onChange?.({ title: e.target.value })}
          />
        )}
        <button
          aria-label="Enlarge whiteboard"
          title="Enlarge whiteboard"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 size={17} />
        </button>
        <Menu
          trigger={
            <button aria-label="Whiteboard options">
              <MoreHorizontal size={18} />
            </button>
          }
          items={[
            {
              label: "Enlarge whiteboard",
              icon: Maximize2,
              action: () => setExpanded(true),
            },
            {
              label: "Reset view",
              icon: RotateCcw,
              action: () => setViewport({ x: 0, y: 0, zoom: 1 }),
            },
            {
              label: "Export PNG",
              icon: Download,
              disabled: block.collapsed,
              action: () => void exportImage(),
            },
            ...(!readOnly && onAction
              ? [
                  {
                    label: "Save editable copy",
                    icon: Save,
                    action: () => onAction("save"),
                  },
                  {
                    label: "Add to folder / file",
                    icon: FolderInput,
                    action: () => onAction("add"),
                  },
                  {
                    label: "Create study card",
                    icon: BookOpen,
                    action: () => onAction("study"),
                  },
                  {
                    label: "Publish drawing…",
                    icon: Globe,
                    action: () => onAction("publish"),
                  },
                  "separator" as const,
                  {
                    label: "Clear drawing",
                    icon: Eraser,
                    disabled: !data.strokes.length,
                    action: () => commit({ ...data, strokes: [] }),
                  },
                  {
                    label: "Delete whiteboard",
                    icon: Trash2,
                    danger: true,
                    action: () => onAction("delete"),
                  },
                ]
              : []),
          ]}
        />
      </header>
      {expanded ? (
        <Modal
          title={block.title || "Whiteboard"}
          description="Scroll to zoom. Use the Hand tool or hold Space and drag to move around."
          wide
          onClose={() => setExpanded(false)}
        >
          <div className="whiteboard-expanded">{content()}</div>
        </Modal>
      ) : !block.collapsed || readOnly ? (
        <div className="whiteboard-content">{content()}</div>
      ) : (
        <p className="whiteboard-message">
          {data.strokes.length} strokes · Drawing saved
        </p>
      )}
    </section>
  );
}
