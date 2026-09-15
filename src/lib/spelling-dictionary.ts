export const isSpellingWord = (word: string) =>
  word.length <= 48 && /^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/.test(word);
const key = "studyspace:spelling-dictionary:v1";
const changed = "studyspace:spelling-dictionary-changed";
export function normalizeSpellingWord(word: string) {
  return word.trim().replaceAll("’", "'").toLowerCase();
}
export function spellingDictionaryWords(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const words: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(words)
      ? [
          ...new Set(
            words
              .filter(
                (word): word is string =>
                  typeof word === "string" && isSpellingWord(word),
              )
              .map(normalizeSpellingWord),
          ),
        ].sort()
      : [];
  } catch {
    return [];
  }
}
export function saveSpellingWord(word: string) {
  word = normalizeSpellingWord(word);
  if (!isSpellingWord(word))
    throw Error("Select a single word to add to the spelling dictionary.");
  const words = [...new Set([...spellingDictionaryWords(), word])].sort();
  localStorage.setItem(key, JSON.stringify(words));
  window.dispatchEvent(new Event(changed));
}
export function removeSpellingWord(word: string) {
  localStorage.setItem(
    key,
    JSON.stringify(
      spellingDictionaryWords().filter(
        (item) => item !== normalizeSpellingWord(word),
      ),
    ),
  );
  window.dispatchEvent(new Event(changed));
}
export function subscribeSpellingDictionary(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  window.addEventListener(changed, listener);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", storage);
  };
}
