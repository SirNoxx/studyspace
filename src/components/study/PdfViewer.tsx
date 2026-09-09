"use client";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Highlighter,
  Search,
  Save,
} from "lucide-react";
import type { AppContext } from "../WorkspaceApp";
import { localDB } from "@/lib/store";
import { uid, now, type Anchor, type Attachment } from "@/lib/model";
import { IconButton, Field } from "../ui";
type Rect = { x: number; y: number; width: number; height: number };
export default function PdfViewer({
  ctx,
  attachmentId,
  anchorId,
  publicAttachment,
  publicAnchors = [],
  publicUrl,
}: {
  ctx?: AppContext;
  publicAttachment?: Attachment;
  publicAnchors?: Anchor[];
  publicUrl?: string;
  attachmentId: string;
  anchorId?: string;
}) {
  const attachment =
    publicAttachment ?? ctx?.w.attachments.find((a) => a.id === attachmentId);
  const allAnchors = ctx?.w.anchors ?? publicAnchors;
  const savedAnchor = allAnchors.find((a) => a.id === anchorId);
  const [pdf, setPdf] = useState<any>(null),
    [page, setPage] = useState((savedAnchor?.page ?? 0) + 1),
    [scale, setScale] = useState(1),
    [rotation, setRotation] = useState(0),
    [error, setError] = useState(""),
    [quote, setQuote] = useState(""),
    [rects, setRects] = useState<Rect[]>([]),
    [region, setRegion] = useState(false),
    [textAvailable, setTextAvailable] = useState(true),
    [search, setSearch] = useState(""),
    [searchResult, setSearchResult] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    pageElement = useRef<HTMLDivElement>(null),
    textLayer = useRef<HTMLDivElement>(null),
    dragStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let task: any;
    let cancelled = false;
    (async () => {
      if (!attachment) return;
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        let bytes: Uint8Array;
        if (ctx?.demo) {
          const blob = (await (
            await localDB()
          ).get("assets", attachment.id)) as Blob | undefined;
          if (!blob)
            throw new Error("The PDF file is missing from this device.");
          bytes = new Uint8Array(await blob.arrayBuffer());
        } else {
          const r = await fetch(
            publicUrl ?? "/api/attachments/" + attachment.id,
          );
          if (!r.ok) throw new Error("This PDF is unavailable.");
          bytes = new Uint8Array(await r.arrayBuffer());
        }
        task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
        task.onPassword = () => {
          setError(
            "This PDF is password protected. Import an unlocked copy to use the evidence viewer.",
          );
          task.destroy();
        };
        const document = await task.promise;
        if (!cancelled) setPdf(document);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [attachmentId]);
  useEffect(() => {
    if (!pdf || !canvas.current || !textLayer.current) return;
    let renderTask: any,
      layer: any,
      cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale, rotation });
        const c = canvas.current!;
        c.width = viewport.width;
        c.height = viewport.height;
        pageElement.current!.style.width = viewport.width + "px";
        pageElement.current!.style.height = viewport.height + "px";
        pageElement.current!.style.setProperty("--scale-factor", String(scale));
        pageElement.current!.style.setProperty(
          "--total-scale-factor",
          String(scale),
        );
        renderTask = pdfPage.render({
          canvas: c,
          canvasContext: c.getContext("2d")!,
          viewport,
        });
        await renderTask.promise;
        if (cancelled) return;
        const content = await pdfPage.getTextContent();
        setTextAvailable(content.items.length > 0);
        textLayer.current!.replaceChildren();
        const { TextLayer } = await import("pdfjs-dist");
        layer = new TextLayer({
          textContentSource: content,
          container: textLayer.current!,
          viewport,
        });
        await layer.render();
      } catch (e) {
        if (!cancelled && (e as Error).name !== "RenderingCancelledException")
          setError("Unable to render this PDF page.");
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, scale, rotation]);
  const normalized = (client: DOMRect): Rect => {
    const page = pageElement.current!.getBoundingClientRect();
    return {
      x: Math.max(0, (client.x - page.x) / page.width),
      y: Math.max(0, (client.y - page.y) / page.height),
      width: Math.min(1, client.width / page.width),
      height: Math.min(1, client.height / page.height),
    };
  };
  const selected = () => {
    if (region) return;
    const selection = window.getSelection();
    if (
      selection?.isCollapsed ||
      !selection?.rangeCount ||
      !pageElement.current?.contains(selection.anchorNode) ||
      !pageElement.current.contains(selection.focusNode)
    )
      return;
    setQuote(selection.toString());
    const range = selection.getRangeAt(0);
    setRects(
      Array.from(range.getClientRects())
        .map(normalized)
        .filter((r) => r.width > 0 && r.height > 0),
    );
  };
  // Stored coordinates use rotation 0. Transform rectangles only for presentation.
  const rotate = (r: Rect, angle: number): Rect => {
    const a = (angle + 360) % 360;
    if (a === 90)
      return {
        x: 1 - r.y - r.height,
        y: r.x,
        width: r.height,
        height: r.width,
      };
    if (a === 180)
      return {
        x: 1 - r.x - r.width,
        y: 1 - r.y - r.height,
        width: r.width,
        height: r.height,
      };
    if (a === 270)
      return { x: r.y, y: 1 - r.x - r.width, width: r.height, height: r.width };
    return r;
  };
  const anchors = allAnchors.filter(
    (a) => a.contentHash === attachment?.hash && a.page === page - 1,
  );
  const save = () => {
    if (!ctx || !attachment || !rects.length) return;
    ctx.mutate((w) => {
      let source = w.sources.find((s) => s.attachmentId === attachment.id);
      if (!source) {
        source = {
          id: uid(),
          input: attachment.filename,
          canonical: "attachment:" + attachment.id,
          title: attachment.filename,
          kind: "pdf",
          authors: [],
          noteIds: ctx.active ? [ctx.active.id] : [],
          subjectIds: ctx.active ? [ctx.active.containerId] : [],
          attachmentId: attachment.id,
          manual: true,
          overrides: [],
          status: "ready",
          createdAt: now(),
        };
        w.sources.push(source);
      }
      w.anchors.push({
        id: uid(),
        sourceId: source.id,
        noteId: ctx.active?.id,
        noteRevision: ctx.active?.revision,
        quote,
        prefix: "",
        suffix: "",
        locator: "Page " + page,
        page: page - 1,
        rotation: 0,
        rects: rects.map((r) => rotate(r, 360 - rotation)),
        contentHash: attachment.hash,
        state: "attached",
      });
    }, "Exact PDF highlight saved.");
    setRects([]);
    setQuote("");
  };
  return (
    <div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!pdf && !error && <p role="status">Opening PDF…</p>}
      {pdf && (
        <>
          <div className="pdf-toolbar">
            <IconButton
              label="Previous page"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => p - 1);
                setRects([]);
              }}
            >
              <ChevronLeft size={16} />
            </IconButton>
            <input
              type="number"
              min={1}
              max={pdf.numPages}
              aria-label="PDF page"
              value={page}
              onChange={(e) =>
                setPage(
                  Math.min(pdf.numPages, Math.max(1, Number(e.target.value))),
                )
              }
            />
            <span>of {pdf.numPages}</span>
            <IconButton
              label="Next page"
              disabled={page >= pdf.numPages}
              onClick={() => {
                setPage((p) => p + 1);
                setRects([]);
              }}
            >
              <ChevronRight size={16} />
            </IconButton>
            <IconButton
              label="Zoom out"
              onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}
            >
              <ZoomOut size={16} />
            </IconButton>
            <span>{Math.round(scale * 100)}%</span>
            <IconButton
              label="Zoom in"
              onClick={() => setScale((s) => Math.min(3, s + 0.2))}
            >
              <ZoomIn size={16} />
            </IconButton>
            <IconButton
              label="Rotate PDF"
              onClick={() => {
                setRotation((r) => (r + 90) % 360);
                setRects([]);
              }}
            >
              <RotateCw size={16} />
            </IconButton>
            <button
              className={"secondary " + (region ? "active" : "")}
              onClick={() => setRegion(!region)}
            >
              <Highlighter size={14} />
              {region ? "Text selection" : "Draw region"}
            </button>
          </div>
          <div className="pdf-toolbar">
            <input
              style={{ width: 180, textAlign: "left" }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Find text in PDF"
              placeholder="Find in PDF…"
            />
            <button
              className="secondary"
              onClick={async () => {
                if (!search) return;
                const pages = [];
                for (let i = 1; i <= Math.min(pdf.numPages, 500); i++) {
                  const p = await pdf.getPage(i);
                  const t = await p.getTextContent();
                  if (
                    t.items
                      .map((i: any) => i.str)
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase())
                  )
                    pages.push(i);
                }
                setSearchResult(
                  pages.length
                    ? "Found on pages " + pages.join(", ")
                    : "No matching text.",
                );
                if (pages.length) setPage(pages[0]);
              }}
            >
              <Search size={14} /> Find
            </button>
            <span>{searchResult}</span>
          </div>
          {!textAvailable && (
            <p className="field-hint">
              No selectable text on this page. Draw a region and enter a quote
              or explanation.
            </p>
          )}
          <div className="pdf-stage">
            <div className="pdf-page" ref={pageElement} onMouseUp={selected}>
              <canvas ref={canvas} />
              <div className="textLayer" ref={textLayer} />
              {anchors.flatMap((a) =>
                (a.rects ?? []).map((raw, i) => {
                  const r = rotate(raw, rotation);
                  return (
                    <div
                      key={a.id + i}
                      className="pdf-highlight"
                      style={{
                        left: r.x * 100 + "%",
                        top: r.y * 100 + "%",
                        width: r.width * 100 + "%",
                        height: r.height * 100 + "%",
                        outline:
                          a.id === anchorId ? "2px solid #a27515" : undefined,
                      }}
                    />
                  );
                }),
              )}
              {rects.map((r, i) => (
                <div
                  className="pdf-highlight"
                  key={"draft" + i}
                  style={{
                    left: r.x * 100 + "%",
                    top: r.y * 100 + "%",
                    width: r.width * 100 + "%",
                    height: r.height * 100 + "%",
                    background: "#79b4aa55",
                  }}
                />
              ))}
              {region && (
                <div
                  className="pdf-selection-overlay"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragStart.current = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerUp={(e) => {
                    const start = dragStart.current;
                    if (start) {
                      const r = new DOMRect(
                        Math.min(start.x, e.clientX),
                        Math.min(start.y, e.clientY),
                        Math.abs(start.x - e.clientX),
                        Math.abs(start.y - e.clientY),
                      );
                      setRects([normalized(r)]);
                      dragStart.current = null;
                    }
                  }}
                />
              )}
            </div>
          </div>
          {ctx && (
            <>
              <Field label="Selected quote / region description">
                <textarea
                  rows={2}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  placeholder="Select a passage above, or describe your highlighted region."
                />
              </Field>
              <button
                className="primary"
                disabled={!rects.length || !quote.trim()}
                onClick={save}
              >
                <Save size={15} /> Save exact highlight
              </button>
            </>
          )}
          <div className="pdf-quotes">
            {anchors.map((a) => (
              <button
                key={a.id}
                onClick={() =>
                  ctx?.setDialog({ type: "citation-detail", id: a.id })
                }
              >
                {a.locator} · {a.quote}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
