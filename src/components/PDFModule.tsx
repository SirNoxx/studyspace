"use client";
import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  PenLine,
  Highlighter,
  Type,
  TextCursorInput,
  Eraser,
  Undo2,
  Redo2,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { findAttachment } from "@/lib/attachments";
import { localDB } from "@/lib/store";
import {
  pdfModuleSchema,
  pdfOverlayPlacement,
  type PDFModuleData,
  type PDFAnnotation,
} from "@/lib/pdf-module";
import type { PDFAssetContext } from "@/lib/pdf-assets";

type Tool = "select" | "pen" | "highlight" | "text" | "correction" | "erase";
const pdfTools = [
  {
    value: "select",
    label: "Select",
    title: "Select and read",
    Icon: MousePointer2,
  },
  { value: "pen", label: "Pen", title: "Draw with a pen", Icon: PenLine },
  {
    value: "highlight",
    label: "Highlight",
    title: "Highlight an area",
    Icon: Highlighter,
  },
  {
    value: "text",
    label: "Add text",
    title: "Place a text annotation",
    Icon: Type,
  },
  {
    value: "correction",
    label: "Correct text",
    title: "Visual text correction — original text remains underneath",
    Icon: TextCursorInput,
  },
  {
    value: "erase",
    label: "Erase text",
    title: "Delete a text annotation",
    Icon: Eraser,
  },
] as const;
type Segment = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: PDFAnnotation[],
  w: number,
  h: number,
) {
  for (const a of annotations) {
    ctx.save();
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    const x = a.x * w,
      y = a.y * h,
      width = a.width * w,
      height = a.height * h;
    if (a.kind === "pen") {
      ctx.lineWidth = (a.size * w) / 600;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      a.points?.forEach(([px, py], i) =>
        i ? ctx.lineTo(px * w, py * h) : ctx.moveTo(px * w, py * h),
      );
      ctx.stroke();
    } else if (a.kind === "highlight") {
      ctx.globalAlpha = 0.28;
      ctx.fillRect(x, y, width, height);
    } else {
      if (a.kind === "correction") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = a.color;
      }
      const size = (a.size * w) / 600;
      ctx.font = `${size}px Arial, sans-serif`;
      ctx.textBaseline = "top";
      let line = "",
        offset = 0;
      for (const paragraph of (a.text ?? "").split("\n")) {
        for (const word of paragraph.split(" ")) {
          const next = line ? line + " " + word : word;
          if (line && ctx.measureText(next).width > width) {
            ctx.fillText(line, x, y + offset);
            offset += size * 1.2;
            line = word;
          } else line = next;
        }
        ctx.fillText(line, x, y + offset);
        offset += size * 1.2;
        line = "";
      }
    }
    ctx.restore();
  }
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function PDFPage({
  doc,
  number,
  width,
  tool,
  annotations,
  onAdd,
  onEdit,
  color,
  size,
  scrollRoot,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  tool: Tool;
  annotations: PDFAnnotation[];
  onAdd: (a: PDFAnnotation) => void;
  onEdit: (a: PDFAnnotation) => void;
  color: string;
  size: number;
  scrollRoot: HTMLDivElement | null;
}) {
  const root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false),
    [ratio, setRatio] = useState(1.414),
    [segments, setSegments] = useState<Segment[]>([]),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<PDFAnnotation | null>(null);
  const draftRef = useRef<PDFAnnotation | null>(null);
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { root: scrollRoot, rootMargin: "500px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [scrollRoot]);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false,
      render: ReturnType<PDFPageProxy["render"]> | undefined;
    void (async () => {
      const page = await doc.getPage(number),
        base = page.getViewport({ scale: 1 });
      if (cancelled) return;
      setRatio(base.height / base.width);
      const viewport = page.getViewport({ scale: width / base.width }),
        target = canvas.current;
      if (!target) return;
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2,
        4096 / Math.max(viewport.width, viewport.height),
      );
      target.width = Math.ceil(viewport.width * dpr);
      target.height = Math.ceil(viewport.height * dpr);
      render = page.render({
        canvas: target,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      await render.promise;
      const content = await page.getTextContent(),
        pdfjs = await import("pdfjs-dist");
      if (cancelled) return;
      setSegments(
        content.items
          .flatMap((item) => {
            if (!("str" in item) || !item.str.trim()) return [];
            const t = pdfjs.Util.transform(base.transform, item.transform),
              height = Math.hypot(t[2], t[3]);
            return [
              {
                text: item.str,
                x: clamp(t[4] / base.width),
                y: clamp((t[5] - height) / base.height),
                width: Math.min(1, item.width / base.width),
                height: height / base.height,
              },
            ];
          })
          .slice(0, 5000),
      );
    })().catch((e) => {
      if (!cancelled) setError(e.message);
    });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [doc, number, width, visible]);
  useEffect(() => {
    const target = overlay.current;
    if (!target || !visible) return;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2,
      4096 / (width * ratio),
    );
    target.width = width * dpr;
    target.height = width * ratio * dpr;
    const ctx = target.getContext("2d")!;
    ctx.scale(dpr, dpr);
    drawAnnotations(
      ctx,
      draft ? [...annotations, draft] : annotations,
      width,
      width * ratio,
    );
  }, [annotations, draft, width, ratio, visible]);
  const point = (e: React.PointerEvent) => {
    const rect = root.current!.getBoundingClientRect();
    return [
      clamp((e.clientX - rect.left) / rect.width),
      clamp((e.clientY - rect.top) / rect.height),
    ] as [number, number];
  };
  const begin = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!["pen", "highlight", "text"].includes(tool) || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const [x, y] = point(e);
    const a: PDFAnnotation = {
      id: crypto.randomUUID(),
      page: number,
      kind: tool as "pen" | "highlight" | "text",
      x,
      y,
      width: Math.min(0.4, 1 - x),
      height: 0.05,
      color,
      size,
      text: "",
      points: [
        [x, y],
        [x + 0.00001 > 1 ? x : x + 0.00001, y],
      ],
    };
    if (tool === "text") {
      onEdit(a);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    draftRef.current = a;
    setDraft(a);
  };
  const move = (e: React.PointerEvent) => {
    const a = draftRef.current;
    if (!a) return;
    const [x, y] = point(e);
    if (a.kind === "pen" && (a.points?.length ?? 0) < 5000)
      a.points = [...a.points!, [x, y]];
    else {
      a.width = x - a.x;
      a.height = y - a.y;
    }
    setDraft({ ...a });
  };
  const end = (e: React.PointerEvent) => {
    const a = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (!a) return;
    if (a.kind === "highlight") {
      if (a.width < 0) {
        a.x += a.width;
        a.width = -a.width;
      }
      if (a.height < 0) {
        a.y += a.height;
        a.height = -a.height;
      }
    }
    onAdd(a);
    e.stopPropagation();
  };
  return (
    <div
      ref={root}
      className={"pdf-page pdf-tool-" + tool}
      data-pdf-page={number}
      style={{ width, height: width * ratio }}
      aria-label={`PDF page ${number}`}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        draftRef.current = null;
        setDraft(null);
      }}
    >
      {visible ? (
        <>
          <canvas
            ref={canvas}
            className="pdf-page-canvas"
            aria-label={`Original PDF page ${number}`}
          />
          <canvas
            ref={overlay}
            className="pdf-page-overlay"
            aria-hidden="true"
          />
          {error ? (
            <p role="alert">
              Page {number}: {error}
            </p>
          ) : null}
          {(tool === "select" || tool === "correction") && (
            <div className="pdf-text-layer">
              {segments.map((s, i) =>
                tool === "correction" ? (
                  <button
                    key={i}
                    aria-label={`Correct text: ${s.text}`}
                    style={{
                      left: s.x * width,
                      top: s.y * width * ratio,
                      width: Math.max(8, s.width * width),
                      height: Math.max(12, s.height * width * ratio),
                    }}
                    onClick={() =>
                      onEdit({
                        id: crypto.randomUUID(),
                        page: number,
                        kind: "correction",
                        ...s,
                        width: Math.max(0.02, s.width),
                        height: Math.min(1, s.height * 1.3),
                        size: Math.max(6, Math.min(96, s.height * ratio * 600)),
                        color,
                        text: s.text,
                      })
                    }
                  >
                    {s.text}
                  </button>
                ) : (
                  <span
                    key={i}
                    style={{
                      left: s.x * width,
                      top: s.y * width * ratio,
                      fontSize: s.height * width * ratio,
                      width: s.width * width,
                      height: s.height * width * ratio,
                    }}
                  >
                    {s.text}
                  </span>
                ),
              )}
            </div>
          )}
          {(tool === "select" || tool === "erase") &&
            annotations
              .filter((a) => a.kind === "text" || a.kind === "correction")
              .map((a) => (
                <button
                  key={a.id}
                  className="pdf-annotation-hit"
                  aria-label={`Edit annotation: ${a.text}`}
                  style={{
                    left: a.x * width,
                    top: a.y * width * ratio,
                    width: a.width * width,
                    height: Math.max(
                      a.height * width * ratio,
                      ((a.size * width) / 600) * 1.2,
                    ),
                  }}
                  onClick={() => onEdit(a)}
                />
              ))}
        </>
      ) : (
        <span className="pdf-page-loading">Page {number}</span>
      )}
    </div>
  );
}

