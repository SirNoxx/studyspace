"use client";
import { useRef, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Plus, Trash2, Copy, Clipboard, Scissors } from "lucide-react";
import { ModuleTextActions } from "./ModuleTextTools";
import ModuleText from "./ModuleText";
import {
  captureModuleText,
  moduleTextAtPoint,
  moduleField,
  type ModuleTextTarget,
} from "@/lib/module-text";
import {
  cellText,
  setCellText,
  insertTableRow,
  insertTableColumn,
  deleteTableColumn,
  pasteTableCells,
  tableTSV,
  type TableData,
  type Cell,
} from "@/lib/table-editing";

export default function TableModule({
  data,
  readOnly,
  onChange,
}: {
  data: TableData;
  readOnly: boolean;
  onChange: (data: TableData) => void;
}) {
  const [menu, setMenu] = useState<
    (Cell & { x: number; y: number; start: number; end: number }) | null
  >(null);
  const [error, setError] = useState("");
  const [textTarget, setTextTarget] = useState<ModuleTextTarget | null>(null);
  const current = useRef(data);
  current.current = data;
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<Cell | null>(null);
  const writable = useRef(!readOnly);
  writable.current = !readOnly;
  const commit = (next: TableData) => {
    if (writable.current) {
      setError("");
      onChange(next);
    }
  };
  const open = (event: React.MouseEvent | React.KeyboardEvent, cell: Cell) => {
    event.preventDefault();
    event.stopPropagation();
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    const textField = moduleField(event.target);
    setTextTarget(
      textField
        ? "key" in event
          ? captureModuleText(textField, true)
          : moduleTextAtPoint(textField, event.clientX, event.clientY)
        : null,
    );
    const bounds = event.currentTarget.getBoundingClientRect();
    const keyboard = "key" in event;
    focus.current = cell;
    setMenu({
      ...cell,
      x: keyboard ? bounds.left + 10 : event.clientX,
      y: keyboard ? bounds.bottom : event.clientY,
      start: input.selectionStart ?? 0,
      end: input.selectionEnd ?? 0,
    });
  };
  const handlers = (cell: Cell) => ({
    onContextMenu: (event: React.MouseEvent) => open(event, cell),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      )
        open(event, cell);
    },
  });
  const clipboard = async (
    action: "copy" | "cut" | "paste" | "row" | "column" | "table",
  ) => {
    if (!menu) return;
    const snapshot = current.current;
    const old = cellText(snapshot, menu);
    const selected = menu.end > menu.start;
    try {
      if (action === "paste") {
        const text = await navigator.clipboard.readText();
        if (current.current !== snapshot)
          throw Error(
            "The table changed while reading the clipboard. Paste again.",
          );
        commit(
          /[\t\r\n]/.test(text)
            ? pasteTableCells(snapshot, menu, text)
            : setCellText(
                snapshot,
                menu,
                selected
                  ? old.slice(0, menu.start) + text + old.slice(menu.end)
                  : text,
              ),
        );
      } else {
        const text =
          action === "row"
            ? tableTSV([
                menu.row < 0 ? snapshot.headers : snapshot.rows[menu.row],
              ])
            : action === "column"
              ? tableTSV(
                  [snapshot.headers, ...snapshot.rows].map((row) => [
                    row[menu.column],
                  ]),
                )
              : action === "table"
                ? tableTSV([snapshot.headers, ...snapshot.rows])
                : selected
                  ? old.slice(menu.start, menu.end)
                  : old;
        await navigator.clipboard.writeText(text);
        if (action === "cut") {
          if (current.current !== snapshot)
            throw Error(
              "The table changed. Text was copied, but nothing was cut.",
            );
          commit(
            setCellText(
              snapshot,
              menu,
              selected ? old.slice(0, menu.start) + old.slice(menu.end) : "",
            ),
          );
        }
      }
    } catch (e) {
      setError(
        e instanceof Error &&
          !["NotAllowedError", "SecurityError", "TypeError"].includes(e.name)
          ? e.message
          : "Clipboard access is unavailable. Use Ctrl/Cmd+C, X or V in the cell.",
      );
    }
  };
  const perform = (action: () => TableData, target?: Cell) => {
    try {
      commit(action());
      if (target) focus.current = target;
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const restoreFocus = () => {
    const cell = focus.current;
    if (!cell) return;
    const row = Math.min(cell.row, current.current.rows.length - 1);
    const column = Math.min(cell.column, current.current.headers.length - 1);
    root.current
      ?.querySelector<HTMLElement>(
        `[data-table-row="${row}"][data-table-column="${column}"]`,
      )
      ?.focus({ preventScroll: true });
  };
  return (
    <div ref={root}>
      <div className="module-table-scroll">
        <table className="module-table">
          <thead>
            <tr>
              {data.headers.map((h, c) => (
                <th key={c} {...handlers({ row: -1, column: c })}>
                  {readOnly ? (
                    <ModuleText text={h} />
                  ) : (
                    <input
                      data-table-row={-1}
                      data-table-column={c}
                      aria-label={`Column ${c + 1} heading`}
                      maxLength={20000}
                      value={h}
                      onChange={(e) =>
                        commit(
                          setCellText(
                            data,
                            { row: -1, column: c },
                            e.target.value,
                          ),
                        )
                      }
                    />
                  )}
                </th>
              ))}
              {!readOnly && <th aria-label="Row actions" />}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, r) => (
              <tr key={r}>
                {row.map((value, c) => (
                  <td key={c} {...handlers({ row: r, column: c })}>
                    {readOnly ? (
                      <ModuleText text={value} />
                    ) : (
                      <textarea
                        data-table-row={r}
                        data-table-column={c}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        maxLength={20000}
                        value={value}
                        onChange={(e) =>
                          commit(
                            setCellText(
                              data,
                              { row: r, column: c },
                              e.target.value,
                            ),
                          )
                        }
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text/plain");
                          if (text.includes("\t")) {
                            e.preventDefault();
                            perform(() =>
                              pasteTableCells(
                                data,
                                { row: r, column: c },
                                text,
                              ),
                            );
                          }
                        }}
                      />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td>
                    <button
                      aria-label={`Delete row ${r + 1}`}
                      onClick={() =>
                        commit({
                          ...data,
                          rows: data.rows.filter((_, i) => i !== r),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="module-controls">
          <button
            disabled={data.rows.length >= 100}
            onClick={() =>
              perform(() => insertTableRow(data, data.rows.length))
            }
          >
            <Plus size={14} />
            Add row
          </button>
          <button
            disabled={data.headers.length >= 12}
            onClick={() =>
              perform(() => insertTableColumn(data, data.headers.length))
            }
          >
            <Plus size={14} />
            Add column
          </button>
          <small>Right-click a cell for table actions.</small>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
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
            aria-label="Table actions"
            align="start"
            sideOffset={0}
            collisionPadding={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              restoreFocus();
            }}
          >
            {menu && (
              <>
                {!readOnly && textTarget && (
                  <>
                    <ModuleTextActions
                      target={textTarget}
                      onError={setError}
                      clipboard={false}
                      close={() => setMenu(null)}
                    />
                    <Dropdown.Separator className="menu-separator" />
                  </>
                )}
                {!readOnly && (
                  <>
                    <Dropdown.Item
                      className="menu-item"
                      disabled={menu.row < 0 || data.rows.length >= 100}
                      onSelect={() =>
                        perform(() => insertTableRow(data, menu.row))
                      }
                    >
                      <Plus size={14} />
                      New row above
                    </Dropdown.Item>
                    <Dropdown.Item
                      className="menu-item"
                      disabled={data.rows.length >= 100}
                      onSelect={() =>
                        perform(() => insertTableRow(data, menu.row + 1))
                      }
                    >
                      <Plus size={14} />
                      New row below
                    </Dropdown.Item>
                    <Dropdown.Item
                      className="menu-item"
                      disabled={data.headers.length >= 12}
                      onSelect={() =>
                        perform(() => insertTableColumn(data, menu.column))
                      }
                    >
                      <Plus size={14} />
                      New column left
                    </Dropdown.Item>
                    <Dropdown.Item
                      className="menu-item"
                      disabled={data.headers.length >= 12}
                      onSelect={() =>
                        perform(() => insertTableColumn(data, menu.column + 1))
                      }
                    >
                      <Plus size={14} />
                      New column right
                    </Dropdown.Item>
                    <Dropdown.Separator className="menu-separator" />
                    <Dropdown.Item
                      className="menu-item danger"
                      disabled={menu.row < 0}
                      onSelect={() =>
                        perform(() => ({
                          ...data,
                          rows: data.rows.filter((_, i) => i !== menu.row),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                      Delete row
                    </Dropdown.Item>
                    <Dropdown.Item
                      className="menu-item danger"
                      disabled={data.headers.length <= 1}
                      onSelect={() =>
                        perform(() => deleteTableColumn(data, menu.column))
                      }
                    >
                      <Trash2 size={14} />
                      Delete column
                    </Dropdown.Item>
                    <Dropdown.Separator className="menu-separator" />
                  </>
                )}
                <Dropdown.Item
                  className="menu-item"
                  onSelect={() => void clipboard("copy")}
                >
                  <Copy size={14} />
                  Copy
                </Dropdown.Item>
                {!readOnly && (
                  <>
                    <Dropdown.Item
                      className="menu-item"
                      onSelect={() => void clipboard("cut")}
                    >
                      <Scissors size={14} />
                      Cut
                    </Dropdown.Item>
                    <Dropdown.Item
                      className="menu-item"
                      onSelect={() => void clipboard("paste")}
                    >
                      <Clipboard size={14} />
                      Paste
                    </Dropdown.Item>
                    <Dropdown.Item
                      className="menu-item"
                      onSelect={() =>
                        perform(() => setCellText(data, menu, ""))
                      }
                    >
                      Clear cell
                    </Dropdown.Item>
                  </>
                )}
                <Dropdown.Separator className="menu-separator" />
                <Dropdown.Item
                  className="menu-item"
                  onSelect={() => void clipboard("row")}
                >
                  Copy row
                </Dropdown.Item>
                <Dropdown.Item
                  className="menu-item"
                  onSelect={() => void clipboard("column")}
                >
                  Copy column
                </Dropdown.Item>
                <Dropdown.Item
                  className="menu-item"
                  onSelect={() => void clipboard("table")}
                >
                  Copy table
                </Dropdown.Item>
              </>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
