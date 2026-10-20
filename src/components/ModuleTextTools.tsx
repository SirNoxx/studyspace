"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  BookA,
  Layers,
  Link2,
  Bold,
  Italic,
  Code2,
  Copy,
  Scissors,
  Clipboard,
  Sparkles,
} from "lucide-react";
import SpellingSuggestions from "./SpellingSuggestions";
import {
  captureModuleText,
  moduleTextAtPoint,
  moduleField,
  replaceModuleText,
  requestModuleTextAction,
  type ModuleTextTarget,
} from "@/lib/module-text";
import { isSpellingWord } from "@/lib/spelling";

export function ModuleTextActions({
  target,
  onError,
  close = () => {},
  clipboard = true,
}: {
  target: ModuleTextTarget;
  onError: (error: string) => void;
  close?: () => void;
  clipboard?: boolean;
}) {
  const replace = (text: string) => {
    if (!replaceModuleText(target, text))
      onError(
        "This field changed or the text is too long. Select the text again.",
      );
    close();
  };
  return (
    <>
      {target.text && isSpellingWord(target.text) && (
        <SpellingSuggestions
          word={target.text}
          onReplace={replace}
          onAccept={close}
        />
      )}
      <Dropdown.Item
        className="menu-item"
        disabled={!target.text.trim()}
        onSelect={() => {
          requestModuleTextAction(target, "definition");
          close();
        }}
      >
        <BookA size={14} />
        Create definition
      </Dropdown.Item>
      <Dropdown.Item
        className="menu-item"
        disabled={!target.text.trim()}
        onSelect={() => {
          requestModuleTextAction(target, "review-card");
          close();
        }}
      >
        <Layers size={14} />
        Create study card
      </Dropdown.Item>
      <Dropdown.Item
        className="menu-item"
        onSelect={() => {
          requestModuleTextAction(target, "hyperlink");
          close();
        }}
      >
        <Link2 size={14} />
        Insert or edit link / definition
      </Dropdown.Item>
      <Dropdown.Item
        className="menu-item"
        disabled={!target.text.trim()}
        onSelect={() => {
          requestModuleTextAction(target, "chat");
          close();
        }}
      >
        <Sparkles size={14} />
        Add to Chat
      </Dropdown.Item>
      <Dropdown.Separator className="menu-separator" />
      <Dropdown.Item
        className="menu-item"
        disabled={!target.text}
        onSelect={() => replace(`**${target.text}**`)}
      >
        <Bold size={14} />
        Bold
      </Dropdown.Item>
      <Dropdown.Item
        className="menu-item"
        disabled={!target.text}
        onSelect={() => replace(`*${target.text}*`)}
      >
        <Italic size={14} />
        Italic
      </Dropdown.Item>
      <Dropdown.Item
        className="menu-item"
        disabled={!target.text}
        onSelect={() => replace("`" + target.text + "`")}
      >
        <Code2 size={14} />
        Inline code
      </Dropdown.Item>
      {clipboard && (
        <>
          <Dropdown.Separator className="menu-separator" />
          <Dropdown.Item
            className="menu-item"
            onSelect={() => {
              void navigator.clipboard
                .writeText(target.text)
                .catch(() => onError("Use Ctrl/Cmd+C to copy this text."));
            }}
          >
            <Copy size={14} />
            Copy
          </Dropdown.Item>
          <Dropdown.Item
            className="menu-item"
            onSelect={() => {
              void navigator.clipboard
                .writeText(target.text)
                .then(() => replace(""))
                .catch(() => onError("Use Ctrl/Cmd+X to cut this text."));
            }}
          >
            <Scissors size={14} />
            Cut
          </Dropdown.Item>
          <Dropdown.Item
            className="menu-item"
            onSelect={() => {
              void navigator.clipboard
                .readText()
                .then(replace)
                .catch(() =>
                  onError("Use Ctrl/Cmd+V to paste into this field."),
                );
            }}
          >
            <Clipboard size={14} />
            Paste
          </Dropdown.Item>
        </>
      )}
    </>
  );
}

