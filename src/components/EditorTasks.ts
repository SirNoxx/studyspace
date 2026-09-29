import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";

/** Space after an otherwise empty task prefix creates a standard Markdown task. */
export function taskShortcut(state: EditorState) {
  if (
    state.readOnly ||
    state.selection.ranges.length !== 1 ||
    !state.selection.main.empty
  )
    return null;
  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  const prefix = state.sliceDoc(line.from, cursor);
  const match = /^([\t ]*(?:>[\t ]*)*)((?:[-+*]|\d+[.)])[\t ]+|-)?\[ ?\]$/.exec(
    prefix,
  );
  if (!match) return null;
  const tree = ensureSyntaxTree(state, cursor, 50);
  if (!tree) return null;
  for (let node = tree.resolveInner(cursor, -1); node; node = node.parent!) {
    if (
      ["FencedCode", "CodeBlock", "CodeText", "InlineCode"].includes(node.name)
    )
      return null;
  }
  const bullet = match[2] || "- ";
  const insert = match[1] + bullet + (/\s$/.test(bullet) ? "" : " ") + "[ ] ";
  return { from: line.from, to: cursor, insert };
}

export function insertTaskShortcut(view: EditorView) {
  if (!view.state.facet(EditorView.editable)) return false;
  const change = taskShortcut(view.state);
  if (!change) return false;
  view.dispatch({
    changes: change,
    selection: { anchor: change.from + change.insert.length },
    userEvent: "input.task-shortcut",
    scrollIntoView: true,
  });
  return true;
}

/** Only real Markdown list items qualify; code examples remain untouched. */
export function taskMarkers(
  state: EditorState,
  from = 0,
  to = state.doc.length,
) {
  const tasks: {
    from: number;
    to: number;
    marker: string;
    checked: boolean;
    label: string;
  }[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (["FencedCode", "CodeBlock"].includes(node.name)) return false;
      if (node.name !== "ListItem") return;
      const line = state.doc.lineAt(node.from);
      const text = state.sliceDoc(node.from, line.to);
      const match = /^(?:[-+*]|\d+[.)])[\t ]+\[([ xX]?)\](?=[\t ]|$)/.exec(
        text,
      );
      if (!match) return;
      tasks.push({
        from: node.from,
        to: node.from + match[0].length,
        marker: match[0],
        checked: /x/i.test(match[1]),
        label: text.slice(match[0].length).trim() || "Untitled task",
      });
    },
  });
  return tasks;
}

type Task = ReturnType<typeof taskMarkers>[number];
class TaskCheckbox extends WidgetType {
  constructor(
    private task: Task,
    private disabled: boolean,
  ) {
    super();
  }
  eq(other: TaskCheckbox) {
    return (
      this.disabled === other.disabled &&
      this.task.from === other.task.from &&
      this.task.to === other.task.to &&
      this.task.marker === other.task.marker &&
      this.task.label === other.task.label
    );
  }
  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-task-control";
    wrapper.contentEditable = "false";
    const input = wrapper.appendChild(document.createElement("input"));
    input.type = "checkbox";
    input.className = "note-task-circle";
    input.checked = this.task.checked;
    input.disabled = this.disabled;
    input.setAttribute("aria-label", this.task.label);
    input.addEventListener("change", () => {
      const { from, to, marker } = this.task;
      if (
        !view.state.facet(EditorView.editable) ||
        view.state.readOnly ||
        view.state.sliceDoc(from, to) !== marker
      )
        return;
      // Change only the marker, preserving the task text, indentation and selection.
      view.dispatch({
        changes: {
          from: from + marker.indexOf("["),
          to,
          insert: input.checked ? "[x]" : "[ ]",
        },
        userEvent: "input.task",
      });
      // Keep keyboard focus on the checkbox after its widget is rebuilt.
      const controls = view.dom.querySelectorAll<HTMLInputElement>(
        ".cm-task-control input",
      );
      for (const control of controls) {
        if (view.posAtDOM(control.parentElement!) === from) {
          control.focus({ preventScroll: true });
          break;
        }
      }
    });
    return wrapper;
  }
  ignoreEvent() {
    return true;
  }
}

function decorations(view: EditorView) {
  return Decoration.set(
    taskMarkers(view.state, view.viewport.from, view.viewport.to)
      .filter(
        (task) =>
          // An auto-closed bracket is still being typed; replacing it would jump the caret.
          !view.state.selection.ranges.some(
            (range) =>
              range.empty && range.head > task.from && range.head < task.to,
          ),
      )
      .map((task) =>
        Decoration.replace({
          widget: new TaskCheckbox(
            task,
            !view.state.facet(EditorView.editable) || view.state.readOnly,
          ),
        }).range(task.from, task.to),
      ),
    true,
  );
}

export const taskListExtension = [
  ViewPlugin.fromClass(
    class {
      decorations;
      constructor(view: EditorView) {
        this.decorations = decorations(view);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = decorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.decorations ?? Decoration.none,
        ),
    },
  ),
  EditorView.baseTheme({
    ".cm-task-control": {
      display: "inline-flex",
      verticalAlign: "middle",
      alignItems: "center",
      marginRight: ".35em",
    },
    ".cm-task-control input": {
      appearance: "none",
      width: "16px",
      height: "16px",
      padding: "0",
      margin: "0",
      cursor: "pointer",
      accentColor: "var(--accent)",
    },
    ".cm-task-control input:focus-visible": {
      outline: "2px solid var(--accent)",
      outlineOffset: "3px",
    },
    ".cm-task-control input:disabled": { cursor: "default" },
  }),
];
