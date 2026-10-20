import { it, expect } from "vitest";
import dictionary from "dictionary-en";
import { createSpellingEngine } from "../src/lib/spelling-engine";
const engine = createSpellingEngine(
  String(dictionary.aff),
  String(dictionary.dic),
);
it.each([
  ["sentnce", "sentence"],
  ["definately", "definitely"],
  ["accomodashun", "accommodation"],
  ["enviroment", "environment"],
  ["neccessery", "necessary"],
  ["recieve", "receive"],
  ["mispeled", "misspelled"],
  ["becuase", "because"],
  ["knoladge", "knowledge"],
  ["seperatly", "separately"],
  ["understndng", "understanding"],
])("offers %s → %s", (typo, expected) => {
  expect(engine.correct(typo)).toBe(false);
  expect(engine.suggest(typo)).toContain(expected);
});
it("preserves case and accepts ordinary words", () => {
  expect(engine.correct("sentence")).toBe(true);
  expect(engine.suggest("SENTNCE")).toContain("SENTENCE");
  expect(engine.suggest("Sentnce")).toContain("Sentence");
});
