import { WidgetType, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Attachment } from "@/lib/model";
import AttachmentMedia from "./AttachmentMedia";

const dragType = "application/x-studyspace-note-image";
const drags = new WeakMap<
  EditorView,
  { from: number; to: number; body: string; token: string; marker: HTMLElement }
>();
function clearDrag(view: EditorView) {
  drags.get(view)?.marker.remove();
  drags.delete(view);
}
export const imageDropHandlers = EditorView.domEventHandlers({
  dragover(event, view) {
    const drag = drags.get(view);
    if (!drag || !event.dataTransfer?.types.includes(dragType)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const position = view.posAtCoords(
      { x: event.clientX, y: event.clientY },
      false,
    );
    const coords = position == null ? null : view.coordsAtPos(position);
    if (coords) {
      Object.assign(drag.marker.style, {
        display: "block",
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        height: `${coords.bottom - coords.top}px`,
      });
    }
    return true;
  },
  dragleave(event, view) {
    if (
      !(event.relatedTarget instanceof Node) ||
      !view.dom.contains(event.relatedTarget)
    ) {
      const drag = drags.get(view);
      if (drag) drag.marker.style.display = "none";
    }
    return false;
  },
  drop(event, view) {
    const drag = drags.get(view);
    if (!drag || event.dataTransfer?.getData(dragType) !== drag.token)
      return false;
    event.preventDefault();
    clearDrag(view);
    const target = view.posAtCoords(
      { x: event.clientX, y: event.clientY },
      false,
    );
    if (
      target == null ||
      view.state.readOnly ||
      view.state.doc.toString() !== drag.body ||
      (target >= drag.from && target <= drag.to)
    )
      return true;
    const source = drag.body.slice(drag.from, drag.to);
    const prefix = target > 0 && drag.body[target - 1] !== "\n" ? "\n" : "";
    const suffix =
      target < drag.body.length && drag.body[target] !== "\n" ? "\n" : "";
    const insert = prefix + source + suffix;
    const start =
      target - (target > drag.to ? drag.to - drag.from : 0) + prefix.length;
    view.dispatch({
      changes: [
        { from: drag.from, to: drag.to, insert: "" },
        { from: target, insert },
      ],
      selection: { anchor: start, head: start + source.length },
      userEvent: "input.move-image",
      scrollIntoView: true,
    });
    view.focus();
    return true;
  },
});

/** Image actions share the same UI in Live Preview and Reading. */
export class EditorImage extends WidgetType {
  private dispose?: () => void;
  constructor(
    private asset: Attachment,
    private demo: boolean,
    private selected = false,
  ) {
    super();
  }
  eq(other: EditorImage) {
    return (
      JSON.stringify(this.asset) === JSON.stringify(other.asset) &&
      this.demo === other.demo &&
      this.selected === other.selected
    );
  }
  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className =
      "editor-image" + (this.selected ? " image-selected" : "");
    wrapper.contentEditable = "false";
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute(
      "aria-label",
      `Image: ${this.asset.filename}. Click to select; drag to move.`,
    );
    const imageRange = (): { from: number; to: number } | null => {
      const position = view.posAtDOM(wrapper);
      let found: { from: number; to: number } | null = null;
      syntaxTree(view.state).iterate({
        from: position,
        to: position + 1,
        enter: (node) => {
          if (
            node.name === "Image" &&
            node.from === position &&
            view.state
              .sliceDoc(node.from, node.to)
              .includes(`attachment:${this.asset.id}`)
          ) {
            found = { from: node.from, to: node.to };
            return false;
          }
        },
      });
      return found;
    };
    const select = () => {
      const range = imageRange();
      if (!range) return;
      view.dispatch({ selection: { anchor: range.from, head: range.to } });
      view.focus();
    };
    wrapper.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("img")) {
        event.preventDefault();
        select();
      }
    });
    wrapper.addEventListener("keydown", (event) => {
      if (event.target === wrapper && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        select();
      }
    });
    wrapper.addEventListener("dragstart", (event) => {
      if (
        view.state.readOnly ||
        !(event.target as HTMLElement).closest("img")
      ) {
        event.preventDefault();
        return;
      }
      const range = imageRange();
      if (!range || !event.dataTransfer) return;
      clearDrag(view);
      const marker = document.createElement("div"),
        token = crypto.randomUUID();
      marker.className = "note-image-drop-marker";
      marker.setAttribute("aria-hidden", "true");
      document.body.append(marker);
      drags.set(view, {
        ...range,
        token,
        marker,
        body: view.state.doc.toString(),
      });
      event.dataTransfer.clearData();
      event.dataTransfer.setData(dragType, token);
      event.dataTransfer.effectAllowed = "move";
      wrapper.classList.add("image-selected");
    });
    wrapper.addEventListener("dragend", () => clearDrag(view));
    const root = createRoot(wrapper);
    let disposed = false;
    const observer = new ResizeObserver(() => {
      if (wrapper.isConnected) view.requestMeasure();
    });
    observer.observe(wrapper);
    const remove = () => {
      if (disposed || view.state.facet(EditorState.readOnly)) return;
      const position = view.posAtDOM(wrapper);
      syntaxTree(view.state).iterate({
        from: position,
        to: position + 1,
        enter: (node) => {
          if (node.name !== "Image" || node.from !== position) return;
          const source = view.state.sliceDoc(node.from, node.to);
          if (!source.includes(`attachment:${this.asset.id}`)) return;
          view.dispatch({
            changes: { from: node.from, to: node.to, insert: "" },
            selection: { anchor: node.from },
          });
          return false;
        },
      });
    };
    queueMicrotask(() => {
      if (!disposed)
        root.render(
          createElement(AttachmentMedia, {
            asset: this.asset,
            demo: this.demo,
            image: true,
            onDelete: view.state.facet(EditorState.readOnly)
              ? undefined
              : remove,
            onLoad: () => {
              if (!disposed) view.requestMeasure();
            },
          }),
        );
    });
    this.dispose = () => {
      disposed = true;
      observer.disconnect();
      queueMicrotask(() => root.unmount());
    };
    return wrapper;
  }
  ignoreEvent() {
    return true;
  }
  destroy() {
    this.dispose?.();
  }
}
