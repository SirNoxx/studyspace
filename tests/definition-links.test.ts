import { describe, it, expect } from "vitest";
import {
  definitionLink,
  definitionLinks,
  definitionAttachmentRange,
  includeLinkedDefinitions,
} from "../src/lib/markdown";
import type { Definition } from "../src/lib/model";
const entry: Definition = {
  id: "concept-npm",
  term: "npm (Node Package Manager)",
  aliases: [],
  definition: "Installs and manages JavaScript packages.",
  subjectIds: ["other-collection"],
  createdAt: "",
  updatedAt: "",
};
describe("explicit definition attachments", () => {
  it("links one selected occurrence without adding a global alias", () => {
    const body = "npm first, npm again.";
    const range = definitionAttachmentRange(body, 11, 14);
    const next =
      body.slice(0, range.from) +
      definitionLink("npm", entry.id) +
      body.slice(range.to);
    expect(next).toBe("npm first, [npm](#definition:concept-npm) again.");
    expect(definitionLinks(next)).toHaveLength(1);
    expect(entry.aliases).toEqual([]);
  });
  it("retains identity after a term rename and finds explicitly linked entries from other collections", () => {
    const body = definitionLink("npm", entry.id);
    const renamed = { ...entry, term: "A new name" };
    expect(includeLinkedDefinitions(body, [], [renamed])).toEqual([renamed]);
    expect(includeLinkedDefinitions(body, [renamed], [renamed])).toEqual([
      renamed,
    ]);
    expect(
      includeLinkedDefinitions(body, [], [{ ...renamed, trashed: true }]),
    ).toEqual([]);
  });
  it("escapes labels and never treats examples in code as attached definitions", () => {
    const label = "array[0] * <T> `value`";
    const linked = definitionLink(label, entry.id);
    expect(definitionLinks(linked)[0]?.id).toBe(entry.id);
    expect(
      definitionLinks("`" + definitionLink("npm", entry.id) + "`"),
    ).toEqual([]);
    expect(definitionLinks("```md\n" + linked + "\n```")).toEqual([]);
    expect(() => definitionLink("one\n\ntwo", entry.id)).toThrow(
      /one paragraph/,
    );
  });
  it("reassigns an existing label without nesting links, and rejects partial links or code", () => {
    const body = definitionLink("npm", entry.id);
    expect(definitionAttachmentRange(body, 1, 4)).toEqual({
      from: 0,
      to: body.length,
    });
    expect(() => definitionAttachmentRange(body, 1, 3)).toThrow(
      /existing link/,
    );
    expect(() => definitionAttachmentRange("`npm`", 1, 4)).toThrow(
      /code block/,
    );
    expect(() =>
      definitionAttachmentRange("[npm](https://npmjs.com)", 1, 4),
    ).toThrow(/existing link/);
    expect(() => definitionAttachmentRange("npm", 0, 8)).toThrow(/Highlight/);
  });
});
