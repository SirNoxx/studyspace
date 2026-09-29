import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { taskMarkers, taskShortcut } from "../src/components/EditorTasks";

const tasks = (doc: string) =>
  taskMarkers(
    EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
    }),
  );

describe("note task lists", () => {
  it("expands each Space shortcut and preserves following text and indentation", () => {
    for (const prefix of [
      "[]",
      "[ ]",
      "- []",
      "- [ ]",
      "-[]",
      "-[ ]",
      "  -[]",
      "  - []",
      "> []",
    ]) {
      const state = EditorState.create({
        doc: prefix + "Existing text",
        selection: { anchor: prefix.length },
        extensions: [markdown({ base: markdownLanguage })],
      });
      const change = taskShortcut(state)!;
      expect(change).not.toBeNull();
      expect(state.update({ changes: change }).state.doc.toString()).toBe(
        (prefix.startsWith("  ") ? "  " : prefix.startsWith(">") ? "> " : "") +
          "- [ ] Existing text",
      );
    }
  });
  it("does not expand shortcuts in code or inline prose", () => {
    for (const doc of ["```md\n[]", "    []", "Example []", "`[]", "\\[\\]"]) {
      const state = EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [markdown({ base: markdownLanguage })],
      });
      expect(taskShortcut(state)).toBeNull();
    }
  });
  it("recognizes pasted lists, compact markers, nested and completed tasks", () => {
    const doc =
      "## Launch\n\n- [ ] Build installers\n- [] Verify updates\n  - [x] Test upgrades\n  - [X] Preserve notes\n- [ ] Write support\n  documentation.\n> - [ ] Quoted task\n\n1. [ ] Numbered task";
    const result = tasks(doc);
    expect(result.map((t) => [t.label, t.checked])).toEqual([
      ["Build installers", false],
      ["Verify updates", false],
      ["Test upgrades", true],
      ["Preserve notes", true],
      ["Write support", false],
      ["Quoted task", false],
      ["Numbered task", false],
    ]);
    for (const task of result)
      expect(doc.slice(task.from, task.to)).toBe(task.marker);
  });
  it("leaves literal examples, links and ordinary lists alone", () => {
    expect(
      tasks(
        "```md\n- [ ] Code sample\n```\n\n    - [] Indented code\n\nText - [ ] inline\n\n- [label](https://example.com)\n- ordinary list\n- `[ ]` example\n- [](/link)\n- [ ]Actual link\n",
      ),
    ).toEqual([]);
  });
  it("recognizes an empty task ready to type into", () => {
    expect(tasks("- [ ] ")[0]?.checked).toBe(false);
    expect(tasks("- [] ")[0]?.checked).toBe(false);
  });
});
