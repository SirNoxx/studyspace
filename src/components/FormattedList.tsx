"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { editList, listPosition, listText } from "@/lib/formatted-list";
import type { ModuleData } from "@/lib/modules";
import ModuleText from "./ModuleText";

type ListData = Extract<ModuleData, { kind: "list" }>;
export default function FormattedList({
  data,
  readOnly,
  onChange,
}: {
  data: ListData;
  readOnly: boolean;
  onChange: (data: ListData) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const helpId = useId();
  const pendingCaret = useRef<number | null>(null);
  const editRange = useRef<{ from: number; to: number } | undefined>(undefined);
  const [error, setError] = useState("");
  const value = listText(data.items);
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    const beforeInput = () => {
      editRange.current = {
        from: element.selectionStart,
        to: element.selectionEnd,
      };
    };
    element.addEventListener("beforeinput", beforeInput);
    return () => element.removeEventListener("beforeinput", beforeInput);
  }, [readOnly]);
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && field.current) {
      field.current.focus({ preventScroll: true });
      field.current.setSelectionRange(
        pendingCaret.current,
        pendingCaret.current,
      );
      pendingCaret.current = null;
    }
  }, [data.items]);
  const add = (index: number) => {
    if (data.items.length >= 100) {
      setError("A list can contain up to 100 items.");
      return;
    }
    const items = [...data.items];
    items.splice(index, 0, { text: "", done: false });
    pendingCaret.current = items
      .slice(0, index)
      .reduce((n, item) => n + item.text.length + 1, 0);
    setError("");
    onChange({ ...data, items });
  };
  return (
    <>
      {!readOnly && (
        <div className="module-controls">
          <label>
            List style
            <select
              aria-label="List style"
              value={data.style}
              onChange={(e) =>
                onChange({
                  ...data,
                  style: e.target.value as ListData["style"],
                })
              }
            >
              <option value="bullets">Bullets</option>
              <option value="numbered">Numbered</option>
              <option value="todo">To-do</option>
            </select>
          </label>
        </div>
      )}
      <div
        className={`formatted-list ${readOnly ? "is-reading" : "is-editing"}`}
      >
        <div className="formatted-list-rows">
          {data.items.map((item, i) => (
            <div className="formatted-list-row" key={i}>
              <span className="formatted-list-marker">
                {data.style === "todo" ? (
                  <input
                    type="checkbox"
                    aria-label={`Complete task ${i + 1}`}
                    checked={item.done}
                    disabled={readOnly}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        items: data.items.map((v, j) =>
                          j === i ? { ...v, done: e.target.checked } : v,
                        ),
                      })
                    }
                  />
                ) : data.style === "numbered" ? (
                  `${i + 1}.`
                ) : (
                  "•"
                )}
              </span>
              {readOnly ? (
                <div
                  className={
                    item.done && data.style === "todo" ? "completed" : ""
                  }
                >
                  <ModuleText text={item.text} />
                </div>
              ) : (
                <div aria-hidden="true" className="formatted-list-measure">
                  {item.text}
                  {"\u200b"}
                </div>
              )}
              {!readOnly && (
                <button
                  aria-label={`Delete list item ${i + 1}`}
                  onClick={() =>
                    onChange({
                      ...data,
                      items: data.items.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <textarea
            ref={field}
            aria-label="Formatted list entries"
            aria-describedby={helpId}
            spellCheck
            value={value}
            placeholder="Write an item…"
            rows={1}
            onChange={(e) => {
              const items = editList(
                data.items,
                e.target.value,
                editRange.current,
              );
              editRange.current = undefined;
              if (items) {
                setError("");
                onChange({ ...data, items });
              } else
                setError(
                  "A list supports 100 items, with up to 20,000 characters each. Your existing entries are unchanged.",
                );
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Tab" &&
                !e.shiftKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey
              ) {
                e.preventDefault();
                e.stopPropagation();
                add(
                  data.items.length
                    ? listPosition(data.items, e.currentTarget.selectionEnd)
                        .index + 1
                    : 0,
                );
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget
                  .closest(".note-module")
                  ?.querySelector<HTMLSelectElement>("select")
                  ?.focus();
              }
            }}
          />
        )}
      </div>
      {!readOnly && (
        <div className="module-controls">
          <button
            disabled={data.items.length >= 100}
            onClick={() => add(data.items.length)}
          >
            <Plus size={14} />
            Add item
          </button>
          <small id={helpId}>
            Tab adds an item · Shift+Tab leaves the list · Drag to select and
            copy entries
          </small>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
