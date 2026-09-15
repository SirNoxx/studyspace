import { unified } from "unified";
import english from "retext-english";
import contractions from "retext-contractions";
import articles from "retext-indefinite-article";
import repeated from "retext-repeated-words";
import stringify from "retext-stringify";
export type GrammarIssue = {
  from: number;
  to: number;
  word: string;
  suggestions: string[];
  reason: string;
};
const processor = unified()
  .use(english)
  .use(contractions, { straight: true })
  .use(articles)
  .use(repeated)
  .use(stringify);
export function grammarIssues(text: string): GrammarIssue[] {
  // Retext expects a capital I in first-person contractions. Preserve offsets.
  const normalized = text.replace(/\bi(?=m\b|'(?:m|ve|ll|d)\b|ve\b)/g, "I");
  const issues: GrammarIssue[] = [];
  for (const message of processor.processSync(normalized).messages) {
    const place = message.place;
    if (!place || !("start" in place)) continue;
    const from = place.start.offset,
      to = place.end.offset;
    if (from === undefined || to === undefined || !message.expected?.length)
      continue;
    const suggestions = message.expected.filter(
      (x) => x !== text.slice(from, to),
    );
    if (suggestions.length)
      issues.push({
        from,
        to,
        word: text.slice(from, to),
        suggestions,
        reason: message.reason,
      });
  }
  for (const match of text.matchAll(/\bi(?:['’](?:m|ve|ll|d))?\b/g)) {
    const from = match.index,
      to = from + match[0].length;
    if (!issues.some((x) => x.from === from))
      issues.push({
        from,
        to,
        word: match[0],
        suggestions: ["I" + match[0].slice(1)],
        reason: "Capitalize the first-person pronoun I.",
      });
  }
  return issues.sort((a, b) => a.from - b.from);
}
