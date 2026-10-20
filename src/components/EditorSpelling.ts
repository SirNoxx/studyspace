import { subscribeSpellingDictionary } from "@/lib/spelling-dictionary";
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  checkSpellingWords,
  checkGrammar,
  isSpellingWord,
} from "@/lib/spelling";

import type { GrammarIssue } from "@/lib/grammar-engine";
const grammarResults = StateEffect.define<GrammarIssue[]>();
const grammarState = StateField.define<GrammarIssue[]>({
  create: () => [],
  update(value, transaction) {
    value = value
      .filter(
        (issue) => !transaction.changes.touchesRange(issue.from, issue.to),
      )
      .map((issue) => ({
        ...issue,
        from: transaction.changes.mapPos(issue.from, 1),
        to: transaction.changes.mapPos(issue.to, -1),
      }));
    for (const effect of transaction.effects)
      if (effect.is(grammarResults)) value = effect.value;
    return value;
  },
});
export function grammarAtPosition(state: EditorState, position: number) {
  return state
    .field(grammarState, false)
    ?.find((issue) => position >= issue.from && position <= issue.to);
}
const spellingMarks = StateEffect.define<DecorationSet>();
const marks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    // Keep all other underlines while a correction changes the document or focus.
    value = value.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(spellingMarks)) value = effect.value;
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const underline = Decoration.mark({ class: "cm-spelling-error" });
const scanner = ViewPlugin.fromClass(
  class {
    timer?: ReturnType<typeof setTimeout>;
    generation = 0;
    destroyed = false;
    unsubscribe: () => void;
    constructor(readonly view: EditorView) {
      this.unsubscribe = subscribeSpellingDictionary(() => this.schedule());
      this.schedule();
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) this.schedule();
    }
    schedule() {
      clearTimeout(this.timer);
      const generation = ++this.generation;
      this.timer = setTimeout(() => void this.check(generation), 180);
    }
    async check(generation: number) {
      const { view } = this,
        doc = view.state.doc;
      const candidates: { from: number; to: number; word: string }[] = [];
      for (const range of view.visibleRanges) {
        const tree = ensureSyntaxTree(view.state, range.to, 25);
        if (!tree) continue;
        for (const match of doc
          .sliceString(range.from, range.to)
          .matchAll(/[a-zA-Z]+(?:['’][a-zA-Z]+)*/g)) {
          if (!isSpellingWord(match[0])) continue;
          const from = range.from + match.index!,
            to = from + match[0].length;
          let node: ReturnType<typeof tree.resolveInner> | null =
              tree.resolveInner(from, 1),
            skip = false;
          while (node) {
            if (
              [
                "FencedCode",
                "CodeBlock",
                "CodeText",
                "InlineCode",
                "URL",
                "Autolink",
                "HTMLBlock",
                "HTMLTag",
              ].includes(node.name)
            ) {
              skip = true;
              break;
            }
            node = node.parent;
          }
          if (!skip) candidates.push({ from, to, word: match[0] });
          if (candidates.length >= 3000) break;
        }
        if (candidates.length >= 3000) break;
      }
      try {
        const start = candidates.length
          ? doc.lineAt(candidates[0].from).from
          : 0;
        const end = candidates.length
          ? Math.min(
              doc.lineAt(candidates[candidates.length - 1].to).to,
              start + 50000,
            )
          : 0;
        // Only prose enters the grammar checker: blank out code and link destinations.
        const prose = doc.sliceString(start, end).split("");
        const tree = ensureSyntaxTree(view.state, end, 25);
        tree?.iterate({
          from: start,
          to: end,
          enter(node) {
            if (
              [
                "FencedCode",
                "CodeBlock",
                "CodeText",
                "InlineCode",
                "URL",
                "Autolink",
                "HTMLBlock",
                "HTMLTag",
              ].includes(node.name)
            ) {
              for (
                let i = Math.max(start, node.from);
                i < Math.min(end, node.to);
                i++
              )
                prose[i - start] = " ";
              return false;
            }
          },
        });
        const [misspellings, rawGrammar] = await Promise.all([
          checkSpellingWords([...new Set(candidates.map((c) => c.word))]),
          checkGrammar(prose.join("")),
        ]);
        const incorrect = new Set(misspellings);
        const grammar = rawGrammar.map((issue) => ({
          ...issue,
          from: issue.from + start,
          to: issue.to + start,
        }));
        if (
          this.destroyed ||
          generation !== this.generation ||
          view.state.doc !== doc
        )
          return;
        view.dispatch({
          effects: [
            grammarResults.of(grammar),
            spellingMarks.of(
              Decoration.set(
                candidates
                  .filter(
                    (c) =>
                      incorrect.has(c.word) &&
                      !grammar.some((g) => g.from < c.to && g.to > c.from),
                  )
                  .map((c) => underline.range(c.from, c.to))
                  .concat(
                    grammar.map((g) =>
                      Decoration.mark({
                        class: "cm-grammar-error",
                        attributes: { title: g.reason },
                      }).range(g.from, g.to),
                    ),
                  ),
                true,
              ),
            ),
          ],
        });
      } catch {
        // Retain existing marks if the local dictionary isn't available yet.
      }
    }
    destroy() {
      this.destroyed = true;
      this.unsubscribe();
      clearTimeout(this.timer);
    }
  },
);
export const spellingExtension = [marks, grammarState, scanner];