export default function ModuleTextTools({
  root,
  readOnly,
}: {
  root: RefObject<HTMLElement | null>;
  readOnly: boolean;
}) {
  const [selection, setSelection] = useState<ModuleTextTarget | null>(null);
  const [menu, setMenu] = useState<{
    target: ModuleTextTarget;
    x: number;
    y: number;
  } | null>(null);
  const [error, setError] = useState("");
  const toolbar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || readOnly) return;
    const selected = () => {
      const field = moduleField(document.activeElement);
      if (field && element.contains(field)) {
        field.spellcheck = true;
        const target = captureModuleText(field);
        setSelection(target.text.trim() ? target : null);
      }
    };
    const context = (event: MouseEvent) => {
      const field = moduleField(event.target);
      if (!field || !element.contains(field)) return;
      setSelection(null);
      if (field.closest(".module-table")) return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({
        target: moduleTextAtPoint(field, event.clientX, event.clientY),
        x: event.clientX,
        y: event.clientY,
      });
    };
    const keyboard = (event: KeyboardEvent) => {
      const field = moduleField(event.target);
      if (!field || !element.contains(field)) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        ["b", "i"].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        event.stopPropagation();
        const target = captureModuleText(field),
          marker = event.key.toLowerCase() === "b" ? "**" : "*";
        if (target.text)
          replaceModuleText(target, marker + target.text + marker);
      }
      if (
        (event.key === "ContextMenu" ||
          (event.shiftKey && event.key === "F10")) &&
        !field.closest(".module-table")
      ) {
        event.preventDefault();
        event.stopPropagation();
        const rect = field.getBoundingClientRect();
        setSelection(null);
        setMenu({
          target: captureModuleText(field, true),
          x: rect.left,
          y: rect.bottom,
        });
      }
    };
    const dismiss = (event: PointerEvent) => {
      if (
        !element.contains(event.target as Node) &&
        !toolbar.current?.contains(event.target as Node)
      )
        setSelection(null);
    };
    element.addEventListener("select", selected, true);
    element.addEventListener("keyup", selected);
    element.addEventListener("pointerup", selected);
    element.addEventListener("focusin", selected);
    element.addEventListener("contextmenu", context, true);
    element.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", dismiss, true);
    return () => {
      element.removeEventListener("select", selected, true);
      element.removeEventListener("keyup", selected);
      element.removeEventListener("pointerup", selected);
      element.removeEventListener("focusin", selected);
      element.removeEventListener("contextmenu", context, true);
      element.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", dismiss, true);
    };
  }, [root, readOnly]);
  useEffect(() => {
    if (!selection) return;
    const position = () => {
      const el = toolbar.current;
      if (!el || !selection.field.isConnected) return;
      const rect = selection.field.getBoundingClientRect();
      el.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - el.offsetWidth - 8))}px`;
      el.style.top = `${Math.max(8, rect.top - el.offsetHeight - 8)}px`;
      el.style.visibility =
        rect.bottom > 0 && rect.top < innerHeight ? "visible" : "hidden";
    };
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [selection]);
  if (readOnly) return null;
  return (
    <>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {selection &&
        !menu &&
        createPortal(
          <div
            ref={toolbar}
            className="selection-context-menu module-selection-toolbar"
            role="toolbar"
            aria-label="Selected module text actions"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              onClick={() => {
                requestModuleTextAction(selection, "definition");
                setSelection(null);
              }}
            >
              <BookA size={14} />
              Create definition
            </button>
            <button
              onClick={() => {
                requestModuleTextAction(selection, "review-card");
                setSelection(null);
              }}
            >
              <Layers size={14} />
              Create study card
            </button>
            <button
              onClick={() => {
                requestModuleTextAction(selection, "hyperlink");
                setSelection(null);
              }}
            >
              <Link2 size={14} />
              Insert or edit link / definition
            </button>
            <button
              onClick={() => {
                requestModuleTextAction(selection, "chat");
                setSelection(null);
              }}
            >
              <Sparkles size={14} />
              Add to Chat
            </button>
          </div>,
          document.body,
        )}
      <Dropdown.Root
        open={!!menu}
        onOpenChange={(open) => {
          if (!open) setMenu(null);
        }}
        modal={false}
      >
        <Dropdown.Trigger asChild>
          <span
            aria-hidden="true"
            tabIndex={-1}
            style={{
              position: "fixed",
              left: menu?.x ?? 0,
              top: menu?.y ?? 0,
              width: 1,
              height: 1,
              pointerEvents: "none",
            }}
          />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            className="context-menu table-context-menu"
            aria-label="Module text actions"
            align="start"
            collisionPadding={8}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {menu && (
              <ModuleTextActions
                target={menu.target}
                onError={setError}
                close={() => setMenu(null)}
              />
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </>
  );
}
