import { grammarIssues } from "./grammar-engine";
import { createSpellingEngine } from "./spelling-engine";
let dictionary: Promise<ReturnType<typeof createSpellingEngine>> | undefined;
function load() {
  return (dictionary ??= Promise.all(
    ["index.aff", "index.dic"].map(async (file) => {
      const response = await fetch("/spelling/" + file, {
        cache: "force-cache",
      });
      if (!response.ok) throw Error("Spelling dictionary unavailable");
      return response.text();
    }),
  )
    .then(([aff, dic]) => createSpellingEngine(aff, dic))
    .catch((error) => {
      dictionary = undefined;
      throw error;
    }));
}
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    word: string;
    words?: string[];
    text?: string;
  }>,
) => {
  const { id, word } = event.data;
  if (typeof event.data.text === "string") {
    try {
      self.postMessage({
        id,
        correct: true,
        suggestions: [],
        issues: grammarIssues(event.data.text.slice(0, 50000)),
      });
    } catch {
      self.postMessage({
        id,
        error: "Grammar checking is unavailable. Please retry.",
      });
    }
    return;
  }
  if (Array.isArray(event.data.words)) {
    try {
      const spell = await load();
      const incorrect = event.data.words
        .slice(0, 3000)
        .filter(
          (w) =>
            typeof w === "string" &&
            w.length <= 48 &&
            /^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/.test(w) &&
            !spell.correct(w.replaceAll("’", "'")),
        );
      self.postMessage({ id, correct: false, suggestions: [], incorrect });
    } catch {
      self.postMessage({ id, error: "Spelling dictionary unavailable" });
    }
    return;
  }
  if (
    typeof word !== "string" ||
    word.length > 48 ||
    !/^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/.test(word)
  ) {
    self.postMessage({ id, correct: true, suggestions: [] });
    return;
  }
  try {
    const spell = await load();
    const normalized = word.replaceAll("’", "'");
    const grammar = grammarIssues(normalized).filter(
      (x) => x.from === 0 && x.to === normalized.length,
    );
    const corrections = grammar.flatMap((x) => x.suggestions);
    const correct = !corrections.length && spell.correct(normalized);
    self.postMessage({
      id,
      correct,
      suggestions: correct
        ? []
        : [...new Set([...corrections, ...spell.suggest(normalized)])].slice(
            0,
            8,
          ),
      grammar: !!corrections.length,
    });
  } catch {
    self.postMessage({
      id,
      error:
        "Spelling suggestions are unavailable. Try again when the dictionary has loaded.",
    });
  }
};
