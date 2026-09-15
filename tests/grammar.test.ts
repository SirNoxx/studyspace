import { describe, it, expect } from "vitest";
import { grammarIssues } from "../src/lib/grammar-engine";
describe("local English grammar", () => {
  it("offers the capitalized contraction for im and preserves offsets", () => {
    const text = "Today im learning and i don't mind.";
    const issues = grammarIssues(text);
    expect(issues.find((i) => i.word === "im")?.suggestions).toContain("I'm");
    for (const issue of issues)
      expect(text.slice(issue.from, issue.to)).toBe(issue.word);
    expect(issues.find((i) => i.word === "i")?.suggestions).toEqual(["I"]);
  });
  it("handles apostrophes, articles and repeated words without rewriting text", () => {
    const issues = grammarIssues("I dont want a apple with the the orange.");
    expect(issues.find((i) => i.word === "dont")?.suggestions).toContain(
      "don't",
    );
    expect(issues.find((i) => i.word === "a")?.suggestions).toContain("an");
    expect(issues.find((i) => i.word === "the the")?.suggestions).toEqual([
      "the",
    ]);
    expect(
      grammarIssues("I'm ready. I have an apple and a university degree."),
    ).toEqual([]);
  });
});
