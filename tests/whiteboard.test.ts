import { expect, it } from "vitest";
import { codeFence, studyCodeBlocks } from "../src/lib/code-blocks";
import {
  emptyBoard,
  parseBoard,
  strokeHit,
  type BoardStroke,
} from "../src/lib/whiteboard";
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
