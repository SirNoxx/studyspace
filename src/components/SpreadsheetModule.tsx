"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { IRange } from "@univerjs/core";
import { getPrimaryForRange, SetSelectionsOperation } from "@univerjs/sheets";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
} from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  createUniver,
  LocaleType,
  mergeLocales,
  CommandType,
} from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import CoreEnglish from "@univerjs/preset-sheets-core/locales/en-US";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import FilterEnglish from "@univerjs/preset-sheets-filter/locales/en-US";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import SortEnglish from "@univerjs/preset-sheets-sort/locales/en-US";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import FindEnglish from "@univerjs/preset-sheets-find-replace/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import {
  blankWorkbook,
  cellAddress,
  columnName,
  metadata,
  readableCell,
  validateSnapshot,
  validateFormula,
  SHEET_LIMITS,
  type WorkbookRecord,
  type WorkbookSnapshot,
  type SheetGroup,
} from "@/lib/spreadsheets/model";
import {
  initializeWorkbook,
  loadWorkbook,
  saveWorkbook,
  keepOriginal,
  workbookHistory,
  loadOriginal,
  saveRecovery,
  loadRecovery,
  clearRecovery,
} from "@/lib/spreadsheets/store";
import {
  readSharedWorkbook,
  writeSharedWorkbook,
  type SharedWorkbookTarget,
} from "@/lib/spreadsheets/shared-store";
import { mergeWorkbook } from "@/lib/spreadsheets/concurrency";
import { formatTextRuns } from "@/lib/spreadsheets/rich-text";
import { spreadsheetMetric } from "@/lib/spreadsheets/metrics";
import {
  sharedWorkbookContent,
  workbookView,
} from "@/lib/spreadsheets/shared-view";
import type { ImportPreview } from "@/lib/spreadsheets/exchange";
import type { ModuleData } from "@/lib/modules";