export default function PDFModule({
  data,
  readOnly,
  onChange,
  assets,
  blockId,
}: {
  data: PDFModuleData;
  readOnly: boolean;
  onChange: (d: PDFModuleData) => void;
  assets?: PDFAssetContext;
  blockId: string;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [bytes, setBytes] = useState<Uint8Array | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const [tool, setTool] = useState<Tool>("select"),
    [color, setColor] = useState("#2255aa"),
    [size, setSize] = useState(16),
    [zoom, setZoom] = useState(1),
    [paneWidth, setPaneWidth] = useState(600),
    [current, setCurrent] = useState(1);
  const [editing, setEditing] = useState<PDFAnnotation | null>(null),
    [history, setHistory] = useState<PDFAnnotation[][]>([]),
    [redo, setRedo] = useState<PDFAnnotation[][]>([]);
  const [printFirst, setPrintFirst] = useState(1),
    [printLast, setPrintLast] = useState<number | null>(null);
  const [scroll, setScroll] = useState<HTMLDivElement | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const asset =
    assets && findAttachment(assets.attachments, data.source, assets.fromPath);
  useEffect(() => {
    let stopped = false,
      task:
        ReturnType<(typeof import("pdfjs-dist"))["getDocument"]> | undefined;
    const abort = new AbortController();
    setError("");
    setDoc(null);
    setBytes(null);
    setCurrent(1);
    setEditing(null);
    setHistory([]);
    setRedo([]);
    if (!data.source) return;
    void (async () => {
      if (!asset)
        throw Error(
          "This PDF attachment is unavailable. Restore it from your workspace backup or import it again.",
        );
      let blob: Blob;
      if (assets?.demo) blob = await (await localDB()).get("assets", asset.id);
      else {
        const response = await fetch(
          (assets?.publicBase ?? "/api/attachments/") + asset.id,
          { signal: abort.signal },
        );
        if (!response.ok)
          throw Error(
            "The PDF could not be loaded. Check your connection and access to this file.",
          );
        blob = await response.blob();
      }
      if (!blob) throw Error("This PDF is not available on this device.");
      if (blob.size > 50 * 1024 * 1024)
        throw Error("PDF modules support files up to 50 MB.");
      const original = new Uint8Array(await blob.arrayBuffer()),
        pdfjs = await import("pdfjs-dist");
      if (stopped) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      task = pdfjs.getDocument({
        data: original.slice(),
        cMapUrl: "/pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf-assets/standard_fonts/",
        wasmUrl: "/pdf-assets/wasm/",
        iccUrl: "/pdf-assets/iccs/",
      });
      const document = await task.promise;
      if (document.numPages > 2000)
        throw Error("Split PDFs longer than 2,000 pages before importing.");
      if (stopped) return;
      setBytes(original);
      setDoc(document);
    })().catch((e) => {
      if (!stopped)
        setError(
          e.name === "PasswordException"
            ? "This PDF is password-protected. Import an unlocked copy to read and annotate it."
            : e.message,
        );
    });
    return () => {
      stopped = true;
      abort.abort();
      void task?.destroy();
    };
  }, [asset?.id, data.source, assets?.demo, assets?.publicBase, retry]);
  useEffect(() => {
    if (!scroll) return;
    const observer = new ResizeObserver(() =>
      setPaneWidth(Math.max(180, scroll.clientWidth - 32)),
    );
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [scroll]);
  useEffect(() => {
    if (readOnly) {
      setTool("select");
      setEditing(null);
    }
  }, [readOnly]);
  const commit = (annotations: PDFAnnotation[]) => {
    if (readOnly) return false;
    const next = pdfModuleSchema.safeParse({ ...latest.current, annotations });
    if (!next.success || JSON.stringify(next.data).length > 1_000_000) {
      setError(
        "This PDF has reached its annotation limit. Save a PDF copy before adding more annotations.",
      );
      return false;
    }
    setHistory((h) => [...h.slice(-49), latest.current.annotations]);
    setRedo([]);
    onChange(next.data);
    return true;
  };
  const add = (a: PDFAnnotation) => commit([...latest.current.annotations, a]);
  const edit = (a: PDFAnnotation) => {
    if (readOnly) return;
    if (tool === "erase")
      commit(latest.current.annotations.filter((x) => x.id !== a.id));
    else setEditing({ ...a });
  };
  const go = (page: number) => {
    const p = Math.max(1, Math.min(doc?.numPages ?? 1, page));
    const target = scroll?.querySelector<HTMLElement>(`[data-pdf-page="${p}"]`);
    if (target)
      scroll?.scrollTo({
        top: Math.max(0, target.offsetTop - 16),
        behavior: "instant",
      });
    setCurrent(p);
  };
  const save = async () => {
    if (!bytes || !doc) return;
    setBusy(true);
    setError("");
    try {
      if (!data.annotations.length) {
        download(
          new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
          asset?.filename.split("/").at(-1) ?? "Document.pdf",
        );
        return;
      }
      const { PDFDocument, degrees } = await import("pdf-lib");
      const output = await PDFDocument.load(bytes.slice());
      for (const number of new Set(data.annotations.map((a) => a.page))) {
        if (number > doc.numPages) continue;
        const page = output.getPage(number - 1),
          placement = pdfOverlayPlacement(
            page.getCropBox(),
            page.getRotation().angle,
          );
        const canvas = document.createElement("canvas"),
          scale = Math.min(
            2,
            4096 / Math.max(placement.width, placement.height),
          );
        canvas.width = placement.width * scale;
        canvas.height = placement.height * scale;
        const ctx = canvas.getContext("2d")!;
        drawAnnotations(
          ctx,
          data.annotations.filter((a) => a.page === number),
          canvas.width,
          canvas.height,
        );
        const png = await output.embedPng(canvas.toDataURL("image/png"));
        page.drawImage(png, { ...placement, rotate: degrees(placement.angle) });
        canvas.width = canvas.height = 0;
      }
      download(
        new Blob([Uint8Array.from(await output.save())], {
          type: "application/pdf",
        }),
        (asset?.filename.split("/").at(-1) ?? "Document.pdf").replace(
          /\.pdf$/i,
          "",
        ) + "-annotated.pdf",
      );
    } catch (e) {
      setError("Could not save PDF: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const print = async () => {
    if (!doc) return;
    const last = printLast ?? doc.numPages;
    if (printFirst < 1 || last > doc.numPages || printFirst > last) {
      setError("Choose a valid PDF page range to print.");
      return;
    }
    if (last - printFirst + 1 > 100) {
      setError(
        "Print up to 100 pages at a time using Print page range, or save a PDF copy and print it in your PDF app.",
      );
      return;
    }
    setBusy(true);
    setError("");
    const frame = document.createElement("iframe");
    frame.title = "Print PDF";
    frame.style.cssText =
      "position:fixed;left:-10000px;width:800px;height:1000px;border:0";
    document.body.append(frame);
    try {
      const target = frame.contentDocument!,
        win = frame.contentWindow!;
      target.title = asset?.filename ?? "PDF";
      const style = target.createElement("style");
      style.textContent =
        "@page {margin:0} body{margin:0} img{display:block;width:100%;height:100%;object-fit:contain;break-after:page} img:last-child{break-after:auto}";
      target.head.append(style);
      for (let i = printFirst; i <= last; i++) {
        const page = await doc.getPage(i),
          base = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({
            scale: Math.min(1.5, 2400 / Math.max(base.width, base.height)),
          }),
          canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        drawAnnotations(
          canvas.getContext("2d")!,
          data.annotations.filter((a) => a.page === i),
          canvas.width,
          canvas.height,
        );
        const image = target.createElement("img");
        image.alt = `Page ${i}`;
        image.style.cssText = `page:pdfpage${i};width:${base.width}pt;height:${base.height}pt`;
        style.textContent += `\n@page pdfpage${i}{size:${base.width}pt ${base.height}pt;margin:0}`;
        image.src = canvas.toDataURL("image/png");
        target.body.append(image);
        await image.decode();
        canvas.width = canvas.height = 0;
      }
      win.addEventListener("afterprint", () => frame.remove(), { once: true });
      setTimeout(() => frame.remove(), 300000);
      win.focus();
      win.print();
    } catch (e) {
      frame.remove();
      setError("Could not print PDF: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data.source)
    return (
      <div className="pdf-empty">
        <h3>PDFs</h3>
        <p>Read and annotate original pages without changing their layout.</p>
        {!readOnly && (
          <>
            <label className="secondary">
              Import PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                aria-label="Import PDF into module"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) assets?.onImport?.(file, blockId);
                  e.target.value = "";
                }}
              />
            </label>
            {!!assets?.attachments.some(
              (a) => a.mime === "application/pdf" && !a.trashed,
            ) && (
              <label>
                Or use a PDF already in this workspace
                <select
                  aria-label="Choose existing PDF"
                  value=""
                  onChange={(e) =>
                    onChange({
                      ...data,
                      source: "attachment:" + e.target.value,
                    })
                  }
                >
                  <option value="">Choose PDF…</option>
                  {assets.attachments
                    .filter((a) => a.mime === "application/pdf" && !a.trashed)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.filename}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="pdf-module-editor" onKeyDown={(e) => e.stopPropagation()}>
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF tools">
        {!readOnly && (
          <div
            className="pdf-tool-buttons"
            role="group"
            aria-label="Annotation tools"
          >
            {pdfTools.map(({ value, label, title, Icon }) => (
              <button
                key={value}
                type="button"
                title={title}
                aria-pressed={tool === value}
                onClick={() => setTool(value)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
        <label>
          Zoom
          <select
            aria-label="PDF zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
              <option key={v} value={v}>
                {v === 1 ? "Fit width" : `${v * 100}%`}
              </option>
            ))}
          </select>
        </label>
        {!readOnly && (
          <>
            <label>
              Color
              <input
                type="color"
                aria-label="PDF annotation color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <label>
              Size
              <input
                type="number"
                min={1}
                max={96}
                value={size}
                aria-label="PDF annotation size"
                onChange={(e) =>
                  setSize(
                    Math.max(1, Math.min(96, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <button
              disabled={!history.length}
              onClick={() => {
                const last = history.at(-1)!;
                setRedo((r) => [...r, latest.current.annotations]);
                setHistory((h) => h.slice(0, -1));
                onChange({ ...latest.current, annotations: last });
              }}
            >
              <Undo2 size={16} aria-hidden="true" /> Undo
            </button>
            <button
              disabled={!redo.length}
              onClick={() => {
                const last = redo.at(-1)!;
                setHistory((h) => [...h, latest.current.annotations]);
                setRedo((r) => r.slice(0, -1));
                onChange({ ...latest.current, annotations: last });
              }}
            >
              <Redo2 size={16} aria-hidden="true" /> Redo
            </button>
          </>
        )}
        <button
          data-pdf-save
          disabled={!doc || busy}
          onClick={() => void save()}
        >
          <Download size={16} aria-hidden="true" /> Save PDF copy
        </button>
        <button disabled={!doc || busy} onClick={() => void print()}>
          <Printer size={16} aria-hidden="true" /> Print
        </button>
      </div>
      {tool === "correction" && (
        <p className="pdf-help">
          Click a text segment to add a visual correction. This covers text with
          a white background; the original text remains in the PDF. This is not
          a redaction tool.
        </p>
      )}
      {tool === "text" && (
        <p className="pdf-help">
          Click a page to place a text box. Use Select to edit it later.
        </p>
      )}
      {error && (
        <div role="alert">
          {error}{" "}
          {!doc && (
            <button onClick={() => setRetry((r) => r + 1)}>Retry</button>
          )}
        </div>
      )}
      {!doc && !error && <p role="status">Loading original PDF pages…</p>}
      {editing && (
        <div
          className="pdf-text-editor"
          role="group"
          aria-label="Edit PDF annotation"
        >
          <label>
            Text
            <textarea
              autoFocus
              aria-label="PDF annotation text"
              maxLength={10000}
              value={editing.text ?? ""}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            />
          </label>
          <label>
            Font size
            <input
              aria-label="PDF text font size"
              type="number"
              min={1}
              max={96}
              value={editing.size}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  size: Math.max(1, Math.min(96, Number(e.target.value) || 1)),
                })
              }
            />
          </label>
          <label>
            Text color
            <input
              aria-label="PDF text color"
              type="color"
              value={editing.color}
              onChange={(e) =>
                setEditing({ ...editing, color: e.target.value })
              }
            />
          </label>
          <label>
            Box width (%)
            <input
              aria-label="PDF text box width"
              type="number"
              min={1}
              max={Math.max(1, Math.floor((1 - editing.x) * 100))}
              value={Math.round(editing.width * 100)}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  width: Math.max(
                    0.01,
                    Math.min(1 - editing.x, Number(e.target.value) / 100),
                  ),
                })
              }
            />
          </label>
          <button
            onClick={() => {
              const applied = commit([
                ...latest.current.annotations.filter(
                  (a) => a.id !== editing.id,
                ),
                editing,
              ]);
              if (applied) {
                setEditing(null);
                setTool("select");
              }
            }}
          >
            Apply text
          </button>
          <button onClick={() => setEditing(null)}>Cancel</button>
          {data.annotations.some((a) => a.id === editing.id) && (
            <button
              onClick={() => {
                commit(
                  latest.current.annotations.filter((a) => a.id !== editing.id),
                );
                setEditing(null);
              }}
            >
              Delete annotation
            </button>
          )}
        </div>
      )}
      <div
        ref={setScroll}
        className="pdf-pages"
        tabIndex={0}
        aria-label="PDF pages"
        onScroll={() => {
          if (!scroll) return;
          const viewport = scroll.getBoundingClientRect();
          let mostVisible: HTMLElement | undefined;
          let visibleHeight = 0;
          for (const page of scroll.querySelectorAll<HTMLElement>(
            "[data-pdf-page]",
          )) {
            const bounds = page.getBoundingClientRect();
            const height = Math.max(
              0,
              Math.min(bounds.bottom, viewport.bottom) -
                Math.max(bounds.top, viewport.top),
            );
            if (height > visibleHeight) {
              visibleHeight = height;
              mostVisible = page;
            }
          }
          if (mostVisible) setCurrent(Number(mostVisible.dataset.pdfPage));
        }}
      >
        {doc &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PDFPage
              key={`${asset?.id}-${i}`}
              doc={doc}
              number={i + 1}
              width={paneWidth * zoom}
              tool={readOnly ? "select" : tool}
              annotations={data.annotations.filter((a) => a.page === i + 1)}
              onAdd={add}
              onEdit={edit}
              color={color}
              size={size}
              scrollRoot={scroll}
            />
          ))}
      </div>
      <footer className="pdf-footer">
        <button
          disabled={!doc || current <= 1}
          onClick={() => go(current - 1)}
          aria-label="Previous PDF page"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <label className="pdf-page-counter">
          <input
            aria-label="PDF page number"
            type="number"
            min={1}
            max={doc?.numPages ?? 1}
            value={current}
            onChange={(e) => go(Number(e.target.value) || 1)}
          />
          <span aria-hidden="true">/</span>
          <span aria-label="Total PDF pages">{doc?.numPages ?? "…"}</span>
        </label>
        <button
          disabled={!doc || current === (doc?.numPages ?? 1)}
          onClick={() => go(current + 1)}
          aria-label="Next PDF page"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <span role="status">
          {busy
            ? "Preparing PDF…"
            : readOnly
              ? "Read only"
              : "Annotations save with your note"}
        </span>
      </footer>
      <details className="pdf-print-range">
        <summary>Print page range</summary>
        <label>
          From{" "}
          <input
            aria-label="Print PDF from page"
            type="number"
            min={1}
            max={doc?.numPages ?? 1}
            value={printFirst}
            onChange={(e) => setPrintFirst(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          To{" "}
          <input
            aria-label="Print PDF to page"
            type="number"
            min={1}
            max={doc?.numPages ?? 1}
            value={printLast ?? doc?.numPages ?? 1}
            onChange={(e) => setPrintLast(Number(e.target.value) || 1)}
          />
        </label>
      </details>
      {!!data.annotations.length && !readOnly && (
        <details className="pdf-annotation-list">
          <summary>Annotations ({data.annotations.length})</summary>
          {data.annotations.map((a) => (
            <div key={a.id}>
              <button
                onClick={() => {
                  go(a.page);
                  if (a.kind === "text" || a.kind === "correction")
                    setEditing({ ...a });
                }}
              >
                Page {a.page} · {a.kind} {a.text?.slice(0, 60)}
              </button>
              <button
                aria-label={`Delete ${a.kind} annotation on page ${a.page}`}
                onClick={() =>
                  commit(
                    latest.current.annotations.filter((x) => x.id !== a.id),
                  )
                }
              >
                Delete
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
