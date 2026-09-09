"use client";
import {
  useLayoutEffect,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";

export default function SelectionToolbar({
  selection,
  children,
  reading = false,
}: {
  selection: string;
  children: (text: string) => ReactNode;
  reading?: boolean;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [readingText, setReadingText] = useState("");
  const text = reading ? readingText : selection;
  useEffect(() => {
    if (!reading) return;
    const update = () => {
      const native = window.getSelection();
      const node = native?.anchorNode;
      const parent =
        node?.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node?.parentElement;
      if (parent?.closest(".writing-area"))
        setReadingText(native?.toString() ?? "");
      else if (!parent?.closest(".selection-context-menu")) setReadingText("");
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [reading]);
  useLayoutEffect(() => {
    let frame = 0;
    const position = () => {
      frame = 0;
      const el = menu.current;
      const native = window.getSelection();
      if (!el || !native?.rangeCount) return;
      const range = native.getRangeAt(0);
      const parent =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as Element)
          : range.commonAncestorContainer.parentElement;
      if (native.isCollapsed || !parent?.closest(".writing-area")) {
        el.style.visibility = "hidden";
        return;
      }
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height ?? innerHeight) - 16;
      const clips = [".document-scroll", ".cm-scroller"].map((selector) =>
        parent.closest(selector)?.getBoundingClientRect(),
      );
      const clipTop = Math.max(topEdge, ...clips.map((clip) => clip?.top ?? 0));
      const clipBottom = Math.min(
        bottomEdge,
        ...clips.map((clip) => clip?.bottom ?? innerHeight),
      );
      const rect = [...range.getClientRects()].find(
        (r) =>
          r.width > 0 &&
          r.height > 0 &&
          r.bottom > clipTop &&
          r.top < clipBottom,
      );
      if (!rect) {
        el.style.visibility = "hidden";
        return;
      }
      el.style.maxWidth = `${rightEdge - leftEdge}px`;
      const { width, height } = el.getBoundingClientRect();
      const above = rect.top - height - 8;
      el.style.left = `${Math.max(leftEdge, Math.min(rightEdge - width, rect.left + rect.width / 2 - width / 2))}px`;
      el.style.top = `${Math.max(topEdge, Math.min(bottomEdge - height, above >= topEdge ? above : rect.bottom + 8))}px`;
      el.style.visibility = "visible";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    schedule();
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const observer = new ResizeObserver(schedule);
    if (menu.current) observer.observe(menu.current);
    const writing = document.querySelector(".writing-area");
    if (writing) observer.observe(writing);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [text]);
  if (!text.trim()) return null;
  return (
    <div
      ref={menu}
      className="selection-context-menu"
      role="toolbar"
      aria-label="Selected text actions"
      style={{ visibility: "hidden" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children(text)}
    </div>
  );
}
