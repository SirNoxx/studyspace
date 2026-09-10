import { createRoot, type Root } from "react-dom/client";
import { StateField, type EditorState } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import {
  studyCodeBlocks,
  codeFence,
  type StudyCodeBlock,
  type BlockAction,
  downloadBlock,
} from "@/lib/code-blocks";
import CodeCell from "./CodeCell";
import Whiteboard from "./Whiteboard";
import NoteModule from "./NoteModule";

const roots = new WeakMap<HTMLElement, Root>();
const observers = new WeakMap<HTMLElement, ResizeObserver>();
class CodeWidget extends WidgetType {
  constructor(
    readonly block: StudyCodeBlock,
    readonly onChat: (text: string) => void,
    readonly onBlockAction: (
      action: BlockAction,
      block: StudyCodeBlock,
    ) => void,
    readonly heights: Map<string, number>,
  ) {
    super();
  }
  eq(other: CodeWidget) {
    return JSON.stringify(this.block) === JSON.stringify(other.block);
  }
  get estimatedHeight() {
    return this.heights.get(this.block.id) ?? -1;
  }
  render(dom: HTMLElement, view: EditorView) {
    let root = roots.get(dom);
    if (!root) {
      root = createRoot(dom);
      roots.set(dom, root);
    }
    const onChange = (patch: Partial<StudyCodeBlock>) => {
      // Replacing the Markdown fence invalidates CodeMirror's measured range.
      // Keep its real height so a tall, focused widget stays in the viewport.
      this.heights.set(this.block.id, dom.getBoundingClientRect().height);
      const current = studyCodeBlocks(view.state.doc.toString()).find(
        (b) => b.id === this.block.id,
      );
      if (current)
        view.dispatch({
          changes: {
            from: current.from,
            to: current.to,
            insert: codeFence({ ...current, ...patch }),
          },
        });
    };
    const action = (action: BlockAction) => {
      const current = studyCodeBlocks(view.state.doc.toString()).find(
        (b) => b.id === this.block.id,
      );
      if (!current) return;
      if (action === "delete") {
        view.dispatch({
          changes: { from: current.from, to: current.to, insert: "" },
          selection: { anchor: current.from },
          annotations: isolateHistory.of("full"),
          scrollIntoView: true,
        });
        requestAnimationFrame(() => view.focus());
      } else if (action === "save") downloadBlock(current);
      else this.onBlockAction(action, current);
    };
    root.render(
      this.block.language === "module" ? (
        <NoteModule block={this.block} onChange={onChange} onAction={action} />
      ) : this.block.language === "whiteboard" ? (
        <Whiteboard block={this.block} onChange={onChange} onAction={action} />
      ) : (
        <CodeCell
          block={this.block}
          onChat={this.onChat}
          onChange={onChange}
          onAction={action}
        />
      ),
    );
    requestAnimationFrame(() => {
      if (dom.isConnected) view.requestMeasure();
    });
  }
  toDOM(view: EditorView) {
    const dom = document.createElement("div");
    dom.contentEditable = "false";
    dom.className = "code-cell-widget";
    const observer = new ResizeObserver(() => {
      const height = dom.getBoundingClientRect().height;
      if (
        dom.isConnected &&
        height > 0 &&
        this.heights.get(this.block.id) !== height
      ) {
        this.heights.set(this.block.id, height);
        view.requestMeasure();
      }
    });
    observer.observe(dom);
    observers.set(dom, observer);
    this.render(dom, view);
    return dom;
  }
  updateDOM(dom: HTMLElement, view: EditorView, previous: CodeWidget) {
    if (previous.block.id !== this.block.id) return false;
    this.render(dom, view);
    return true;
  }
  destroy(dom: HTMLElement) {
    observers.get(dom)?.disconnect();
    observers.delete(dom);
    const root = roots.get(dom);
    roots.delete(dom);
    queueMicrotask(() => root?.unmount());
  }
  ignoreEvent() {
    return true;
  }
}
export function codeBlockExtension(
  onChat: (text: string) => void,
  onBlockAction: (action: BlockAction, block: StudyCodeBlock) => void,
) {
  const heights = new Map<string, number>();
  const build = (state: EditorState) =>
    Decoration.set(
      studyCodeBlocks(state.doc.toString()).map((block) =>
        Decoration.replace({
          widget: new CodeWidget(block, onChat, onBlockAction, heights),
          block: true,
        }).range(block.from, block.to),
      ),
    );
  return StateField.define<DecorationSet>({
    create: build,
    update: (value, tr) => (tr.docChanged ? build(tr.state) : value),
    provide: (field) => EditorView.decorations.from(field),
  });
}
