import { expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { headingSections } from "../src/components/EditorHeadingFolds";

function sections(doc: string) {
  return headingSections(
    EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
    }),
  ).map((s) => ({ title: s.title, hidden: doc.slice(s.from, s.to) }));
}

it("stops at equal or higher ranked headings and includes all subordinate headings", () => {
  expect(
    sections(
      "# First\nintro\n## Child\nchild text\n### Detail\ndetail text\n## Peer\npeer text\n# Second\nlast text",
    ),
  ).toEqual([
    {
      title: "First",
      hidden:
        "\nintro\n## Child\nchild text\n### Detail\ndetail text\n## Peer\npeer text",
    },
    { title: "Child", hidden: "\nchild text\n### Detail\ndetail text" },
    { title: "Detail", hidden: "\ndetail text" },
    { title: "Peer", hidden: "\npeer text" },
    { title: "Second", hidden: "\nlast text" },
  ]);
});
it("ignores heading examples in fences and preserves setext headings", () => {
  expect(
    sections("Title\n=====\n```md\n# Example only\n```\n\nNext\n----\nbody"),
  ).toEqual([
    {
      title: "Title",
      hidden: "\n```md\n# Example only\n```\n\nNext\n----\nbody",
    },
    { title: "Next", hidden: "\nbody" },
  ]);
});
it("does not offer to fold an empty section or ordinary bold text", () => {
  expect(sections("# Empty\n# Also empty\n\n**Not a heading**")).toEqual([
    { title: "Also empty", hidden: "\n\n**Not a heading**" },
  ]);
});

it("finds complete section boundaries even before the editor's background parser runs", () => {
  const doc =
    "# First\n" +
    "Long paragraph in the first section.\n\n".repeat(2000) +
    "# Second\nKeep this separate.";
  // No language extension or completed background parse is needed to show the arrows.
  const state = EditorState.create({ doc });
  const sections = headingSections(state);
  expect(sections.map((s) => s.title)).toEqual(["First", "Second"]);
  expect(sections[0].to).toBeLessThan(doc.indexOf("# Second"));
  expect(headingSections(state)).toBe(sections);
});
