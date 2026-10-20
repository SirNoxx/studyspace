import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  saveSpellingWord,
  removeSpellingWord,
  spellingDictionaryWords,
  subscribeSpellingDictionary,
} from "../src/lib/spelling-dictionary";
import { checkSpelling, checkSpellingWords } from "../src/lib/spelling";
describe("personal spelling dictionary", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("persists case-insensitive accepted spellings without calling a worker", async () => {
    saveSpellingWord("Noxx");
    saveSpellingWord("noxx");
    expect(spellingDictionaryWords()).toEqual(["noxx"]);
    expect(await checkSpelling("NOXX")).toEqual({
      correct: true,
      suggestions: [],
    });
    expect(await checkSpellingWords(["Noxx", "noxx"])).toEqual([]);
  });
  it("updates all subscribers and supports removing an accidental addition", () => {
    const callback = vi.fn(),
      unsubscribe = subscribeSpellingDictionary(callback);
    saveSpellingWord("sentnce");
    removeSpellingWord("SENTNCE");
    expect(callback).toHaveBeenCalledTimes(2);
    expect(spellingDictionaryWords()).toEqual([]);
    unsubscribe();
    saveSpellingWord("noxx");
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it("rejects phrases and reports unavailable persistence instead of pretending to save", () => {
    expect(() => saveSpellingWord("two words")).toThrow(/single word/);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw Error("Storage full");
      },
    });
    expect(() => saveSpellingWord("noxx")).toThrow("Storage full");
  });
});
