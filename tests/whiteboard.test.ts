import { expect, it } from "vitest";
import { codeFence, studyCodeBlocks } from "../src/lib/code-blocks";
import {
  emptyBoard,
  parseBoard,
  strokeHit,
  textBox,
  wrapBoardText,
  type BoardStroke,
} from "../src/lib/whiteboard";
it("preserves portrait framing and opens legacy drawings in desktop mode", () => {
  expect(parseBoard(JSON.stringify(emptyBoard()))?.viewMode).toBeUndefined();
  expect(
    parseBoard(JSON.stringify({ ...emptyBoard(), viewMode: "mobile" }))
      ?.viewMode,
  ).toBe("mobile");
  expect(
    parseBoard(JSON.stringify({ ...emptyBoard(), viewMode: "desktop" }))
      ?.viewMode,
  ).toBe("desktop");
  expect(
    parseBoard(JSON.stringify({ ...emptyBoard(), viewMode: "invalid" })),
  ).toBeNull();
});
it("round trips code titles without allowing title text to break a Markdown fence", () => {
  const block = {
    id: "cell",
    language: "javascript",
    code: "console.log(42);",
    collapsed: true,
    title: 'Example: "hello" 🧠\n```',
  };
  const body = codeFence(block);
  expect(studyCodeBlocks(body)[0]).toMatchObject(block);
  expect(body.split("\n")).toHaveLength(3);
});
it("preserves text box content and styles, validates dimensions, and hits the resized box", () => {
  const text: BoardStroke = {
    id: "text",
    tool: "text",
    text: "Hello\nworld 🧠",
    color: "#2563eb",
    width: 24,
    points: [[100, 100]],
    boxWidth: 200,
    boxHeight: 90,
    bold: true,
    italic: true,
  };
  const saved = JSON.stringify({ ...emptyBoard(), strokes: [text] });
  expect(parseBoard(saved)?.strokes[0]).toEqual(text);
  expect(strokeHit(text, [290, 180], 0)).toBe(true);
  expect(strokeHit(text, [310, 180], 0)).toBe(false);
  for (const patch of [
    { boxWidth: -1 },
    { boxHeight: 10001 },
    { bold: "yes" },
    { italic: 1 },
  ]) {
    expect(
      parseBoard(
        JSON.stringify({ ...emptyBoard(), strokes: [{ ...text, ...patch }] }),
      ),
    ).toBeNull();
  }
  const legacy = { ...text, boxWidth: undefined, boxHeight: undefined };
  expect(textBox(legacy).y).toBe(76);
  expect(
    parseBoard(JSON.stringify({ ...emptyBoard(), strokes: [legacy] })),
  ).not.toBeNull();
});
it("wraps text at words and preserves blank lines and Unicode when breaking long words", () => {
  const measure = (s: string) => [...s].length;
  expect(wrapBoardText("One two three\n\nfour", 7, measure)).toEqual([
    "One two",
    "three",
    "",
    "four",
  ]);
  expect(wrapBoardText("🧠🧠🧠🧠🧠", 2, measure)).toEqual([
    "🧠🧠",
    "🧠🧠",
    "🧠",
  ]);
});
it("keeps existing untitled code blocks readable", () => {
  expect(
    studyCodeBlocks(
      "```javascript studyspace:old collapsed\nreturn 1;\n```",
    )[0],
  ).toMatchObject({ id: "old", code: "return 1;", collapsed: true });
});
it("rejects malformed drawing data while accepting saved strokes", () => {
  const data = {
    ...emptyBoard(),
    strokes: [
      {
        id: "line",
        tool: "pen",
        points: [
          [10, 10],
          [100, 100],
        ],
        color: "#2563eb",
        width: 4,
      },
    ],
  };
  expect(parseBoard(JSON.stringify(data))).toEqual(data);
  expect(parseBoard("not JSON")).toBeNull();
  expect(
    parseBoard(
      JSON.stringify({
        ...data,
        strokes: [{ ...data.strokes[0], color: "url(https://external.test)" }],
      }),
    ),
  ).toBeNull();
  expect(
    parseBoard(
      JSON.stringify({
        ...data,
        strokes: [{ ...data.strokes[0], points: [[NaN, 2]] }],
      }),
    ),
  ).toBeNull();
});
it("erases strokes and shape edges without erasing the empty interior", () => {
  const stroke: BoardStroke = {
    id: "r",
    tool: "rectangle",
    points: [
      [10, 10],
      [100, 100],
    ],
    color: "#2563eb",
    width: 4,
  };
  expect(strokeHit(stroke, [10, 50], 4)).toBe(true);
  expect(strokeHit(stroke, [50, 50], 4)).toBe(false);
  expect(
    strokeHit({ ...stroke, tool: "pen", points: [[20, 20]] }, [22, 20], 4),
  ).toBe(true);
});
