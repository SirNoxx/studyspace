import {
  codeFolding,
  foldedRanges,
  foldEffect,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorState, Text } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from "@codemirror/view";

type HeadingSection = {
  heading: number;
  from: number;
  to: number;
  title: string;
};
const sectionCache = new WeakMap<Text, HeadingSection[]>();

/** A heading owns following siblings until a heading of equal or greater rank. */
export function headingSections(state: EditorState) {
  const cached = sectionCache.get(state.doc);
  if (cached) return cached;
  const sections: HeadingSection[] = [];
  // The editor's viewport parser may stop before EOF. Folding must always see
  // the next peer heading, even when that heading is outside the parsed viewport.
  // Cache by immutable document so selection, scrolling and mode changes are cheap.
  const tree = markdownLanguage.parser.parse(state.doc.toString());
  tree.iterate({
    enter(ref) {
      if (["FencedCode", "CodeBlock"].includes(ref.name)) return false;
      const level = /^(?:ATX|Setext)Heading([1-6])$/.exec(ref.name);
      if (!level) return;
      const heading = ref.node;
      let last = heading;
      for (let next = heading.nextSibling; next; next = next.nextSibling) {
        const nextLevel = /^(?:ATX|Setext)Heading([1-6])$/.exec(next.name);
        if (nextLevel && Number(nextLevel[1]) <= Number(level[1])) break;
        last = next;
      }
      const from = state.doc.lineAt(heading.to).to;
      if (last.to <= from) return;
      sections.push({
        heading: heading.from,
        from,
        to: last.to,
        title:
          state.doc
            .lineAt(heading.from)
            .text.replace(/^\s{0,3}#{1,6}\s+/, "")
            .replace(/\s+#+\s*$/, "")
            .trim() || "Untitled section",
      });
    },
  });
  sectionCache.set(state.doc, sections);
  return sections;
}

type Section = ReturnType<typeof headingSections>[number];
function foldedSection(state: EditorState, from: number) {
  let range: { from: number; to: number } | undefined;
  foldedRanges(state).between(from, from, (start, end) => {
    if (start === from) range = { from: start, to: end };
  });
  return range;
}

class HeadingArrow extends WidgetType {
  constructor(
    private section: Section,
    private collapsed: boolean,
  ) {
    super();
  }
  eq(other: HeadingArrow) {
    return (
      this.section.heading === other.section.heading &&
      this.section.from === other.section.from &&
      this.section.to === other.section.to &&
      this.section.title === other.section.title &&
      this.collapsed === other.collapsed
    );
  }
  toDOM(view: EditorView) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-heading-arrow";
    button.contentEditable = "false";
    button.dataset.headingFrom = String(this.section.heading);
    button.setAttribute("aria-expanded", String(!this.collapsed));
    button.setAttribute(
      "aria-label",
      `${this.collapsed ? "Expand" : "Collapse"} ${this.section.title}`,
    );
    button.title = button.getAttribute("aria-label")!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", this.collapsed ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.75");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    button.appendChild(svg);
    button.addEventListener("click", () => {
      const section = headingSections(view.state).find(
        (s) => s.heading === this.section.heading,
      );
      if (!section) return;
      const folded = foldedSection(view.state, section.from);
      view.dispatch({
        effects: folded
          ? unfoldEffect.of(folded)
          : foldEffect.of({ from: section.from, to: section.to }),
      });
      view.dom
        .querySelector<HTMLButtonElement>(
          `[data-heading-from="${section.heading}"]`,
        )
        ?.focus({ preventScroll: true });
    });
    return button;
  }
  ignoreEvent() {
    return true;
  }
}

function arrows(view: EditorView) {
  return Decoration.set(
    headingSections(view.state)
      .filter(
        (section) =>
          section.heading >= view.viewport.from &&
          section.heading <= view.viewport.to,
      )
      .map((section) =>
        Decoration.widget({
          widget: new HeadingArrow(
            section,
            !!foldedSection(view.state, section.from),
          ),
          side: -1,
        }).range(section.heading),
      ),
    true,
  );
}

export const headingFoldExtension = [
  codeFolding({
    placeholderDOM(_view, expand) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-foldPlaceholder";
      button.textContent = "…";
      button.setAttribute("aria-label", "Expand folded section");
      button.title = "Expand folded section";
      button.addEventListener("click", expand);
      return button;
    },
  }),
  ViewPlugin.fromClass(
    class {
      decorations;
      constructor(view: EditorView) {
        this.decorations = arrows(view);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state) ||
          foldedRanges(update.startState) !== foldedRanges(update.state)
        )
          this.decorations = arrows(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
  EditorView.baseTheme({
    ".cm-heading-arrow": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      width: "24px",
      height: "24px",
      padding: "0",
      marginRight: "4px",
      border: "0",
      borderRadius: "5px",
      color: "var(--muted)",
      background: "transparent",
      cursor: "pointer",
    },
    ".cm-heading-arrow:hover": {
      background: "var(--accent-soft)",
      color: "var(--text)",
    },
    ".cm-heading-arrow:focus-visible, .cm-foldPlaceholder:focus-visible": {
      outline: "2px solid var(--accent)",
      outlineOffset: "2px",
    },
    ".cm-foldPlaceholder": {
      marginLeft: "8px",
      padding: "0 6px",
      border: "1px solid var(--border)",
      borderRadius: "5px",
      color: "var(--muted)",
      background: "var(--accent-soft)",
      cursor: "pointer",
    },
  }),
];
