"use client";
import { useEffect, useState } from "react";
import {
  spellingDictionaryWords,
  removeSpellingWord,
  subscribeSpellingDictionary,
} from "@/lib/spelling-dictionary";
export default function SpellingDictionarySettings() {
  const [words, setWords] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () => setWords(spellingDictionaryWords());
    update();
    return subscribeSpellingDictionary(update);
  }, []);
  return (
    <section
      className="spelling-dictionary-settings"
      aria-label="Spelling dictionary"
    >
      <h3>Spelling dictionary</h3>
      <p className="muted">
        Words you accept on this device, across your notes. These stop spelling
        warnings and do not create study definitions. Right-click a misspelled
        word to add it here.
      </p>
      {error && <p role="alert">{error}</p>}
      {!words.length ? (
        <p className="muted">No custom spelling words yet.</p>
      ) : (
        <ul>
          {words.map((word) => (
            <li key={word}>
              <span>{word}</span>
              <button
                type="button"
                aria-label={"Remove spelling word " + word}
                onClick={() => {
                  try {
                    removeSpellingWord(word);
                    setError("");
                  } catch {
                    setError(
                      "Could not update the spelling dictionary. Please retry.",
                    );
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
