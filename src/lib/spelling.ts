import {
  spellingDictionaryWords,
  normalizeSpellingWord,
  isSpellingWord,
} from "./spelling-dictionary";
import type { GrammarIssue } from "./grammar-engine";
export type SpellingResult = {
  correct: boolean;
  suggestions: string[];
  incorrect?: string[];
  issues?: GrammarIssue[];
  grammar?: boolean;
};
export { isSpellingWord } from "./spelling-dictionary";
export function wordAtPosition(text: string, position: number) {
  const pattern = /[a-zA-Z]+(?:['’][a-zA-Z]+)*/g;
  for (const match of text.matchAll(pattern)) {
    const from = match.index!,
      to = from + match[0].length;
    if (position >= from && position <= to && isSpellingWord(match[0]))
      return { from, to, word: match[0] };
  }
  return null;
}
let worker: Worker | undefined,
  sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (value: SpellingResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function reset(message: string) {
  worker?.terminate();
  worker = undefined;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(Error(message));
  }
  pending.clear();
}
export function checkSpelling(word: string): Promise<SpellingResult> {
  if (
    !isSpellingWord(word) ||
    spellingDictionaryWords().includes(normalizeSpellingWord(word))
  )
    return Promise.resolve({ correct: true, suggestions: [] });
  return requestSpelling({ word });
}
export async function checkSpellingWords(words: string[]): Promise<string[]> {
  const accepted = new Set(spellingDictionaryWords());
  const pending = words.filter(
    (word) => !accepted.has(normalizeSpellingWord(word)),
  );
  if (!pending.length) return [];
  return (await requestSpelling({ words: pending })).incorrect ?? [];
}
export async function checkGrammar(text: string): Promise<GrammarIssue[]> {
  return (await requestSpelling({ text })).issues ?? [];
}
function requestSpelling(
  query: { word: string } | { words: string[] } | { text: string },
): Promise<SpellingResult> {
  if (!worker) {
    worker = new Worker("/spelling/worker.js");
    worker.onmessage = (
      event: MessageEvent<SpellingResult & { id: number; error?: string }>,
    ) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(event.data.id);
      if (event.data.error) entry.reject(Error(event.data.error));
      else entry.resolve(event.data);
    };
    worker.onerror = () =>
      reset("Spelling suggestions are unavailable. Please retry.");
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(
      () => reset("Spelling suggestions took too long. Please retry."),
      8000,
    );
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, ...query });
  });
}
