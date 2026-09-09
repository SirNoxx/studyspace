import { expect, it } from "vitest";
import { formatJournalDate, noteDisplayTitle } from "../src/lib/journal-date";
it("formats calendar dates without shifting days and handles ordinal exceptions", () => {
  for (const [day, suffix] of [
    [1, "st"],
    [2, "nd"],
    [3, "rd"],
    [9, "th"],
    [11, "th"],
    [12, "th"],
    [13, "th"],
    [21, "st"],
    [22, "nd"],
    [23, "rd"],
    [31, "st"],
  ] as const)
    expect(formatJournalDate(`2026-01-${String(day).padStart(2, "0")}`)).toBe(
      `January ${day}${suffix}, 2026`,
    );
  expect(formatJournalDate("2026-09-09")).toBe("September 9th, 2026");
  expect(formatJournalDate("2024-02-29")).toBe("February 29th, 2024");
  expect(formatJournalDate("2026-02-29")).toBe("2026-02-29");
});
it("formats legacy journal titles but preserves custom titles and ordinary notes", () => {
  expect(
    noteDisplayTitle({
      title: "2026-09-09",
      journalDate: "2026-09-09",
      kind: "journal",
    }),
  ).toBe("September 9th, 2026");
  expect(
    noteDisplayTitle({
      title: "A good day",
      journalDate: "2026-09-09",
      kind: "journal",
    }),
  ).toBe("A good day");
  expect(noteDisplayTitle({ title: "2026-09-09", kind: "note" })).toBe(
    "2026-09-09",
  );
});