type SheetModuleData = Extract<ModuleData, { kind: "spreadsheet" }>;
type Instance = ReturnType<typeof createUniver>;
type Book = ReturnType<Instance["univerAPI"]["createWorkbook"]>;
function download(data: BlobPart, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function borderCss(
  border: import("@univerjs/core").IBorderStyleData | undefined,
) {
  return border
    ? `${border.s >= 8 ? 2 : 1}px ${border.s === 7 ? "double" : border.s === 3 ? "dotted" : border.s >= 4 && border.s <= 6 ? "dashed" : "solid"} ${border.cl?.rgb ?? "#888"}`
    : undefined;
}

export default function SpreadsheetModule({
  data,
  title,
  readOnly: requestedReadOnly,
  onChange,
}: {
  data: SheetModuleData;
  title: string;
  readOnly: boolean;
  onChange: (data: SheetModuleData) => void;
}) {
  const readOnly =
    requestedReadOnly ||
    process.env.NEXT_PUBLIC_SPREADSHEETS_READONLY === "true";
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLDivElement>(null);
  const engine = useRef<Instance | null>(null),
    book = useRef<Book | null>(null),
    record = useRef<WorkbookRecord | null>(null);
  const engineShortcuts = useRef<ReturnType<
    Instance["univerAPI"]["getShortcut"]
  > | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const queue = useRef(Promise.resolve()),
    blocked = useRef(false),
    disposed = useRef(false);
  const [snapshot, setSnapshot] = useState<WorkbookSnapshot | null>(null);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("Loading spreadsheet…");
  const [accessible, setAccessible] = useState(true),
    [expanded, setExpanded] = useState(false);
  const accessibleMode = useRef(accessible);
  accessibleMode.current = accessible;
  useEffect(() => {
    const shortcuts = engineShortcuts.current;
    if (accessible) shortcuts?.disableShortcut();
    else shortcuts?.enableShortcut();
  }, [accessible]);
  const [address, setAddress] = useState("A1"),
    [value, setValue] = useState(""),
    [activeSheet, setActiveSheet] = useState("");
  const [location, setLocation] = useState({ row: 0, column: 0 });
  const [selectedRanges, setSelectedRanges] = useState<IRange[]>([]);
  const selectionAnchor = useRef<{
    sheet: string;
    row: number;
    column: number;
  } | null>(null);
  const [gridOrigin, setGridOrigin] = useState({ row: 0, column: 0 });
  const [groupName, setGroupName] = useState("Study group"),
    [label, setLabel] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null),
    [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [history, setHistory] = useState<WorkbookRecord[] | null>(null);
  const worker = useRef<Worker | null>(null),
    original = useRef<File | null>(null);
  const [busy, setBusy] = useState(false),
    [delimiter, setDelimiter] = useState(","),
    [formulas, setFormulas] = useState(true);
  const editor = useRef<HTMLTextAreaElement>(null);
  const cellEditor = useRef<HTMLTextAreaElement>(null);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    column: number;
  } | null>(null);
  const inlineEdit = useRef<{
    row: number;
    column: number;
    sheet: string;
    original: string;
    value: string;
  } | null>(null);
  useLayoutEffect(() => {
    if (!editingCell || !cellEditor.current) return;
    cellEditor.current.focus();
    const end = cellEditor.current.value.length;
    cellEditor.current.setSelectionRange(end, end);
  }, [editingCell]);
  const draft = useRef<{
    address: string;
    sheet: string;
    value: string;
  } | null>(null);
  const pendingSaves = useRef(0);
  const batching = useRef(false),
    batchDirty = useRef(false),
    refreshFrame = useRef(0);
  const shared = useRef<SharedWorkbookTarget | null>(null);
  const queuedBase = useRef<WorkbookSnapshot | null>(null);
  const [recovery, setRecovery] = useState<WorkbookRecord | null>(null);
  const [remoteReadOnly, setRemoteReadOnly] = useState(false);
  const remotePermission = useRef(true);
  const groupView = useRef<Record<string, boolean>>({}),
    viewChange = useRef(false);
  const cancelWorker = useRef<(() => void) | null>(null);
  const [findText, setFindText] = useState(""),
    [replacement, setReplacement] = useState("");
  const [encoding, setEncoding] = useState("utf-8");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
      "landscape",
    ),
    [repeatHeader, setRepeatHeader] = useState(false);
  const [context, setContext] = useState(false);
  const [menuPoint, setMenuPoint] = useState({ x: 0, y: 0 });
  const [toolsPanel, setToolsPanel] = useState("");
  const toolsPopup = useRef<HTMLElement>(null);
  const toolsTrigger = useRef<HTMLButtonElement | null>(null);
  const toolsId = useId();
  useEffect(() => {
    const popup = toolsPopup.current,
      trigger = toolsTrigger.current;
    if (!toolsPanel || !popup || !trigger) return;
    popup.showPopover();
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upward = below < 200 && above > below;
      popup.style.maxHeight = `${Math.max(80, Math.min(480, upward ? above : below))}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${upward ? Math.max(8, rect.top - popup.offsetHeight - 4) : rect.bottom + 4}px`;
    };
    position();
    const controls = () =>
      Array.from(
        popup.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary",
        ),
      ).filter((el) => el.getClientRects().length > 0);
    const focusFrame = requestAnimationFrame(() =>
      controls()[0]?.focus({ preventScroll: true }),
    );
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      popup.hidePopover();
      setToolsPanel("");
      requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    };
    document.addEventListener("keydown", escape, true);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popup.contains(target) &&
        !host.current?.querySelector(".sheet-menu-bar")?.contains(target)
      )
        setToolsPanel("");
    };
    const scroll = (event: Event) => {
      if (!popup.contains(event.target as Node)) position();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", scroll, true);
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", escape, true);
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", scroll, true);
      if (popup.matches(":popover-open")) popup.hidePopover();
    };
  }, [toolsPanel]);
  const [uiScale, setUiScale] = useState(100);
  const view = snapshot?.sheets[activeSheet];
  const cellStyle = view?.cellData[location.row]?.[location.column]?.s;
  const selectedStyle =
    typeof cellStyle === "string" ? snapshot?.styles[cellStyle] : cellStyle;
  const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);
  useEffect(() => {
    setFontSizeDraft(null);
  }, [activeSheet, address, selectedStyle?.fs]);

  const writable =
    !readOnly && !remoteReadOnly && !!record.current && !blocked.current;
  const savedMessage = () =>
    shared.current ? "Synced with collaborators" : "Saved on this device";
  const filename = title || "Spreadsheet";

  const refresh = () => {
    const current = book.current;
    if (!current) return;
    const s = current.getActiveSheet(),
      range = current.getActiveRange() ?? s.getRange("A1");
    const state = current.save() as WorkbookSnapshot;
    setSnapshot(state);
    setActiveSheet(s.getSheetId());
    setAddress(range.getA1Notation());
    const selection = s.getSelection();
    const primary = selection?.getCurrentCell();
    setSelectedRanges(
      selection?.getActiveRangeList().map((r) => r.getRange()) ?? [
        range.getRange(),
      ],
    );
    const row = primary?.actualRow ?? range.getRow(),
      column = primary?.actualColumn ?? range.getColumn();
    setLocation({ row, column });
    const cell = state.sheets[s.getSheetId()].cellData[row]?.[column];
    if (inlineEdit.current) setValue(inlineEdit.current.value);
    else if (
      draft.current?.sheet === s.getSheetId() &&
      draft.current.address === range.getA1Notation()
    )
      setValue(draft.current.value);
    else {
      draft.current = null;
      setValue(cell?.f ?? readableCell(cell));
    }
  };
  const persist = () => {
    if (viewChange.current) return;
    if (batching.current) {
      batchDirty.current = true;
      return;
    }
    if (
      readOnly ||
      !remotePermission.current ||
      !book.current ||
      !record.current ||
      blocked.current
    )
      return;
    const raw = book.current.save() as WorkbookSnapshot;
    const current = shared.current
      ? sharedWorkbookContent(raw)
      : structuredClone(raw);
    const base = queuedBase.current ?? record.current.snapshot;
    queuedBase.current = current;
    setStatus(
      shared.current ? "Syncing spreadsheet…" : "Saving on this device…",
    );
    pendingSaves.current++;
    queue.current = queue.current.then(async () => {
      if (blocked.current || !record.current) return;
      const started = performance.now();
      try {
        await saveRecovery({ ...record.current, snapshot: current });
        record.current = shared.current
          ? await writeSharedWorkbook(shared.current, {
              ...record.current,
              snapshot: mergeWorkbook(base, current, record.current.snapshot),
            })
          : await saveWorkbook(
              { ...record.current, snapshot: current },
              record.current.revision,
            );
        pendingSaves.current--;
        spreadsheetMetric("save", "ok", performance.now() - started);
        if (!pendingSaves.current) {
          await clearRecovery(record.current.scope, record.current.id);
          if (!disposed.current) {
            setStatus(savedMessage());
            if (shared.current && !draft.current)
              mount(record.current.snapshot);
          }
        }
      } catch (e) {
        spreadsheetMetric("save", "failed", performance.now() - started);
        blocked.current = true;
        pendingSaves.current = 0;
        if (!disposed.current) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not save. Export a backup to retain your edits.",
          );
          setStatus("Not saved — export a backup");
        }
      }
    });
  };
  const subscriptions = useRef<{ dispose(): void }[]>([]);
  const mount = (state: WorkbookSnapshot) => {
    validateSnapshot(state);
    selectionAnchor.current = null;
    const previousSheet = book.current?.getActiveSheet().getSheetId(),
      previousRange = book.current?.getActiveRange()?.getA1Notation();
    subscriptions.current.forEach((s) => s.dispose());
    subscriptions.current = [];
    engine.current?.univer.dispose();
    if (!canvas.current) return;
    const instance = createUniver({
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(
          CoreEnglish,
          FilterEnglish,
          SortEnglish,
          FindEnglish,
        ),
      },
      presets: [
        UniverSheetsCorePreset({
          container: canvas.current,
          disableAutoFocus: true,
        }),
        UniverSheetsFilterPreset(),
        UniverSheetsSortPreset(),
        UniverSheetsFindReplacePreset(),
      ],
    });
    engine.current = instance;
    // The canvas engine installs capture-phase window shortcuts. In DOM mode
    // those must not steal typing, Escape or Tab from our accessible controls.
    engineShortcuts.current = instance.univerAPI.getShortcut();
    if (accessibleMode.current) engineShortcuts.current.disableShortcut();
    subscriptions.current.push(
      instance.univerAPI.addEvent(
        instance.univerAPI.Event.BeforeCommandExecute,
        (event) => {
          if (
            accessibleMode.current &&
            event.id === "sheet.operation.set-cell-edit-visible" &&
            (event.params as { visible?: boolean } | undefined)?.visible
          )
            event.cancel = true;
        },
      ),
    );
    book.current = instance.univerAPI.createWorkbook(
      shared.current
        ? workbookView(state, groupView.current)
        : structuredClone(state),
    );
    if (previousSheet && state.sheets[previousSheet]) {
      book.current.setActiveSheet(previousSheet);
      if (previousRange) {
        try {
          book.current.setActiveRange(
            book.current.getActiveSheet().getRange(previousRange),
          );
        } catch {}
      }
    }
    queuedBase.current = structuredClone(state);
    book.current.setEditable(!readOnly && remotePermission.current);
    subscriptions.current.push(book.current.onSelectionChange(refresh));
    subscriptions.current.push(
      book.current.onCommandExecuted((command) => {
        if (command.type === CommandType.MUTATION) {
          // Persist at each mutation, not at a timer that can be lost on unmount.
          persist();
          cancelAnimationFrame(refreshFrame.current);
          refreshFrame.current = requestAnimationFrame(() => {
            if (!disposed.current) refresh();
          });
        }
      }),
    );
    refresh();
  };
  useEffect(() => {
    disposed.current = false;
    let cancelled = false;
    const parent = host.current?.closest<HTMLElement>("[data-workbook-scope]");
    if (!parent) {
      setStatus(
        "Open this workbook from its original private note, or import its spreadsheet backup.",
      );
      return;
    }
    const scope = parent.dataset.workbookScope!,
      noteId = parent.dataset.noteId!;
    if (parent.dataset.workbookCollection)
      shared.current = {
        scope,
        note: noteId,
        collection: parent.dataset.workbookCollection,
      };
    const open = async () => {
      const started = performance.now();
      let stored: WorkbookRecord | undefined;
      if (shared.current) {
        const remote = await readSharedWorkbook(
          shared.current,
          data.workbookId,
        );
        setRemoteReadOnly(remote.readOnly);
        remotePermission.current = !remote.readOnly;
        stored = remote.record;
        if (
          stored &&
          stored.noteId !== noteId &&
          !readOnly &&
          !remote.readOnly
        ) {
          const copyId = crypto.randomUUID();
          stored = await writeSharedWorkbook(shared.current, {
            ...stored,
            id: copyId,
            noteId,
            revision: 0,
            snapshot: { ...stored.snapshot, id: copyId },
          });
        }
        if (!stored && !readOnly && !remote.readOnly)
          stored = await writeSharedWorkbook(shared.current, {
            version: 1,
            engineVersion: "0.25.1",
            scope,
            noteId,
            id: data.workbookId,
            revision: 0,
            updatedAt: "",
            snapshot: blankWorkbook(data.workbookId, title, data.seed),
          });
      } else
        stored = readOnly
          ? await loadWorkbook(scope, data.workbookId)
          : await initializeWorkbook(
              scope,
              data.workbookId,
              noteId,
              blankWorkbook(data.workbookId, title, data.seed),
            );
      if (cancelled) return;
      if (!stored) {
        setStatus(
          "This workbook is not available on this device. Import its spreadsheet backup.",
        );
        return;
      }
      record.current = stored;
      if (shared.current) {
        try {
          groupView.current = JSON.parse(
            localStorage.getItem(
              `studyspace:sheet-view:${scope}:${stored.id}`,
            ) ?? "{}",
          );
        } catch {
          groupView.current = {};
        }
      }
      const recovered = await loadRecovery(scope, data.workbookId);
      if (!cancelled && recovered) setRecovery(recovered);
      if (stored.id !== data.workbookId || data.seed)
        callback.current({
          ...data,
          seed: undefined,
          workbookId: stored.id,
        });
      mount(stored.snapshot);
      spreadsheetMetric("open", "ok", performance.now() - started);
      setStatus(readOnly ? "Read-only spreadsheet" : savedMessage());
    };
    void open().catch((e) => {
      if (!cancelled) {
        spreadsheetMetric("open", "failed");
        setError(e.message);
        setStatus("Could not open spreadsheet");
      }
    });
    let polling = false;
    const poll = setInterval(async () => {
      if (
        !shared.current ||
        !record.current ||
        polling ||
        pendingSaves.current ||
        draft.current ||
        blocked.current
      )
        return;
      polling = true;
      try {
        const remote = await readSharedWorkbook(
          shared.current,
          record.current.id,
          record.current.revision,
        );
        if (cancelled) return;
        setRemoteReadOnly(remote.readOnly);
        remotePermission.current = !remote.readOnly;
        if (remote.readOnly) book.current?.setEditable(false);
        if (remote.record && remote.record.revision > record.current.revision) {
          record.current = remote.record;
          mount(remote.record.snapshot);
          setStatus(savedMessage());
        }
      } catch (e) {
        if (!cancelled) {
          if (
            (e as { status?: number }).status === 403 ||
            (e as { status?: number }).status === 401
          ) {
            setRemoteReadOnly(true);
            remotePermission.current = false;
            book.current?.setEditable(false);
          }
          setStatus("Shared connection interrupted — edits retained locally");
          setError((e as Error).message);
        }
      } finally {
        polling = false;
      }
    }, 1500);
    return () => {
      clearInterval(poll);
      cancelled = true;
      disposed.current = true;
      cancelWorker.current?.();
      subscriptions.current.forEach((s) => s.dispose());
      engine.current?.univer.dispose();
      cancelAnimationFrame(refreshFrame.current);
      book.current = null;
    };
    // The engine owns its document until this module is unmounted. Parent note
    // renders must not recreate it and interrupt typing.
  }, []);
  const act = (action: () => void) => {
    if (!writable) return false;
    batching.current = true;
    try {
      setError("");
      action();
      refresh();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
      return false;
    } finally {
      batching.current = false;
      if (batchDirty.current) {
        batchDirty.current = false;
        persist();
      }
    }
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pendingSaves.current || draft.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const range = () => {
    if (
      !book.current ||
      !/^(?:[A-Z]+[1-9]\d*)(?::[A-Z]+[1-9]\d*)?$/i.test(address.trim())
    )
      throw Error("Enter a cell or range such as B2 or B2:D8.");
    const result = book.current
      .getActiveSheet()
      .getRange(address.trim().toUpperCase());
    const bounds = result.getRange();
    if (
      bounds.endRow >= (view?.rowCount ?? 0) ||
      bounds.endColumn >= (view?.columnCount ?? 0)
    )
      throw Error(
        "That range is outside this worksheet. Add rows or columns first.",
      );
    if (
      (bounds.endRow - bounds.startRow + 1) *
        (bounds.endColumn - bounds.startColumn + 1) >
      SHEET_LIMITS.cells
    )
      throw Error("Select at most 100,000 cells.");
    return result;
  };
  const select = (
    row: number,
    column: number,
    modifiers: {
      shiftKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
    } = {},
  ) => {
    const merged = view?.mergeData?.find(
      (m) =>
        row >= m.startRow &&
        row <= m.endRow &&
        column >= m.startColumn &&
        column <= m.endColumn,
    );
    if (merged) {
      row = merged.startRow;
      column = merged.startColumn;
    }
    const sheet = book.current?.getActiveSheet();
    if (
      !sheet ||
      row < 0 ||
      column < 0 ||
      row >= (view?.rowCount ?? 0) ||
      column >= (view?.columnCount ?? 0)
    )
      return;
    const cell = merged ?? {
      startRow: row,
      endRow: row,
      startColumn: column,
      endColumn: column,
    };
    const current = sheet.getSelection();
    const primary = current?.getCurrentCell();
    let anchor = selectionAnchor.current;
    if (!anchor || anchor.sheet !== sheet.getSheetId())
      anchor = {
        sheet: sheet.getSheetId(),
        row: primary?.actualRow ?? row,
        column: primary?.actualColumn ?? column,
      };
    let ranges: IRange[];
    if (modifiers.shiftKey) {
      const anchorMerge = view?.mergeData?.find(
        (m) =>
          anchor!.row >= m.startRow &&
          anchor!.row <= m.endRow &&
          anchor!.column >= m.startColumn &&
          anchor!.column <= m.endColumn,
      );
      const bounds = {
        startRow: Math.min(anchorMerge?.startRow ?? anchor.row, cell.startRow),
        endRow: Math.max(anchorMerge?.endRow ?? anchor.row, cell.endRow),
        startColumn: Math.min(
          anchorMerge?.startColumn ?? anchor.column,
          cell.startColumn,
        ),
        endColumn: Math.max(
          anchorMerge?.endColumn ?? anchor.column,
          cell.endColumn,
        ),
      };
      // Include entire merged cells touched by the rectangular selection.
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of view?.mergeData ?? []) {
          if (
            m.endRow < bounds.startRow ||
            m.startRow > bounds.endRow ||
            m.endColumn < bounds.startColumn ||
            m.startColumn > bounds.endColumn
          )
            continue;
          const next = {
            startRow: Math.min(bounds.startRow, m.startRow),
            endRow: Math.max(bounds.endRow, m.endRow),
            startColumn: Math.min(bounds.startColumn, m.startColumn),
            endColumn: Math.max(bounds.endColumn, m.endColumn),
          };
          if (JSON.stringify(next) !== JSON.stringify(bounds)) {
            Object.assign(bounds, next);
            changed = true;
          }
        }
      }
      ranges = [bounds];
    } else if (modifiers.ctrlKey || modifiers.metaKey) {
      ranges = current?.getActiveRangeList().map((r) => r.getRange()) ?? [];
      const existing = ranges.findIndex(
        (r) =>
          row >= r.startRow &&
          row <= r.endRow &&
          column >= r.startColumn &&
          column <= r.endColumn,
      );
      if (existing >= 0) ranges.push(...ranges.splice(existing, 1));
      else ranges.push(cell);
      anchor = { sheet: sheet.getSheetId(), row, column };
    } else {
      ranges = [cell];
      anchor = { sheet: sheet.getSheetId(), row, column };
    }
    selectionAnchor.current = anchor;
    engine.current!.univerAPI.syncExecuteCommand(SetSelectionsOperation.id, {
      unitId: book.current!.getId(),
      subUnitId: sheet.getSheetId(),
      reveal: false,
      selections: ranges.map((range, i) => ({
        range,
        primary:
          i === ranges.length - 1
            ? getPrimaryForRange(cell, sheet.getSheet())
            : null,
        style: null,
      })),
    });
    refresh();
  };
  const revealCell = (row: number, column: number) =>
    setGridOrigin((origin) => ({
      row:
        row < origin.row ? row : row >= origin.row + 12 ? row - 11 : origin.row,
      column:
        column < origin.column
          ? column
          : column >= origin.column + 6
            ? column - 5
            : origin.column,
    }));
  const groups = view ? metadata(view).groups : [];
  const addGroup = (axis: "row" | "column") =>
    act(() => {
      const sheet = book.current!.getActiveSheet(),
        selected = range().getRange();
      const from = axis === "row" ? selected.startRow : selected.startColumn,
        to = axis === "row" ? selected.endRow : selected.endColumn;
      if (to - from > 1000)
        throw Error("Group up to 1,001 rows or columns at a time.");
      const members: string[] = [];
      for (let at = from; at <= to; at++) {
        const meta =
          axis === "row"
            ? sheet.getRowCustomMetadata(at)
            : sheet.getColumnCustomMetadata(at);
        const id = String(meta?.studyspaceId ?? crypto.randomUUID());
        members.push(id);
        if (!meta?.studyspaceId) {
          const axisData = axis === "row" ? view?.rowData : view?.columnData;
          const next = {
            ...meta,
            studyspaceId: id,
            studyspaceManualHidden: axisData?.[at]?.hd === 1,
          };
          axis === "row"
            ? sheet.setRowCustom({ [at]: next })
            : sheet.setColumnCustom({ [at]: next });
        }
      }
      for (const group of groups.filter((g) => g.axis === axis)) {
        const common = group.members.filter((id) =>
          members.includes(id),
        ).length;
        if (common && common < group.members.length && common < members.length)
          throw Error("Groups may be nested, but cannot partially overlap.");
      }
      const next: SheetGroup = {
        id: crypto.randomUUID(),
        axis,
        name: groupName.trim() || "Study group",
        members,
        collapsed: false,
      };
      sheet.setCustomMetadata({
        ...sheet.getCustomMetadata(),
        studyspace: { groups: [...groups, next] },
      });
      persist();
      refresh();
    });
  const applyGroups = (next: SheetGroup[]) => {
    const action = () => {
      const sheet = book.current!.getActiveSheet(),
        state = book.current!.save().sheets[activeSheet];
      for (const axis of ["row", "column"] as const) {
        const show: number[] = [],
          hide: number[] = [],
          axisData = axis === "row" ? state.rowData : state.columnData;
        for (const [at, entry] of Object.entries(axisData ?? {})) {
          const identity = String(entry.custom?.studyspaceId ?? "");
          if (
            !groups.some((g) => g.axis === axis && g.members.includes(identity))
          )
            continue;
          const hidden =
            !!entry.custom?.studyspaceManualHidden ||
            next.some(
              (g) =>
                g.axis === axis && g.collapsed && g.members.includes(identity),
            );
          if (hidden !== (entry.hd === 1)) (hidden ? hide : show).push(+at);
        }
        for (const [indices, hidden] of [
          [show, false],
          [hide, true],
        ] as const) {
          indices.sort((a, b) => a - b);
          for (let i = 0; i < indices.length; i++) {
            const start = indices[i];
            let end = start;
            while (indices[i + 1] === end + 1) end = indices[++i];
            if (axis === "row")
              hidden
                ? sheet.hideRows(start, end - start + 1)
                : sheet.showRows(start, end - start + 1);
            else
              hidden
                ? sheet.hideColumns(start, end - start + 1)
                : sheet.showColumns(start, end - start + 1);
          }
        }
      }
      sheet.setCustomMetadata({
        ...sheet.getCustomMetadata(),
        studyspace: { ...metadata(view!), groups: next },
      });
      const current = (book.current!.save() as WorkbookSnapshot).sheets[
          activeSheet
        ],
        selected = book.current!.getActiveRange();
      if (selected) {
        let row = selected.getRow(),
          column = selected.getColumn();
        if (current.rowData?.[row]?.hd === 1) {
          row = 0;
          while (row < current.rowCount && current.rowData?.[row]?.hd === 1)
            row++;
        }
        if (current.columnData?.[column]?.hd === 1) {
          column = 0;
          while (
            column < current.columnCount &&
            current.columnData?.[column]?.hd === 1
          )
            column++;
        }
        if (row < current.rowCount && column < current.columnCount)
          book.current!.setActiveRange(sheet.getRange(row, column));
      }
      persist();
      refresh();
    };
    const structure = (list: SheetGroup[]) =>
      list.map(({ collapsed, ...group }) => group);
    if (
      shared.current &&
      JSON.stringify(structure(groups)) === JSON.stringify(structure(next))
    ) {
      viewChange.current = true;
      try {
        book.current?.setEditable(true);
        action();
        for (const group of next) groupView.current[group.id] = group.collapsed;
        localStorage.setItem(
          `studyspace:sheet-view:${record.current!.scope}:${record.current!.id}`,
          JSON.stringify(groupView.current),
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        viewChange.current = false;
        book.current?.setEditable(!readOnly && remotePermission.current);
      }
    } else act(action);
  };
  const changeGroup = (id: string, remove = false) =>
    applyGroups(
      groups
        .map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g))
        .filter((g) => !remove || g.id !== id),
    );
  const convert = (payload: unknown): Promise<unknown> => {
    if (process.env.NEXT_PUBLIC_SPREADSHEET_CONVERSION_ENABLED === "false")
      return Promise.reject(
        Error(
          "Spreadsheet conversion is temporarily disabled. Native backup export remains available.",
        ),
      );
    cancelWorker.current?.();
    const current = new Worker(
      new URL("../lib/spreadsheets/exchange.worker.ts", import.meta.url),
    );
    worker.current = current;
    setBusy(true);
    return new Promise((resolve, reject) => {
      cancelWorker.current = () => {
        current.terminate();
        worker.current = null;
        cancelWorker.current = null;
        if (!disposed.current) setBusy(false);
        reject(Error("Conversion cancelled. Your workbook is unchanged."));
      };
      current.onmessage = (e) => {
        current.terminate();
        worker.current = null;
        cancelWorker.current = null;
        setBusy(false);
        e.data.error ? reject(Error(e.data.error)) : resolve(e.data.result);
      };
      current.onerror = () => {
        current.terminate();
        worker.current = null;
        cancelWorker.current = null;
        setBusy(false);
        reject(
          Error(
            "The spreadsheet converter stopped. Your current workbook is unchanged.",
          ),
        );
      };
      current.postMessage(payload);
    });
  };
  const importFile = async (file: File) => {
    const started = performance.now();
    try {
      setError("");
      original.current = file;
      const result = (await convert({
        action: "import",
        bytes: await file.arrayBuffer(),
        name: file.name,
        options: {
          delimiter: /\.tsv$/i.test(file.name) ? "\t" : delimiter,
          formulas,
          encoding,
        },
      })) as ImportPreview;
      setPreview(result);
      setSelectedSheets(result.snapshot.sheetOrder);
      spreadsheetMetric("import", "ok", performance.now() - started);
    } catch (e) {
      spreadsheetMetric("import", "failed", performance.now() - started);
      setError((e as Error).message);
    }
  };
  const applyImport = async () => {
    if (!preview || !record.current || !selectedSheets.length || !writable)
      return;
    try {
      await queue.current;
      const imported = {
        ...preview.snapshot,
        id: record.current.id,
        sheetOrder: selectedSheets,
        sheets: Object.fromEntries(
          selectedSheets.map((id) => [id, preview.snapshot.sheets[id]]),
        ),
      };
      validateSnapshot(imported);
      if (original.current)
        await keepOriginal(
          record.current.scope,
          record.current.id,
          original.current,
        );
      await saveRecovery({ ...record.current, snapshot: imported });
      record.current = shared.current
        ? await writeSharedWorkbook(shared.current, {
            ...record.current,
            snapshot: imported,
          })
        : await saveWorkbook(
            { ...record.current, snapshot: imported },
            record.current.revision,
          );
      await clearRecovery(record.current.scope, record.current.id);
      setPreview(null);
      mount(imported);
      setStatus(savedMessage());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportFile = async (format: "xlsx" | "json" | "csv" | "tsv") => {
    try {
      const state =
        (book.current?.save() as WorkbookSnapshot | undefined) ??
        snapshot ??
        record.current?.snapshot;
      if (!state) return;
      if (format === "json")
        download(
          JSON.stringify({ version: 1, workbookId: state.id, snapshot: state }),
          filename + ".studyspace-sheet.json",
        );
      else if (format === "xlsx")
        download(
          (await convert({ action: "export", snapshot: state })) as ArrayBuffer,
          filename + ".xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      else {
        const { exportDelimited } = await import("@/lib/spreadsheets/exchange");
        download(
          exportDelimited(state, activeSheet, format === "tsv" ? "\t" : ","),
          filename + "." + format,
          "text/plain",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const setStyle = (
    change: (
      selection: ReturnType<Book["getActiveSheet"]> extends never
        ? never
        : ReturnType<ReturnType<Book["getActiveSheet"]>["getRange"]>,
    ) => void,
  ) =>
    act(() => {
      const sheet = book.current!.getActiveSheet();
      const ranges = sheet.getSelection()?.getActiveRangeList() ?? [];
      const targets =
        book.current!.getActiveRange()?.getA1Notation() === address &&
        ranges.length
          ? ranges
          : [range()];
      for (const target of targets) change(target);
    });
  const setText = () =>
    act(() => {
      if (value.startsWith("=")) validateFormula(value);
      draft.current = null;
      if (value === "") {
        range().clear();
        return;
      }
      range().setValue(
        value.startsWith("=")
          ? { f: value }
          : /^-?(?:\d+\.?\d*|\.\d+)$/.test(value) && !/^0\d/.test(value)
            ? Number(value)
            : value,
      );
    });
  const startCellEdit = (row: number, column: number, replacement?: string) => {
    if (!writable || inlineEdit.current) return;
    select(row, column);
    const selected = book.current!.getActiveRange()!;
    row = selected.getRow();
    column = selected.getColumn();
    const sheet = book.current!.getActiveSheet().getSheetId();
    const cell = book.current!.save().sheets[sheet].cellData?.[row]?.[column];
    const original = cell?.f ?? readableCell(cell);
    inlineEdit.current = {
      row,
      column,
      sheet,
      original,
      value: replacement ?? original,
    };
    draft.current = {
      sheet,
      address: cellAddress(row, column),
      value: replacement ?? original,
    };
    setValue(draft.current.value);
    setEditingCell({ row, column });
    if (replacement !== undefined) setStatus("Editing cell — not saved yet");
  };
  const finishCellEdit = (commit: boolean, move?: [number, number]) => {
    const edit = inlineEdit.current;
    if (!edit) return true;
    const text = edit.value;
    if (commit && text !== edit.original) {
      const saved = act(() => {
        if (text.startsWith("=")) validateFormula(text);
        const target = book.current!.getSheetBySheetId(edit.sheet);
        if (!target) throw Error("This worksheet is no longer available.");
        if (text === "") {
          target.getRange(edit.row, edit.column).clear();
          return;
        }
        target
          .getRange(edit.row, edit.column)
          .setValue(
            text.startsWith("=")
              ? { f: text }
              : /^-?(?:\d+\.?\d*|\.\d+)$/.test(text) && !/^0\d/.test(text)
                ? Number(text)
                : text,
          );
      });
      if (!saved) {
        // Keep invalid formulas or rejected edits in place for correction.
        requestAnimationFrame(() => cellEditor.current?.focus());
        return false;
      }
    }
    inlineEdit.current = null;
    draft.current = null;
    setEditingCell(null);
    refresh();
    if (!commit) setError("");
    if (!commit || text === edit.original) setStatus(savedMessage());
    if (move && view) {
      const merged = view.mergeData?.find(
        (m) =>
          edit.row >= m.startRow &&
          edit.row <= m.endRow &&
          edit.column >= m.startColumn &&
          edit.column <= m.endColumn,
      );
      let row =
        (move[0] > 0 ? (merged?.endRow ?? edit.row) : edit.row) + move[0];
      let column =
        (move[1] > 0 ? (merged?.endColumn ?? edit.column) : edit.column) +
        move[1];
      if (column >= view.columnCount) {
        row++;
        column = 0;
      }
      if (column < 0) {
        row--;
        column = view.columnCount - 1;
      }
      while (row >= 0 && row < view.rowCount && view.rowData?.[row]?.hd === 1)
        row += move[0] || Math.sign(move[1]);
      while (
        column >= 0 &&
        column < view.columnCount &&
        view.columnData?.[column]?.hd === 1
      )
        column += move[1] || 1;
      select(row, column);
      revealCell(row, column);
    }
    if (move || !commit)
      requestAnimationFrame(() =>
        host.current?.querySelector<HTMLElement>('td[tabindex="0"]')?.focus(),
      );
    return true;
  };
  useEffect(() => {
    // Univer's hidden document input also focuses asynchronously after a
    // selection change, independently of its keyboard shortcut service.
    const preserveDOMFocus = (event: FocusEvent) => {
      const next = event.target;
      const previous = event.relatedTarget;
      if (
        accessibleMode.current &&
        next instanceof HTMLElement &&
        next.matches('[data-u-comp="editor"]') &&
        previous instanceof HTMLElement &&
        host.current?.contains(previous) &&
        !canvas.current?.contains(previous)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", preserveDOMFocus, true);
    return () =>
      document.removeEventListener("focusin", preserveDOMFocus, true);
  }, []);
  useEffect(() => {
    setGridOrigin({ row: 0, column: 0 });
  }, [activeSheet]);
  useEffect(() => {
    const root = host.current;
    if (!root || !accessible || !view) return;
    const wheel = (event: WheelEvent) => {
      if (
        !(event.target as HTMLElement).closest(".spreadsheet-accessible") ||
        !event.ctrlKey
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!finishCellEdit(true)) return;
      const horizontal =
        event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = horizontal && event.deltaX ? event.deltaX : event.deltaY;
      if (!delta) return;
      const step =
        Math.sign(delta) *
        Math.min(12, Math.max(1, Math.ceil(Math.abs(delta) / 100)));
      setGridOrigin((origin) => ({
        row: horizontal
          ? origin.row
          : Math.max(0, Math.min(view.rowCount - 12, origin.row + step)),
        column: horizontal
          ? Math.max(0, Math.min(view.columnCount - 6, origin.column + step))
          : origin.column,
      }));
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  });
  const pasteCells = async (text?: string) => {
    if (!writable) return;
    try {
      const { parseDelimited } = await import("@/lib/spreadsheets/exchange");
      const rows = parseDelimited(
        text ?? (await navigator.clipboard.readText()),
        "\t",
      );
      if (!rows.length) return;
      const r = range(),
        width = Math.max(...rows.map((row) => row.length));
      if (
        r.getRow() + rows.length > view!.rowCount ||
        r.getColumn() + width > view!.columnCount
      )
        throw Error("Paste exceeds this worksheet. Add rows or columns first.");
      const values = rows.map((row) =>
        Array.from({ length: width }, (_, c) => {
          const v = row[c] ?? "";
          if (v.startsWith("=")) {
            validateFormula(v);
            return { f: v };
          }
          return { v, t: 1 };
        }),
      );
      act(() =>
        book
          .current!.getActiveSheet()
          .getRange(r.getRow(), r.getColumn(), rows.length, width)
          .setValues(values),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copyCells = async (cut = false) => {
    try {
      const selections =
        book.current!.getActiveSheet().getSelection()?.getActiveRangeList() ??
        [];
      const targets =
        book.current!.getActiveRange()?.getA1Notation() === address &&
        selections.length
          ? selections
          : [range()];
      const text = targets
        .map((target) => {
          const r = target.getRange();
          return Array.from({ length: r.endRow - r.startRow + 1 }, (_, i) =>
            Array.from({ length: r.endColumn - r.startColumn + 1 }, (_, j) => {
              const s = readableCell(
                view!.cellData[r.startRow + i]?.[r.startColumn + j],
              );
              return /[\t\r\n"]/.test(s)
                ? '"' + s.replaceAll('"', '""') + '"'
                : s;
            }).join("\t"),
          ).join("\r\n");
        })
        .join("\r\n");
      await navigator.clipboard.writeText(text);
      if (cut)
        act(() => {
          for (const target of targets) target.clear();
        });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const findNext = (replace = false) =>
    act(() => {
      if (!findText) throw Error("Enter text to find.");
      const cells = Object.entries(view!.cellData)
        .flatMap(([r, row]) =>
          Object.entries(
            row as Record<string, import("@univerjs/core").ICellData>,
          )
            .filter(([, cell]) =>
              readableCell(cell)
                .toLocaleLowerCase()
                .includes(findText.toLocaleLowerCase()),
            )
            .map(([c]) => ({ r: +r, c: +c })),
        )
        .sort((a, b) => a.r - b.r || a.c - b.c);
      if (replace) {
        const cell = range();
        if (cell.getHeight() !== 1 || cell.getWidth() !== 1)
          throw Error("Select one cell to replace.");
        const source = view!.cellData[cell.getRow()]?.[cell.getColumn()];
        if (source?.f) throw Error("Edit formulas in the formula field.");
        const old = readableCell(source);
        cell.setValue({ v: old.replaceAll(findText, replacement), t: 1 });
      }
      const found =
        cells.find(
          (p) =>
            p.r > location.row ||
            (p.r === location.row && p.c > location.column),
        ) ?? cells[0];
      if (!found) throw Error("No matching cells.");
      select(found.r, found.c);
    });
  const partial = (style: "bold" | "italic") =>
    act(() => {
      const from = editor.current?.selectionStart ?? 0,
        to = editor.current?.selectionEnd ?? 0;
      if (from === to || value.startsWith("="))
        throw Error("Select part of a text value first.");
      range().setValue({
        v: value,
        p: {
          id: crypto.randomUUID(),
          body: {
            dataStream: value + "\r\n",
            paragraphs: [{ startIndex: value.length }],
            textRuns: formatTextRuns(
              value,
              view?.cellData[location.row]?.[location.column]?.p?.body
                ?.textRuns ?? [],
              from,
              to,
              style === "bold" ? { bl: 1 } : { it: 1 },
            ),
          },
          documentStyle: {},
        },
      });
    });
  const viewportRows = view
    ? Array.from(
        { length: Math.min(12, view.rowCount) },
        (_, i) => Math.max(0, Math.min(gridOrigin.row, view.rowCount - 12)) + i,
      ).filter(
        (r) =>
          view.rowData?.[r]?.hd !== 1 &&
          !book.current
            ?.getActiveSheet()
            .getFilter()
            ?.getFilteredOutRows()
            .includes(r),
      )
    : [];
  const viewportColumns = view
    ? Array.from(
        { length: Math.min(6, view.columnCount) },
        (_, i) =>
          Math.max(0, Math.min(gridOrigin.column, view.columnCount - 6)) + i,
      ).filter((c) => view.columnData?.[c]?.hd !== 1)
    : [];

  // Expanded mode retains the same engine and gives keyboard users an exit.
  useEffect(() => {
    const root = host.current;
    if (!root || !expanded) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    root.showPopover?.();
    root.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".sheet-inline-editor")) return;
      if (e.key === "Escape") {
        if (target.closest(".sheet-menu-panel")) return;
        e.preventDefault();
        setExpanded(false);
      }
      if (e.key === "Tab") {
        const controls = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    root.addEventListener("keydown", keydown);
    return () => {
      root.removeEventListener("keydown", keydown);
      if (root.matches(":popover-open")) root.hidePopover?.();
      previousFocus?.focus({ preventScroll: true });
    };
  }, [expanded]);
  return (
    <div
      ref={host}
      popover={expanded ? "manual" : undefined}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? "Expanded spreadsheet" : undefined}
      className={
        "spreadsheet-module" + (expanded ? " spreadsheet-expanded" : "")
      }
      onKeyDown={(e) => e.stopPropagation()}
      onFocusCapture={(e) => {
        if (!(e.target as HTMLElement).closest(".spreadsheet-engine"))
          engineShortcuts.current?.disableShortcut();
      }}
      onPointerDownCapture={(e) => {
        if (
          !accessible &&
          (e.target as HTMLElement).closest(".spreadsheet-engine")
        )
          engineShortcuts.current?.enableShortcut();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".sheet-inline-editor")) return;
        if ((e.target as HTMLElement).closest('[role="gridcell"]')) {
          e.preventDefault();
          setMenuPoint({ x: e.clientX, y: e.clientY });
          const td = (e.target as HTMLElement).closest<HTMLElement>(
            "[data-sheet-row]",
          );
          if (td && td.getAttribute("aria-selected") !== "true")
            select(Number(td.dataset.sheetRow), Number(td.dataset.sheetColumn));
          setContext(true);
        }
      }}
      onDrop={(e) => {
        if (!readOnly && e.dataTransfer.files.length) {
          e.preventDefault();
          void importFile(e.dataTransfer.files[0]);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
    >
      <div className="spreadsheet-status">
        <span role="status">{status}</span>
        <button type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Return to note" : "Expand spreadsheet"}
        </button>
      </div>
      {error && (
        <div role="alert" className="spreadsheet-error">
          {error}
          <button type="button" onClick={() => void exportFile("json")}>
            Export recovery copy
          </button>
          {blocked.current && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await exportFile("json");
                  await queue.current;
                  const current = shared.current
                    ? (
                        await readSharedWorkbook(
                          shared.current,
                          record.current!.id,
                        )
                      ).record
                    : await loadWorkbook(
                        record.current!.scope,
                        record.current!.id,
                      );
                  if (current) {
                    record.current = current;
                    blocked.current = false;
                    draft.current = null;
                    mount(current.snapshot);
                    setError("");
                    setStatus(savedMessage());
                  }
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Download edits and reload saved version
            </button>
          )}
        </div>
      )}
      {recovery && (
        <div role="status">
          A recovery copy from an interrupted save is available.{" "}
          <button
            type="button"
            onClick={() =>
              download(
                JSON.stringify({
                  version: 1,
                  workbookId: recovery.id,
                  snapshot: recovery.snapshot,
                }),
                filename + ".recovery.studyspace-sheet.json",
              )
            }
          >
            Download recovered edits
          </button>
          <button
            type="button"
            onClick={() => {
              void clearRecovery(recovery.scope, recovery.id);
              setRecovery(null);
            }}
          >
            Dismiss recovery copy
          </button>
        </div>
      )}
      {!snapshot && data.preview && (
        <div className="spreadsheet-accessible">
          <p>
            {data.preview.sheet} · {data.preview.range} · Published values
          </p>
          <table aria-label="Published spreadsheet preview">
            <tbody>
              {data.preview.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {snapshot && (
        <>
          <div className="sheet-menu-bar" role="group" aria-label="Spreadsheet settings categories">
            {["File", "Edit", "View", "Insert", "Format", "Data"].map(
              (name) => (
                <button
                  type="button"
                  key={name}
                  aria-expanded={toolsPanel === name}
                  aria-haspopup="dialog"
                  aria-controls={toolsPanel === name ? toolsId : undefined}
                  disabled={
                    !writable &&
                    ["Edit", "Insert", "Format", "Data"].includes(name)
                  }
                  onClick={(e) => {
                    toolsTrigger.current = e.currentTarget;
                    setToolsPanel(toolsPanel === name ? "" : name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      toolsTrigger.current = e.currentTarget;
                      setToolsPanel(name);
                    }
                  }}
                >
                  {name}
                </button>
              ),
            )}
          </div>
          <div
            className="sheet-toolbar"
            role="group"
            aria-label="Spreadsheet formatting toolbar"
          >
            <div className="sheet-tool-group">
              <button
                type="button"
                title="Undo"
                aria-label="Undo"
                disabled={!writable}
                onClick={() => act(() => book.current!.undo())}
              >
                <Undo2 size={16} />
              </button>
              <button
                type="button"
                title="Redo"
                aria-label="Redo"
                disabled={!writable}
                onClick={() => act(() => book.current!.redo())}
              >
                <Redo2 size={16} />
              </button>
              <label>
                Scale
                <select
                  aria-label="Spreadsheet UI scale"
                  value={uiScale}
                  onChange={(e) => setUiScale(Number(e.target.value))}
                >
                  {[50, 75, 90, 100, 125, 150, 200].map((n) => (
                    <option key={n} value={n}>
                      {n}%
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset
              className="sheet-tool-group"
              disabled={!writable}
              aria-label="Font and cell formatting"
            >
              <label>
                Font
                <select
                  aria-label="Spreadsheet font"
                  value={selectedStyle?.ff ?? "Arial"}
                  onChange={(e) =>
                    setStyle((r) => r.setFontFamily(e.target.value))
                  }
                >
                  <option>Arial</option>
                  <option>Georgia</option>
                  <option>Consolas</option>
                  <option>Segoe UI</option>
                </select>
              </label>
              <label>
                Font size
                <input
                  aria-label="Spreadsheet font size"
                  type="number"
                  min={6}
                  max={96}
                  value={fontSizeDraft ?? String(selectedStyle?.fs ?? 11)}
                  onChange={(e) => {
                    setFontSizeDraft(e.target.value);
                    const n = e.target.valueAsNumber;
                    if (
                      Number.isFinite(n) &&
                      n >= 6 &&
                      n <= 96 &&
                      n !== (selectedStyle?.fs ?? 11)
                    )
                      setStyle((r) => r.setFontSize(n));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={() => setFontSizeDraft(null)}
                />
              </label>
              <button
                type="button"
                title="Bold"
                aria-label="Bold"
                aria-pressed={selectedStyle?.bl === 1}
                onClick={() =>
                  setStyle((r) =>
                    r.setFontWeight(
                      selectedStyle?.bl === 1 ? "normal" : "bold",
                    ),
                  )
                }
              >
                <Bold size={16} />
              </button>
              <button
                type="button"
                title="Italic"
                aria-label="Italic"
                aria-pressed={selectedStyle?.it === 1}
                onClick={() =>
                  setStyle((r) =>
                    r.setFontStyle(
                      selectedStyle?.it === 1 ? "normal" : "italic",
                    ),
                  )
                }
              >
                <Italic size={16} />
              </button>
              <button
                type="button"
                title="Underline"
                aria-label="Underline"
                aria-pressed={selectedStyle?.ul?.s === 1}
                onClick={() =>
                  setStyle((r) =>
                    r.setFontLine(
                      selectedStyle?.ul?.s === 1 ? "none" : "underline",
                    ),
                  )
                }
              >
                <Underline size={16} />
              </button>
              <button
                type="button"
                title="Strikethrough"
                aria-label="Strikethrough"
                aria-pressed={selectedStyle?.st?.s === 1}
                onClick={() =>
                  setStyle((r) =>
                    r.setFontLine(
                      selectedStyle?.st?.s === 1 ? "none" : "line-through",
                    ),
                  )
                }
              >
                <Strikethrough size={16} />
              </button>
              <button
                type="button"
                title="Wrap text"
                aria-label="Wrap text"
                aria-pressed={selectedStyle?.tb === 3}
                onClick={() =>
                  setStyle((r) => r.setWrap(selectedStyle?.tb !== 3))
                }
              >
                <WrapText size={16} />
              </button>
              <label>
                Text color
                <input
                  aria-label="Spreadsheet text color"
                  type="color"
                  value={selectedStyle?.cl?.rgb ?? "#202020"}
                  onChange={(e) =>
                    setStyle((r) => r.setFontColor(e.target.value))
                  }
                />
              </label>
              <label>
                Cell color
                <input
                  aria-label="Spreadsheet cell color"
                  type="color"
                  value={selectedStyle?.bg?.rgb ?? "#ffffff"}
                  onChange={(e) =>
                    setStyle((r) => r.setBackground(e.target.value))
                  }
                />
              </label>

              <label>
                Number format
                <select
                  aria-label="Spreadsheet number format"
                  value={selectedStyle?.n?.pattern ?? "General"}
                  onChange={(e) =>
                    setStyle((r) => r.setNumberFormat(e.target.value))
                  }
                >
                  {[
                    "General",
                    "0",
                    "0.00",
                    "0.0%",
                    "$#,##0.00",
                    "yyyy-mm-dd",
                  ].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset
              className="sheet-tool-group"
              disabled={!writable}
              aria-label="Alignment and borders"
            >
              {(
                [
                  {
                    name: "Align left",
                    value: 1,
                    alignment: "left",
                    Icon: AlignLeft,
                  },
                  {
                    name: "Align center",
                    value: 2,
                    alignment: "center",
                    Icon: AlignCenter,
                  },
                  {
                    name: "Align right",
                    value: 3,
                    alignment: "normal",
                    Icon: AlignRight,
                  },
                ] as const
              ).map(({ name, value, alignment, Icon }) => (
                <button
                  type="button"
                  key={name}
                  aria-label={name}
                  title={name}
                  aria-pressed={(selectedStyle?.ht ?? 1) === value}
                  onClick={() =>
                    setStyle((r) => r.setHorizontalAlignment(alignment))
                  }
                >
                  <Icon size={16} />
                </button>
              ))}
              <label>
                Border sides
                <select
                  aria-label="Border sides"
                  defaultValue=""
                  onChange={(e) => {
                    const borders = engine.current!.univerAPI.Enum.BorderType;
                    const type =
                      borders[e.target.value as keyof typeof borders];
                    if (type !== undefined)
                      setStyle((r) =>
                        r.setBorder(
                          type,
                          engine.current!.univerAPI.Enum.BorderStyleTypes.THIN,
                          "#739b8e",
                        ),
                      );
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Choose borders
                  </option>
                  {[
                    "ALL",
                    "OUTSIDE",
                    "INSIDE",
                    "TOP",
                    "BOTTOM",
                    "LEFT",
                    "RIGHT",
                    "NONE",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </fieldset>
          </div>
          {toolsPanel && (
            <section
              ref={toolsPopup}
              id={toolsId}
              popover="manual"
              role="dialog"
              className="sheet-menu-panel"
              aria-label={`${toolsPanel} spreadsheet tools`}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") {
                  e.preventDefault();
                  setToolsPanel("");
                  toolsTrigger.current?.focus();
                } else if (
                  ["ArrowDown", "ArrowUp"].includes(e.key) &&
                  !["INPUT", "SELECT", "TEXTAREA"].includes(
                    (e.target as HTMLElement).tagName,
                  )
                ) {
                  const controls = Array.from(
                    e.currentTarget.querySelectorAll<HTMLElement>(
                      "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary",
                    ),
                  ).filter((el) => el.getClientRects().length > 0);
                  const at = controls.indexOf(
                    document.activeElement as HTMLElement,
                  );
                  if (controls.length) {
                    e.preventDefault();
                    controls[
                      (at + (e.key === "ArrowDown" ? 1 : controls.length - 1)) %
                        controls.length
                    ].focus();
                  }
                }
              }}
            >
              <h2 className="sheet-menu-heading">{toolsPanel}</h2>
              <div hidden={toolsPanel !== "File"}>
                {" "}
                <div className="spreadsheet-actions">
                  {!readOnly && (
                    <>
                      <label>
                        Study template
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const templates: Record<
                              string,
                              { headers: string[]; rows: string[][] }
                            > = {
                              tracker: {
                                headers: [
                                  "Topic",
                                  "Planned hours",
                                  "Actual hours",
                                  "Progress",
                                ],
                                rows: [
                                  ["Week 1", "4", "0", "Not started"],
                                  ["Week 2", "4", "0", "Not started"],
                                ],
                              },
                              compare: {
                                headers: [
                                  "Concept",
                                  "Definition",
                                  "Example",
                                  "Contrast",
                                ],
                                rows: [
                                  ["", "", "", ""],
                                  ["", "", "", ""],
                                ],
                              },
                              grades: {
                                headers: [
                                  "Assessment",
                                  "Score",
                                  "Possible",
                                  "Weight",
                                ],
                                rows: [
                                  ["Quiz", "0", "10", "0.1"],
                                  ["Exam", "0", "100", "0.9"],
                                ],
                              },
                            };
                            const seed = templates[e.target.value];
                            if (seed) {
                              const next = blankWorkbook(
                                crypto.randomUUID(),
                                e.target.selectedOptions[0].text,
                                seed,
                              );
                              setPreview({
                                name: next.name,
                                snapshot: next,
                                warnings: [
                                  "This template replaces the current workbook. A previous version is retained.",
                                ],
                              });
                              setSelectedSheets(next.sheetOrder);
                              original.current = null;
                              setToolsPanel("");
                            }
                            e.target.value = "";
                          }}
                        >
                          <option value="" disabled>
                            Choose a template
                          </option>
                          <option value="tracker">Study hours tracker</option>
                          <option value="compare">Concept comparison</option>
                          <option value="grades">Assessment planner</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          act(() => {
                            const r = range().getRange();
                            if (
                              r.endRow - r.startRow >= 200 ||
                              r.endColumn - r.startColumn >= 30
                            )
                              throw Error(
                                "Previews support up to 200 rows and 30 columns.",
                              );
                            const rows = Array.from(
                              { length: r.endRow - r.startRow + 1 },
                              (_, i) =>
                                Array.from(
                                  { length: r.endColumn - r.startColumn + 1 },
                                  (_, j) =>
                                    readableCell(
                                      view!.cellData[r.startRow + i]?.[
                                        r.startColumn + j
                                      ],
                                    ),
                                ),
                            );
                            if (
                              rows.some((row) =>
                                row.some((cell) => cell.length > 2000),
                              ) ||
                              JSON.stringify(rows).length > 100000
                            )
                              throw Error(
                                "Select a smaller preview; no cell text has been truncated.",
                              );
                            callback.current({
                              ...data,
                              preview: {
                                sheet: view!.name,
                                range: address,
                                rows,
                              },
                            });
                          })
                        }
                      >
                        Include selected values in note preview
                      </button>
                      {data.preview && (
                        <button
                          type="button"
                          onClick={() =>
                            callback.current({ ...data, preview: undefined })
                          }
                        >
                          Remove shared preview
                        </button>
                      )}
                    </>
                  )}
                  <small>
                    Only the selected preview values enter note search, AI
                    context and published copies. The full workbook stays
                    separate.
                  </small>
                  <button
                    type="button"
                    onClick={() => void exportFile("xlsx")}
                    disabled={busy}
                  >
                    Export Excel
                  </button>
                  <button
                    type="button"
                    data-workbook-backup
                    onClick={() => void exportFile("json")}
                  >
                    Backup
                  </button>
                  <button type="button" onClick={() => void exportFile("csv")}>
                    CSV
                  </button>
                  <button type="button" onClick={() => void exportFile("tsv")}>
                    TSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void import("@/lib/spreadsheets/print").then(
                        ({ printWorksheet }) => {
                          try {
                            printWorksheet(
                              book.current!.save() as WorkbookSnapshot,
                              activeSheet,
                              { orientation, repeatHeader },
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        },
                      );
                    }}
                  >
                    Print / PDF
                  </button>
                  <details>
                    <summary>Print options</summary>
                    <label>
                      Orientation
                      <select
                        value={orientation}
                        onChange={(e) =>
                          setOrientation(
                            e.target.value as "portrait" | "landscape",
                          )
                        }
                      >
                        <option value="landscape">Landscape</option>
                        <option value="portrait">Portrait</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={repeatHeader}
                        onChange={(e) => setRepeatHeader(e.target.checked)}
                      />
                      Repeat first selected row as header
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const selected = range().getRange();
                          const { printWorksheet } =
                            await import("@/lib/spreadsheets/print");
                          printWorksheet(
                            book.current!.save() as WorkbookSnapshot,
                            activeSheet,
                            { range: selected, orientation, repeatHeader },
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Print selected range / PDF
                    </button>
                  </details>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!record.current) return;
                        try {
                          if (shared.current) {
                            const response = await fetch(
                                `/api/shared/spreadsheets?id=${record.current.id}&collection=${shared.current.collection}&history=1`,
                                { cache: "no-store" },
                              ),
                              data = await response.json();
                            if (!response.ok) throw Error(data.error);
                            setHistory(
                              data.versions.map(
                                (v: {
                                  snapshot: WorkbookSnapshot;
                                  revision: number;
                                  created_at: string;
                                }) => ({
                                  ...record.current!,
                                  snapshot: v.snapshot,
                                  revision: v.revision,
                                  updatedAt: v.created_at,
                                }),
                              ),
                            );
                          } else
                            setHistory(
                              await workbookHistory(
                                record.current.scope,
                                record.current.id,
                              ),
                            );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Version history
                    </button>
                  )}
                </div>
                {!readOnly && (
                  <details className="spreadsheet-import">
                    <summary>Import Excel or Google Sheets file</summary>
                    <p>
                      Download a Google Sheet as Excel, then choose it here.
                      Files are converted on this device. Shared workbook values
                      sync with collaborators. Importing replaces this workbook
                      and retains its previous version.
                    </p>
                    <label>
                      CSV delimiter
                      <select
                        value={delimiter}
                        onChange={(e) => setDelimiter(e.target.value)}
                      >
                        <option value=",">Comma</option>
                        <option value=";">Semicolon</option>
                        <option value={"\t"}>Tab</option>
                      </select>
                    </label>
                    <label>
                      CSV encoding
                      <select
                        value={encoding}
                        onChange={(e) => setEncoding(e.target.value)}
                      >
                        <option value="utf-8">UTF-8</option>
                        <option value="windows-1252">Windows Latin</option>
                        <option value="utf-16le">UTF-16 LE</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={formulas}
                        onChange={(e) => setFormulas(e.target.checked)}
                      />
                      Import supported formulas
                    </label>
                    <input
                      type="file"
                      aria-label="Import spreadsheet file"
                      accept=".xlsx,.csv,.tsv,.json"
                      disabled={busy || !writable}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          void importFile(e.target.files[0]);
                          setToolsPanel("");
                        }
                        e.target.value = "";
                      }}
                    />
                  </details>
                )}
              </div>
              <fieldset disabled={!writable} hidden={toolsPanel !== "Edit"}>
                <div className="spreadsheet-actions">
                  <button type="button" onClick={() => void copyCells()}>
                    Copy cells
                  </button>
                  <button type="button" onClick={() => void copyCells(true)}>
                    Cut cells
                  </button>
                  <button type="button" onClick={() => void pasteCells()}>
                    Paste cells
                  </button>
                  <button
                    type="button"
                    onClick={() => setStyle((r) => r.clear())}
                  >
                    Clear contents
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStyle((r) => r.clear({ formatOnly: true }))
                    }
                  >
                    Clear formatting
                  </button>
                </div>
              </fieldset>
              <div hidden={toolsPanel !== "View"}>
                <p>
                  Scale changes the grid on this device without changing cell
                  font sizes or exports.
                </p>
                <button
                  type="button"
                  aria-pressed={accessible}
                  onClick={() => setAccessible(!accessible)}
                >
                  {accessible
                    ? "Show visual spreadsheet"
                    : "Accessible cell editor"}
                </button>
              </div>
              <fieldset disabled={!writable} hidden={toolsPanel !== "Insert"}>
                <div className="spreadsheet-actions">
                  {" "}
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const r = range().getRange();
                        book
                          .current!.getActiveSheet()
                          .insertRows(r.startRow, 1);
                      })
                    }
                  >
                    Add row above
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const r = range().getRange();
                        book
                          .current!.getActiveSheet()
                          .insertColumns(r.startColumn, 1);
                      })
                    }
                  >
                    Add column before
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const r = range().getRange();
                        book
                          .current!.getActiveSheet()
                          .deleteRows(r.startRow, r.endRow - r.startRow + 1);
                      })
                    }
                  >
                    Delete rows
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const r = range().getRange();
                        book
                          .current!.getActiveSheet()
                          .deleteColumns(
                            r.startColumn,
                            r.endColumn - r.startColumn + 1,
                          );
                      })
                    }
                  >
                    Delete columns
                  </button>
                  <label>
                    Row / column label
                    <input
                      aria-label="Spreadsheet row or column label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const s = book.current!.getActiveSheet();
                        s.setRowCustom({
                          [location.row]: {
                            ...s.getRowCustomMetadata(location.row),
                            label,
                          },
                        });
                        persist();
                      })
                    }
                  >
                    Name row
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const s = book.current!.getActiveSheet();
                        s.setColumnCustom({
                          [location.column]: {
                            ...s.getColumnCustomMetadata(location.column),
                            label,
                          },
                        });
                        persist();
                      })
                    }
                  >
                    Name column
                  </button>
                  <label>
                    Group name
                    <input
                      aria-label="Spreadsheet group name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={() => addGroup("row")}>
                    Group rows
                  </button>
                  <button type="button" onClick={() => addGroup("column")}>
                    Group columns
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const name = groupName.trim().replaceAll(" ", "_");
                        if (
                          !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(name) ||
                          /^[A-Za-z]+\d+$/.test(name)
                        )
                          throw Error(
                            "Use a range name beginning with a letter, followed by letters, numbers or underscores.",
                          );
                        if (book.current!.getDefinedName(name))
                          throw Error("That range name already exists.");
                        const ref =
                          "'" +
                          view!.name.replaceAll("'", "''") +
                          "'!" +
                          range()
                            .getA1Notation()
                            .replace(
                              /([A-Z]+)(\d+)/g,
                              (_, column, row) => "$" + column + "$" + row,
                            );
                        book.current!.insertDefinedNameBuilder(
                          book
                            .current!.newDefinedNameBuilder()
                            .setName(name)
                            .setRef(ref)
                            .build(),
                        );
                      })
                    }
                  >
                    Save named range
                  </button>
                </div>
              </fieldset>
              <fieldset disabled={!writable} hidden={toolsPanel !== "Format"}>
                <div className="spreadsheet-actions">
                  {" "}
                  <button
                    type="button"
                    onClick={() =>
                      setStyle((r) => {
                        r.setFontWeight("normal");
                        r.setFontStyle("normal");
                        r.setFontLine("none");
                      })
                    }
                  >
                    Normal text
                  </button>
                  <button
                    type="button"
                    onClick={() => setStyle((r) => r.merge())}
                  >
                    Merge cells
                  </button>
                  <button
                    type="button"
                    onClick={() => setStyle((r) => r.breakApart())}
                  >
                    Unmerge cells
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStyle((r) =>
                        r.setBorder(
                          engine.current!.univerAPI.Enum.BorderType.ALL,
                          engine.current!.univerAPI.Enum.BorderStyleTypes.THIN,
                          "#739b8e",
                        ),
                      )
                    }
                  >
                    Outline all cells
                  </button>{" "}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => partial("bold")}
                  >
                    Bold selected text
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => partial("italic")}
                  >
                    Italic selected text
                  </button>
                </div>
              </fieldset>
              <fieldset disabled={!writable} hidden={toolsPanel !== "Data"}>
                <div className="spreadsheet-actions">
                  {" "}
                  <label>
                    Horizontal alignment
                    <select
                      defaultValue="left"
                      onChange={(e) =>
                        setStyle((r) =>
                          r.setHorizontalAlignment(
                            (e.target.value === "right"
                              ? "normal"
                              : e.target.value) as "left" | "center" | "normal",
                          ),
                        )
                      }
                    >
                      <option>left</option>
                      <option>center</option>
                      <option>right</option>
                    </select>
                  </label>
                  <label>
                    Vertical alignment
                    <select
                      defaultValue="top"
                      onChange={(e) =>
                        setStyle((r) =>
                          r.setVerticalAlignment(
                            e.target.value as "top" | "middle" | "bottom",
                          ),
                        )
                      }
                    >
                      <option>top</option>
                      <option>middle</option>
                      <option>bottom</option>
                    </select>
                  </label>
                  <label>
                    Row height (px)
                    <input
                      type="number"
                      min={16}
                      max={400}
                      defaultValue={24}
                      onChange={(e) => {
                        const n = +e.target.value;
                        if (n >= 16 && n <= 400)
                          act(() => {
                            const r = range();
                            book
                              .current!.getActiveSheet()
                              .setRowHeights(r.getRow(), r.getHeight(), n);
                          });
                      }}
                    />
                  </label>
                  <label>
                    Column width (px)
                    <input
                      type="number"
                      min={32}
                      max={800}
                      defaultValue={100}
                      onChange={(e) => {
                        const n = +e.target.value;
                        if (n >= 32 && n <= 800)
                          act(() => {
                            const r = range();
                            book
                              .current!.getActiveSheet()
                              .setColumnWidths(r.getColumn(), r.getWidth(), n);
                          });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const r = range();
                        if (r.getRow() > 0)
                          book
                            .current!.getActiveSheet()
                            .moveRows(r, r.getRow() - 1);
                      })
                    }
                  >
                    Move rows up
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        const r = range();
                        if (r.getColumn() > 0)
                          book
                            .current!.getActiveSheet()
                            .moveColumns(r, r.getColumn() - 1);
                      })
                    }
                  >
                    Move columns left
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        book.current!.getActiveSheet().setFreeze({
                          startRow: location.row,
                          startColumn: location.column,
                          xSplit: location.column,
                          ySplit: location.row,
                        });
                      })
                    }
                  >
                    Freeze before selected cell
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => book.current!.getActiveSheet().cancelFreeze())
                    }
                  >
                    Unfreeze
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStyle((r) => r.sort({ column: 0, ascending: true }))
                    }
                  >
                    Sort range ascending
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStyle((r) => r.sort({ column: 0, ascending: false }))
                    }
                  >
                    Sort range descending
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        if (!findText)
                          throw Error(
                            "Enter the exact value in Find text first.",
                          );
                        const r = range();
                        const filter = r.getFilter() ?? r.createFilter();
                        if (!filter)
                          throw Error(
                            "Select a range with a header row and data.",
                          );
                        filter.setColumnFilterCriteria(r.getColumn(), {
                          colId: 0,
                          filters: { filters: [findText] },
                        });
                      })
                    }
                  >
                    Filter first column by Find text
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      act(() => {
                        book.current!.getActiveSheet().getFilter()?.remove();
                      })
                    }
                  >
                    Remove filter
                  </button>
                  <label>
                    Find text
                    <input
                      value={findText}
                      onChange={(e) => setFindText(e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={() => findNext()}>
                    Find next cell
                  </button>
                  <label>
                    Replace with
                    <input
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={() => findNext(true)}>
                    Replace in selected cell
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const source = await loadOriginal(
                          record.current!.scope,
                          record.current!.id,
                        );
                        if (!source)
                          throw Error(
                            "No original imported file is stored for this workbook.",
                          );
                        download(
                          source.bytes,
                          source.name,
                          "application/octet-stream",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Download original import
                  </button>
                  {context && (
                    <button type="button" onClick={() => setContext(false)}>
                      Close selection tools
                    </button>
                  )}
                </div>
              </fieldset>
            </section>
          )}
          {busy && (
            <div role="status">
              Converting on this device…{" "}
              <button
                type="button"
                onClick={() => {
                  cancelWorker.current?.();
                }}
              >
                Cancel conversion
              </button>
            </div>
          )}
          {preview && (
            <section
              className="spreadsheet-preview"
              aria-label="Spreadsheet import preview"
            >
              <strong>{preview.name}</strong>
              <p>
                Select worksheets to import. Unselected worksheets and their
                referenced values are not included.
              </p>
              {preview.snapshot.sheetOrder.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={selectedSheets.includes(id)}
                    onChange={(e) =>
                      setSelectedSheets((s) =>
                        e.target.checked
                          ? [...s, id]
                          : s.filter((x) => x !== id),
                      )
                    }
                  />
                  {preview.snapshot.sheets[id].name}
                </label>
              ))}
              <ul>
                {preview.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!selectedSheets.length || !writable}
                onClick={() => void applyImport()}
              >
                Replace workbook with selected sheets
              </button>
              <button type="button" onClick={() => setPreview(null)}>
                Cancel import
              </button>
            </section>
          )}
          {history && (
            <section aria-label="Spreadsheet versions">
              <button type="button" onClick={() => setHistory(null)}>
                Close history
              </button>
              {history.length ? (
                history.map((item) => (
                  <button
                    type="button"
                    key={item.revision}
                    onClick={() =>
                      act(() => {
                        const previous = record.current!.snapshot;
                        mount({ ...item.snapshot, id: record.current!.id });
                        queuedBase.current = previous;
                        persist();
                        setHistory(null);
                      })
                    }
                  >
                    Restore revision {item.revision} ·{" "}
                    {new Date(item.updatedAt).toLocaleString()}
                  </button>
                ))
              ) : (
                <p>No earlier saved versions.</p>
              )}
            </section>
          )}
          <div className="spreadsheet-cell-controls">
            {!!book.current?.getDefinedNames().length && (
              <label>
                Named range
                <select
                  defaultValue=""
                  onChange={(e) => {
                    try {
                      const ref = book
                          .current!.getDefinedName(e.target.value)
                          ?.getFormulaOrRefString(),
                        match = ref?.match(
                          /^'((?:[^']|'')+)'!(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)$/,
                        );
                      if (!match)
                        throw Error(
                          "This name is a formula rather than a navigable range.",
                        );
                      const sheet = book.current!.getSheetByName(
                        match[1].replaceAll("''", "'"),
                      );
                      if (!sheet)
                        throw Error("The named worksheet is missing.");
                      book.current!.setActiveSheet(sheet);
                      selectionAnchor.current = null;
                      book.current!.setActiveRange(sheet.getRange(match[2]));
                      refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Jump to a range
                  </option>
                  {book.current.getDefinedNames().map((name) => (
                    <option key={name.getName()}>{name.getName()}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="sr-only">Cell or range</span>
              <input
                aria-label="Spreadsheet cell or range"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    try {
                      selectionAnchor.current = null;
                      book.current!.setActiveRange(range());
                      revealCell(range().getRow(), range().getColumn());
                      refresh();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                try {
                  selectionAnchor.current = null;
                  book.current!.setActiveRange(range());
                  revealCell(range().getRow(), range().getColumn());
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Go to range
            </button>
            <label>
              <span className="sheet-fx" aria-hidden="true">
                fx
              </span>
              <textarea
                rows={1}
                ref={editor}
                onBlur={() => {
                  if (draft.current) setText();
                }}
                spellCheck
                aria-label="Spreadsheet cell text or formula"
                readOnly={!writable}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setStatus("Editing cell — not saved yet");
                  draft.current = {
                    sheet: activeSheet,
                    address,
                    value: e.target.value,
                  };
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    setText();
                  }
                }}
              />
              {draft.current && (
                <small>
                  Editing · Click outside or press Ctrl/⌘ + Enter to save
                </small>
              )}
            </label>
            {!readOnly && (
              <>
                <button type="button" disabled={!writable} onClick={setText}>
                  Apply cell value
                </button>
              </>
            )}
          </div>
          {groups.length > 0 && (
            <div className="spreadsheet-groups" aria-label="Spreadsheet groups">
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      applyGroups(
                        groups.map((g) => ({ ...g, collapsed: false })),
                      )
                    }
                  >
                    Expand all groups
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyGroups(
                        groups.map((g) => ({ ...g, collapsed: true })),
                      )
                    }
                  >
                    Collapse all groups
                  </button>
                </>
              )}
              {groups.map((g) => (
                <span key={g.id}>
                  <button
                    type="button"
                    aria-expanded={!g.collapsed}
                    disabled={readOnly && !shared.current}
                    onClick={() => changeGroup(g.id)}
                  >
                    {g.collapsed ? "▸" : "▾"} {g.name} ({g.axis}s)
                  </button>
                  {!readOnly && (
                    <>
                      <input
                        aria-label={`Name for group ${g.name}`}
                        value={g.name}
                        maxLength={80}
                        onChange={(e) =>
                          applyGroups(
                            groups.map((item) =>
                              item.id === g.id
                                ? { ...item, name: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Ungroup ${g.name}`}
                        onClick={() => changeGroup(g.id, true)}
                      >
                        Ungroup
                      </button>
                    </>
                  )}
                </span>
              ))}
            </div>
          )}
          {accessible && view && (
            <div className="spreadsheet-accessible">
              <p className="sheet-scroll-hint">
                Ctrl + scroll to move through rows · Ctrl + Shift + scroll for
                columns
              </p>
              <p className="sr-only">
                Use arrow keys to navigate cells. Type to replace a cell, or
                double-click, Enter or F2 to edit it. While editing, Enter saves
                and moves down, Tab moves right, and Escape cancels. Alt+Enter
                adds a line break. Shift-click selects a range; Ctrl-click or
                Command-click adds individual cells. Use Cell or range to select
                a range or jump to any address.
              </p>
              <table
                role="grid"
                aria-multiselectable="true"
                style={{
                  zoom: uiScale / 100,
                  width:
                    70 +
                    viewportColumns.reduce(
                      (sum, c) => sum + (view.columnData?.[c]?.w ?? 100),
                      0,
                    ),
                  minWidth: "100%",
                }}
                aria-label="Spreadsheet cells"
                aria-rowcount={view.rowCount + 1}
                aria-colcount={view.columnCount + 1}
              >
                <colgroup>
                  <col style={{ width: 70 }} />
                  {viewportColumns.map((c) => (
                    <col
                      key={c}
                      style={{ width: view.columnData?.[c]?.w ?? 100 }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr aria-rowindex={1}>
                    <th scope="col" aria-colindex={1}>
                      Row
                    </th>
                    {viewportColumns.map((c) => (
                      <th scope="col" aria-colindex={c + 2} key={c}>
                        {columnName(c)}{" "}
                        {String(view.columnData?.[c]?.custom?.label ?? "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewportRows.map((r) => (
                    <tr
                      key={r}
                      aria-rowindex={r + 2}
                      style={{ height: view.rowData?.[r]?.h ?? undefined }}
                    >
                      <th scope="row" aria-colindex={1}>
                        {r + 1} {String(view.rowData?.[r]?.custom?.label ?? "")}
                      </th>
                      {viewportColumns.map((c) => {
                        const merged = view.mergeData?.find(
                          (m) =>
                            r >= m.startRow &&
                            r <= m.endRow &&
                            c >= m.startColumn &&
                            c <= m.endColumn,
                        );
                        if (
                          merged &&
                          (r !==
                            viewportRows.find(
                              (row) =>
                                row >= merged.startRow && row <= merged.endRow,
                            ) ||
                            c !==
                              viewportColumns.find(
                                (col) =>
                                  col >= merged.startColumn &&
                                  col <= merged.endColumn,
                              ))
                        )
                          return null;
                        const cell =
                            view.cellData[merged?.startRow ?? r]?.[
                              merged?.startColumn ?? c
                            ],
                          style =
                            typeof cell?.s === "string"
                              ? snapshot.styles[cell.s]
                              : cell?.s;
                        const display =
                          book.current
                            ?.getActiveSheet()
                            .getRange(r, c)
                            .getDisplayValue() ?? readableCell(cell);
                        return (
                          <td
                            role="gridcell"
                            rowSpan={
                              merged
                                ? viewportRows.filter(
                                    (row) =>
                                      row >= merged.startRow &&
                                      row <= merged.endRow,
                                  ).length
                                : undefined
                            }
                            colSpan={
                              merged
                                ? viewportColumns.filter(
                                    (col) =>
                                      col >= merged.startColumn &&
                                      col <= merged.endColumn,
                                  ).length
                                : undefined
                            }
                            data-sheet-row={r}
                            data-sheet-column={c}
                            aria-colindex={c + 2}
                            aria-selected={selectedRanges.some(
                              (range) =>
                                r >= range.startRow &&
                                r <= range.endRow &&
                                c >= range.startColumn &&
                                c <= range.endColumn,
                            )}
                            tabIndex={
                              r === location.row && c === location.column
                                ? 0
                                : -1
                            }
                            key={c}
                            aria-label={`${cellAddress(r, c)}: ${display || "Empty"}`}
                            aria-description={
                              [
                                style?.bl === 1 ? "Bold" : "",
                                style?.it === 1 ? "Italic" : "",
                                style?.fs ? `${style.fs} point` : "",
                                style?.n?.pattern &&
                                style.n.pattern !== "General"
                                  ? style.n.pattern
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(", ") || undefined
                            }
                            onMouseDown={(e) => {
                              if (
                                !(e.target as HTMLElement).closest("textarea")
                              )
                                e.preventDefault();
                            }}
                            onFocus={(e) => {
                              if (e.target !== e.currentTarget) return;
                              const current = book.current
                                ?.getActiveSheet()
                                .getSelection()
                                ?.getCurrentCell();
                              if (
                                r !== current?.actualRow ||
                                c !== current?.actualColumn
                              )
                                select(r, c);
                            }}
                            onClick={(e) => {
                              if (
                                e.target !== e.currentTarget &&
                                (e.target as HTMLElement).closest("textarea")
                              )
                                return;
                              if (inlineEdit.current && !finishCellEdit(true))
                                return;
                              select(r, c, e);
                              e.currentTarget.focus({ preventScroll: true });
                            }}
                            onDoubleClick={() => startCellEdit(r, c)}
                            onPaste={(e) => {
                              if ((e.target as HTMLElement).closest("textarea"))
                                return;
                              e.preventDefault();
                              void pasteCells(
                                e.clipboardData.getData("text/plain"),
                              );
                            }}
                            onCopy={(e) => {
                              if ((e.target as HTMLElement).closest("textarea"))
                                return;
                              e.preventDefault();
                              void copyCells();
                            }}
                            onCut={(e) => {
                              if ((e.target as HTMLElement).closest("textarea"))
                                return;
                              e.preventDefault();
                              void copyCells(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              if (
                                e.key.length === 1 &&
                                !e.ctrlKey &&
                                !e.metaKey &&
                                !e.altKey &&
                                !e.nativeEvent.isComposing
                              ) {
                                if (writable) {
                                  e.preventDefault();
                                  startCellEdit(r, c, e.key);
                                }
                                return;
                              }
                              const delta = (
                                {
                                  ArrowDown: [1, 0],
                                  ArrowUp: [-1, 0],
                                  ArrowLeft: [0, -1],
                                  ArrowRight: [0, 1],
                                } as Record<string, number[]>
                              )[e.key];
                              if (delta) {
                                e.preventDefault();
                                let nextRow = r + delta[0],
                                  nextColumn = c + delta[1];
                                if (merged) {
                                  if (delta[0] > 0) nextRow = merged.endRow + 1;
                                  if (delta[1] > 0)
                                    nextColumn = merged.endColumn + 1;
                                }
                                while (
                                  nextRow >= 0 &&
                                  nextRow < view.rowCount &&
                                  view.rowData?.[nextRow]?.hd === 1
                                )
                                  nextRow += delta[0] || 1;
                                while (
                                  nextColumn >= 0 &&
                                  nextColumn < view.columnCount &&
                                  view.columnData?.[nextColumn]?.hd === 1
                                )
                                  nextColumn += delta[1] || 1;
                                select(nextRow, nextColumn, {
                                  shiftKey: e.shiftKey,
                                });
                                revealCell(nextRow, nextColumn);
                                requestAnimationFrame(() =>
                                  host.current
                                    ?.querySelector<HTMLElement>(
                                      'td[tabindex="0"]',
                                    )
                                    ?.focus(),
                                );
                              }
                              if (e.key === "Enter" || e.key === "F2") {
                                e.preventDefault();
                                startCellEdit(r, c);
                              }
                              if (e.key === "Delete" || e.key === "Backspace") {
                                e.preventDefault();
                                setStyle((s) => s.clear());
                              }
                              if (e.key === "Escape") setContext(false);
                              if (
                                e.key === "ContextMenu" ||
                                (e.key === "F10" && e.shiftKey)
                              ) {
                                e.preventDefault();
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                setMenuPoint({ x: rect.left, y: rect.bottom });
                                setContext(true);
                              }
                            }}
                            style={{
                              borderTop: borderCss(style?.bd?.t ?? undefined),
                              borderBottom: borderCss(
                                style?.bd?.b ?? undefined,
                              ),
                              borderLeft: borderCss(style?.bd?.l ?? undefined),
                              borderRight: borderCss(style?.bd?.r ?? undefined),
                              fontWeight: style?.bl === 1 ? "bold" : undefined,
                              fontStyle: style?.it === 1 ? "italic" : undefined,
                              fontSize: style?.fs ? `${style.fs}pt` : undefined,
                              fontFamily: style?.ff ?? undefined,
                              textDecoration:
                                [
                                  style?.ul?.s === 1 ? "underline" : "",
                                  style?.st?.s === 1 ? "line-through" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined,
                              textAlign:
                                style?.ht === 2
                                  ? "center"
                                  : style?.ht === 3
                                    ? "right"
                                    : "left",
                              verticalAlign:
                                style?.vt === 2
                                  ? "middle"
                                  : style?.vt === 3
                                    ? "bottom"
                                    : "top",
                              color: style?.cl?.rgb ?? undefined,
                              background: style?.bg?.rgb ?? undefined,
                              whiteSpace:
                                style?.tb === 3 ? "pre-wrap" : undefined,
                            }}
                          >
                            {editingCell?.row === r &&
                            editingCell.column === c ? (
                              <textarea
                                className="sheet-inline-editor"
                                ref={cellEditor}
                                aria-label={`Edit cell ${cellAddress(r, c)}`}
                                spellCheck
                                readOnly={!writable}
                                rows={Math.min(
                                  8,
                                  Math.max(1, value.split("\n").length),
                                )}
                                value={value}
                                onChange={(e) => {
                                  setValue(e.target.value);
                                  if (inlineEdit.current)
                                    inlineEdit.current.value = e.target.value;
                                  if (draft.current)
                                    draft.current.value = e.target.value;
                                  setStatus("Editing cell — not saved yet");
                                }}
                                onBlur={(event) => {
                                  if (
                                    (
                                      event.relatedTarget as HTMLElement | null
                                    )?.matches?.('[data-u-comp="editor"]')
                                  )
                                    return;
                                  finishCellEdit(true);
                                }}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (
                                    e.nativeEvent.isComposing ||
                                    e.nativeEvent.keyCode === 229
                                  )
                                    return;
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    finishCellEdit(false);
                                  } else if (e.key === "Enter" && e.altKey) {
                                    e.preventDefault();
                                    const field = e.currentTarget,
                                      start = field.selectionStart;
                                    const next =
                                      value.slice(0, start) +
                                      "\n" +
                                      value.slice(field.selectionEnd);
                                    setValue(next);
                                    if (inlineEdit.current)
                                      inlineEdit.current.value = next;
                                    if (draft.current)
                                      draft.current.value = next;
                                    setStatus("Editing cell — not saved yet");
                                    requestAnimationFrame(() =>
                                      field.setSelectionRange(
                                        start + 1,
                                        start + 1,
                                      ),
                                    );
                                  } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    finishCellEdit(true, [
                                      e.shiftKey ? -1 : 1,
                                      0,
                                    ]);
                                  } else if (e.key === "Tab") {
                                    e.preventDefault();
                                    finishCellEdit(true, [
                                      0,
                                      e.shiftKey ? -1 : 1,
                                    ]);
                                  }
                                }}
                              />
                            ) : cell?.p?.body?.textRuns?.length ? (
                              (() => {
                                const text = readableCell(cell),
                                  runs = formatTextRuns(
                                    text,
                                    cell.p!.body!.textRuns!,
                                    0,
                                    0,
                                    {},
                                  );
                                let from = 0;
                                const pieces = [];
                                for (const run of runs) {
                                  if (run.st > from)
                                    pieces.push(
                                      <span key={"plain" + from}>
                                        {text.slice(from, run.st)}
                                      </span>,
                                    );
                                  pieces.push(
                                    <span
                                      key={run.st}
                                      style={{
                                        fontWeight:
                                          run.ts?.bl === 1 ? "bold" : undefined,
                                        fontStyle:
                                          run.ts?.it === 1
                                            ? "italic"
                                            : undefined,
                                        color: run.ts?.cl?.rgb ?? undefined,
                                        fontSize: run.ts?.fs
                                          ? run.ts.fs + "pt"
                                          : undefined,
                                      }}
                                    >
                                      {text.slice(run.st, run.ed)}
                                    </span>,
                                  );
                                  from = run.ed;
                                }
                                if (from < text.length)
                                  pieces.push(
                                    <span key={"end" + from}>
                                      {text.slice(from)}
                                    </span>,
                                  );
                                return pieces;
                              })()
                            ) : (
                              display
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="spreadsheet-actions sheet-tabs">
            <label>
              Worksheet
              <select
                aria-label="Spreadsheet worksheet"
                value={activeSheet}
                onChange={(e) => {
                  book.current?.setActiveSheet(e.target.value);
                  refresh();
                }}
              >
                {snapshot.sheetOrder.map((id) => (
                  <option value={id} key={id}>
                    {snapshot.sheets[id].name}
                  </option>
                ))}
              </select>
            </label>
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    act(() => {
                      book.current!.insertSheet();
                      refresh();
                    })
                  }
                >
                  Add sheet
                </button>
                <label>
                  Sheet name
                  <input
                    aria-label="Spreadsheet sheet name"
                    value={view?.name ?? ""}
                    onChange={(e) =>
                      act(() => {
                        book.current!.getActiveSheet().setName(e.target.value);
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={snapshot.sheetOrder.length < 2}
                  onClick={() =>
                    act(() => {
                      book.current!.deleteSheet(book.current!.getActiveSheet());
                      refresh();
                    })
                  }
                >
                  Delete sheet
                </button>
              </>
            )}
          </div>
        </>
      )}
      <div
        className="spreadsheet-engine"
        inert={accessible}
        ref={canvas}
        style={{ display: accessible ? "none" : "block", zoom: uiScale / 100 }}
      />
      <Dropdown.Root open={context} onOpenChange={setContext} modal={false}>
        <Dropdown.Trigger asChild>
          <span
            style={{
              position: "fixed",
              left: menuPoint.x,
              top: menuPoint.y,
              width: 1,
              height: 1,
            }}
            aria-hidden="true"
          />
        </Dropdown.Trigger>
        <Dropdown.Portal container={expanded ? host.current : undefined}>
          <Dropdown.Content
            className="context-menu table-context-menu"
            align="start"
            sideOffset={2}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              host.current
                ?.querySelector<HTMLElement>('td[tabindex="0"]')
                ?.focus();
            }}
          >
            <Dropdown.Item
              className="menu-item"
              onSelect={() => void copyCells()}
            >
              Copy cells
            </Dropdown.Item>
            <Dropdown.Item
              className="menu-item"
              disabled={!writable}
              onSelect={() => void copyCells(true)}
            >
              Cut cells
            </Dropdown.Item>
            <Dropdown.Item
              className="menu-item"
              disabled={!writable}
              onSelect={() => void pasteCells()}
            >
              Paste cells
            </Dropdown.Item>
            <Dropdown.Separator className="menu-separator" />
            {["row", "column"].map((axis) => (
              <Dropdown.Item
                key={axis}
                className="menu-item"
                disabled={!writable}
                onSelect={() =>
                  act(() => {
                    const r = range(),
                      s = book.current!.getActiveSheet();
                    axis === "row"
                      ? s.insertRows(r.getRow(), 1)
                      : s.insertColumns(r.getColumn(), 1);
                  })
                }
              >
                New {axis} {axis === "row" ? "above" : "before"}
              </Dropdown.Item>
            ))}
            {["row", "column"].map((axis) => (
              <Dropdown.Item
                key={"delete" + axis}
                className="menu-item danger"
                disabled={!writable}
                onSelect={() =>
                  act(() => {
                    const r = range(),
                      s = book.current!.getActiveSheet();
                    axis === "row"
                      ? s.deleteRows(r.getRow(), r.getHeight())
                      : s.deleteColumns(r.getColumn(), r.getWidth());
                  })
                }
              >
                Delete {axis}s
              </Dropdown.Item>
            ))}
            <Dropdown.Item
              className="menu-item"
              disabled={!writable}
              onSelect={() => setStyle((r) => r.clear())}
            >
              Clear contents
            </Dropdown.Item>
            <Dropdown.Item
              className="menu-item"
              onSelect={() =>
                requestAnimationFrame(() => editor.current?.focus())
              }
            >
              Edit cell text / study selection
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
