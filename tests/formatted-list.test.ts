import { describe, expect, it } from "vitest";
import { editList, listPosition, listText } from "../src/lib/formatted-list";
import { pictureSource } from "../src/lib/picture-source";

describe("continuous formatted lists", () => {
  const items = [
    { text: "First\ncontinuation", done: true },
    { text: "Second", done: false },
    { text: "Third", done: true },
  ];
  it("keeps existing multiline entries and completion when editing another item", () => {
    expect(
      editList(items, listText(items).replace("Second", "Second edited")),
    ).toEqual([items[0], { text: "Second edited", done: false }, items[2]]);
  });
  it("pastes multiple entries and retains unaffected completion", () => {
    expect(
      editList(items, listText(items).replace("Second", "New\nMore")),
    ).toEqual([
      items[0],
      { text: "New", done: false },
      { text: "More", done: false },
      items[2],
    ]);
  });
  it("cuts across item boundaries without losing the remaining text", () => {
    expect(editList(items, "First\ncontinuation\nThird")).toEqual([
      items[0],
      items[2],
    ]);
  });
  it("keeps the final item addressable and handles empty lists", () => {
    expect(listPosition(items, listText(items).length).index).toBe(2);
    expect(editList([], "New")).toEqual([{ text: "New", done: false }]);
  });
  it("uses the actual selection to disambiguate repeated entries", () => {
    const repeated = [
      { text: "Same", done: false },
      { text: "Same", done: true },
    ];
    expect(editList(repeated, "Same", { from: 0, to: 5 })).toEqual([
      repeated[1],
    ]);
    expect(editList(repeated, "Same", { from: 4, to: 9 })).toEqual([
      repeated[0],
    ]);
  });
  it("inserts before completed entries without transferring their check mark", () => {
    expect(editList([{ text: "Done", done: true }], "New\nDone")).toEqual([
      { text: "New", done: false },
      { text: "Done", done: true },
    ]);
  });
  it("rejects overflow rather than dropping pasted content", () => {
    expect(editList([], Array(101).fill("Entry").join("\n"))).toBeNull();
    expect(editList([], "a".repeat(20001))).toBeNull();
  });
});
describe("picture deletion targets", () => {
  const image = "![Photo](attachment:example)";
  it("finds the selected occurrence, after a hidden frontmatter prefix", () => {
    const shown = `${image}\n\n${image}`;
    const body = `---\ntitle: hello\n---\n${shown}`;
    const hit = pictureSource(body, shown, image.length + 2, shown.length)!;
    expect(body.slice(0, hit.from) + body.slice(hit.to)).toBe(
      `---\ntitle: hello\n---\n${image}\n\n`,
    );
  });
  it("does not delete code examples or ambiguous embedded pictures", () => {
    expect(
      pictureSource(`\`\`\`\n${image}\n\`\`\``, image, 0, image.length),
    ).toBeUndefined();
    expect(
      pictureSource(image, image + "\n" + image, 0, image.length),
    ).toBeUndefined();
  });
});
