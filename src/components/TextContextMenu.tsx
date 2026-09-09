"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookA,
  Layers,
  Link2,
  Copy,
  Scissors,
  Clipboard,
  Bold,
  Italic,
  Code2,
} from "lucide-react";
import type { EditorHandle } from "./Editor";

export default function TextContextMenu({
  editor,
  reading,
  onDictionary,
  onCard,
  onLink,
  onError,
}: {
  editor: React.RefObject<EditorHandle | null>;
  reading: boolean;
  onDictionary: (text: string) => void;
  onCard: (text: string) => void;
  onLink: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [context, setContext] = useState<{
    x: number;
    y: number;
    text: string;
    range?: { from: number; to: number };
  } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (!(event.target instanceof Element)) return;
      if (
        !event.target.closest(".writing-area") &&
        !(
          reading &&
          "key" in event &&
          !event.target.closest("input, textarea, [contenteditable=true]")
        )
      )
        return;
      const native = window.getSelection();
      const range = native?.rangeCount ? native.getRangeAt(0) : null;
      const parent = range?.commonAncestorContainer.parentElement;
      const text = reading
        ? parent?.closest(".writing-area")
          ? (native?.toString() ?? "")
          : ""
        : (editor.current?.selection() ?? "");
      if (!text.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      savedRange.current = range?.cloneRange() ?? null;
      previousFocus.current = document.activeElement as HTMLElement;
      const rect = range?.getBoundingClientRect();
      setContext({
        text,
        range: reading ? undefined : editor.current?.range(),
        x:
          "clientX" in event && event.clientX
            ? event.clientX
            : (rect?.left ?? 16),
        y:
          "clientY" in event && event.clientY
            ? event.clientY
            : (rect?.bottom ?? 16),
      });
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      )
        open(event);
    };
    document.addEventListener("contextmenu", open, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("contextmenu", open, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, [reading, editor]);
  useLayoutEffect(() => {
    if (!context || !menu.current) return;
    const element = menu.current;
    const viewport = window.visualViewport;
    const left = (viewport?.offsetLeft ?? 0) + 8,
      top = (viewport?.offsetTop ?? 0) + 8;
    element.style.left = `${Math.max(left, Math.min(context.x, left + (viewport?.width ?? innerWidth) - element.offsetWidth - 16))}px`;
    element.style.top = `${Math.max(top, Math.min(context.y, top + (viewport?.height ?? innerHeight) - element.offsetHeight - 16))}px`;
    element
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) setContext(null);
    };
    const close = () => setContext(null);
    const scroll = (event: Event) => {
      if (!element.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [context]);
  if (!context) return null;
  const restore = () => {
    if (!reading) editor.current?.focus();
    else previousFocus.current?.focus({ preventScroll: true });
    if (savedRange.current?.commonAncestorContainer.isConnected) {
      const native = window.getSelection();
      native?.removeAllRanges();
      native?.addRange(savedRange.current);
    }
  };
  const replaceAfterClipboard = (value: string) => {
    const current = editor.current?.range();
    if (!mounted.current) return;
    if (
      !current ||
      current.from !== context.range?.from ||
      current.to !== context.range?.to ||
      editor.current?.selection() !== context.text
    ) {
      onError(
        "The selection changed. Open the menu again to edit the new selection.",
      );
      return;
    }
    editor.current?.insert(value);
  };
  const action = (run: () => void | Promise<void>) => {
    restore();
    setContext(null);
    Promise.resolve()
      .then(run)
      .catch(() =>
        onError(
          "Clipboard access is unavailable. Use Ctrl+C, Ctrl+X, or Ctrl+V in the editor.",
        ),
      );
  };
  return (
    <div
      ref={menu}
      className="context-menu selected-text-menu"
      role="menu"
      aria-label="Text context menu"
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const items = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length
          ]?.focus();
        }
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          restore();
          setContext(null);
        }
      }}
    >
      <button
        role="menuitem"
        className="menu-item"
        onClick={() => action(() => onLink(context.text))}
      >
        <Link2 size={15} />
        Insert / edit link
      </button>
      <div role="separator" className="menu-separator" />
      <button
        role="menuitem"
        className="menu-item"
        onClick={() => action(() => onDictionary(context.text))}
      >
        <BookA size={15} />
        Add to dictionary
      </button>
      <button
        role="menuitem"
        className="menu-item"
        onClick={() => action(() => onCard(context.text))}
      >
        <Layers size={15} />
        Create study card
      </button>
      <div role="separator" className="menu-separator" />
      {!reading && (
        <>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => action(() => editor.current?.wrap("**", "**"))}
          >
            <Bold size={15} />
            Bold
          </button>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => action(() => editor.current?.wrap("*", "*"))}
          >
            <Italic size={15} />
            Italic
          </button>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => action(() => editor.current?.wrap("`", "`"))}
          >
            <Code2 size={15} />
            Code
          </button>
          <div role="separator" className="menu-separator" />
          <button
            role="menuitem"
            className="menu-item"
            onClick={() =>
              action(async () => {
                await navigator.clipboard.writeText(context.text);
                replaceAfterClipboard("");
              })
            }
          >
            <Scissors size={15} />
            Cut
          </button>
        </>
      )}
      <button
        role="menuitem"
        className="menu-item"
        onClick={() =>
          action(() => navigator.clipboard.writeText(context.text))
        }
      >
        <Copy size={15} />
        Copy
      </button>
      {!reading && (
        <button
          role="menuitem"
          className="menu-item"
          onClick={() =>
            action(async () =>
              replaceAfterClipboard(await navigator.clipboard.readText()),
            )
          }
        >
          <Clipboard size={15} />
          Paste
        </button>
      )}
    </div>
  );
}
