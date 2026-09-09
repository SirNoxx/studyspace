import type { Note } from "./model";

export function formatJournalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value + "T12:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return value;
  const day = date.getUTCDate();
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th");
  const month = date.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${month} ${day}${suffix}, ${date.getUTCFullYear()}`;
}

/** Format legacy automatic titles without changing custom titles or stored links. */
export function noteDisplayTitle(
  note: Pick<Note, "title" | "kind" | "journalDate">,
): string {
  if (!note.journalDate) return note.title;
  if (note.kind === "journal" && note.title === note.journalDate)
    return formatJournalDate(note.journalDate);
  if (note.kind === "dream" && note.title === "Dream · " + note.journalDate)
    return "Dream · " + formatJournalDate(note.journalDate);
  return note.title;
}
