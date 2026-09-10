"use client";
import { useId, useRef, useState, useEffect, useMemo, memo } from "react";
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
} from "lucide-react";
import type { StudyCodeBlock, BlockAction } from "@/lib/code-blocks";
import {
  parseBoard,
  strokePoints,
  strokeHit,
  type BoardData,
  type BoardStroke,
  type DrawingTool,
  type Point,
} from "@/lib/whiteboard";
import { Modal, Menu } from "./ui";

const tools = [
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
const Stroke = memo(function Stroke({ stroke }: { stroke: BoardStroke }) {
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
  const [draft, setDraft] = useState<BoardStroke | null>(null),
    [erased, setErased] = useState<string[]>([]);
  const [undo, setUndo] = useState<BoardData[]>([]),
    [redo, setRedo] = useState<BoardData[]>([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const pan = useRef<{
    pointer: number;
    x: number;
    y: number;
    start: typeof viewport;
  } | null>(null);
  const zoom = (factor: number) =>
    setViewport((v) => {
      const next = Math.max(1, Math.min(4, v.zoom * factor));
      return {
        zoom: next,
        x: Math.max(
          0,
          Math.min(1000 - 1000 / next, v.x + 500 / v.zoom - 500 / next),
        ),
        y: Math.max(
          0,
          Math.min(625 - 625 / next, v.y + 312.5 / v.zoom - 312.5 / next),
        ),
      };
    });
  const gesture = useRef<{
    pointer: number;
    stroke: BoardStroke | null;
    removed: Set<string>;
    base: BoardData;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    pattern = useId().replace(/:/g, "");
  const latest = useRef({ data, onChange });
  latest.current = { data, onChange };
  useEffect(() => {
    setUndo([]);
    setRedo([]);
    setDraft(null);
    setErased([]);
    gesture.current = null;
  }, [block.id]);
  const commit = (next: BoardData) => {
    if (!latest.current.data) return;
    setUndo((old) => [...old.slice(-29), latest.current.data!]);
    setRedo([]);
    latest.current.onChange?.({ code: JSON.stringify(next) });
  };
  const point = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.round(
        Math.max(
          0,
          Math.min(
            1000,
            viewport.x +
              (((event.clientX - rect.left) / rect.width) * 1000) /
                viewport.zoom,
          ),
        ) * 10,
      ) / 10,
      Math.round(
        Math.max(
          0,
          Math.min(
            625,
            viewport.y +
              (((event.clientY - rect.top) / rect.height) * 625) /
                viewport.zoom,
          ),
        ) * 10,
      ) / 10,
    ];
  };
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    const panning = pan.current;
    if (panning?.pointer === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect(),
        start = panning.start;
      setViewport({
        ...start,
        x: Math.max(
          0,
          Math.min(
            1000 - 1000 / start.zoom,
            start.x -
              (((event.clientX - panning.x) / rect.width) * 1000) / start.zoom,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            625 - 625 / start.zoom,
            start.y -
              (((event.clientY - panning.y) / rect.height) * 625) / start.zoom,
          ),
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
      full.setAttribute("viewBox", "0 0 1000 625");
      const source = new XMLSerializer().serializeToString(full);
      const url = URL.createObjectURL(
        new Blob([source], { type: "image/svg+xml" }),
      );
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 2000;
        canvas.height = 1250;
        canvas.getContext("2d")!.drawImage(img, 0, 0, 2000, 1250);
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
              onClick={() => commit({ ...data, strokes: [] })}
            >
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </div>
      )}
      <svg
        ref={svg}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${viewport.x} ${viewport.y} ${1000 / viewport.zoom} ${625 / viewport.zoom}`}
        width="1000"
        height="625"
        className={"whiteboard-surface tool-" + tool}
        role="img"
        aria-label={
          readOnly ? "Saved whiteboard drawing" : "Whiteboard drawing surface"
        }
        tabIndex={readOnly ? undefined : 0}
        onKeyDown={(e) => {
          if (readOnly) return;
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
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
          if (readOnly || e.button !== 0 || gesture.current) return;
          e.preventDefault();
          e.currentTarget.focus();
          if (tool === "hand") {
            pan.current = {
              pointer: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              start: viewport,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
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
        <rect width="1000" height="625" fill="#ffffff" />
        {data.background !== "blank" && (
          <rect width="1000" height="625" fill={`url(#${pattern})`} />
        )}
        {data.strokes
          .filter((s) => !erased.includes(s.id))
          .map((s) => (
            <Stroke key={s.id} stroke={s} />
          ))}
        {draft && <Stroke stroke={draft} />}
      </svg>
      <footer className="whiteboard-footer">
        <div className="whiteboard-navigation">
          <button
            aria-label="Zoom out whiteboard"
            disabled={viewport.zoom <= 1}
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
            disabled={viewport.zoom >= 4}
            onClick={() => zoom(1.25)}
          >
            <ZoomIn size={15} />
          </button>
        </div>
        <span>
          {readOnly
            ? "Saved drawing"
            : tool === "hand"
              ? "Zoom in, then drag to move around"
              : tool === "eraser"
                ? "Erase whole strokes · Undo restores them"
                : "Draw with a mouse, touch, or stylus"}{" "}
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
          description="A larger space for handwritten notes and diagrams."
          wide
          onClose={() => setExpanded(false)}
        >
          <div className="whiteboard-expanded">{content()}</div>
        </Modal>
      ) : !block.collapsed || readOnly ? (
        content()
      ) : (
        <p className="whiteboard-message">
          {data.strokes.length} strokes · Drawing saved
        </p>
      )}
    </section>
  );
}
