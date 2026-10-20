"use client";
import { useEffect, useState } from "react";
import {
  saveSpellingWord,
  subscribeSpellingDictionary,
} from "@/lib/spelling-dictionary";
import { isSpellingWord } from "@/lib/spelling";
import { checkSpelling, type SpellingResult } from "@/lib/spelling";
export default function SpellingSuggestions({
  word,
  onReplace,
  grammar,
  onAccept,
}: {
  word: string;
  onAccept?: () => void;
  grammar?: { suggestions: string[]; reason: string };
  onReplace: (replacement: string) => void;
}) {
  const [result, setResult] = useState<SpellingResult | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(
    () => subscribeSpellingDictionary(() => setAttempt((n) => n + 1)),
    [],
  );
  useEffect(() => {
    let active = true;
    setResult(null);
    setError("");
    (grammar
      ? Promise.resolve({
          correct: false,
          suggestions: grammar.suggestions,
          grammar: true,
        })
      : checkSpelling(word)
    )
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [word, attempt, grammar]);
  if (result?.correct) return null;
  return (
    <div
      className="spelling-suggestions"
      role="group"
      aria-label={
        result?.grammar ? "Grammar suggestions" : "Spelling suggestions"
      }
    >
      <div className="menu-info">
        {result?.grammar ? "Grammar" : "Spelling"} · English
      </div>
      {grammar && <p className="grammar-reason">{grammar.reason}</p>}
      {error ? (
        <>
          <p role="status">{error}</p>
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry spelling check
          </button>
        </>
      ) : !result ? (
        <p role="status">Checking spelling…</p>
      ) : result.suggestions.length ? (
        result.suggestions.map((suggestion) => (
          <button
            role="menuitem"
            className="menu-item"
            key={suggestion}
            onClick={() => onReplace(suggestion)}
          >
            {suggestion}
          </button>
        ))
      ) : (
        <p role="status">No suggestions for “{word}”.</p>
      )}
      {!grammar && !result?.grammar && isSpellingWord(word) && (
        <button
          role="menuitem"
          className="menu-item"
          title="Accept this spelling on this device. Does not create a study definition."
          onClick={() => {
            try {
              saveSpellingWord(word);
              onAccept?.();
            } catch {
              setError("Could not save this spelling word. Please retry.");
            }
          }}
        >
          Add to spelling dictionary
        </button>
      )}
      <div role="separator" className="menu-separator" />
    </div>
  );
}
