import { expect, it } from "vitest";
import { codeFence, studyCodeBlocks } from "../src/lib/code-blocks";
import { youtubeVideoId, noteStudyText } from "../src/lib/transcripts";

it("preserves code containing fences and ignores nested example blocks", () => {
  const block = {
    id: "cell-1",
    language: "javascript",
    code: 'const text = "```";\nconsole.log(text);',
    collapsed: true,
  };
  const text = "Before\n" + codeFence(block) + "\nAfter";
  expect(studyCodeBlocks(text)).toEqual([
    { ...block, from: 7, to: text.length - 6 },
  ]);
  expect(
    studyCodeBlocks("`````markdown\n" + codeFence(block) + "\n`````\n"),
  ).toEqual([]);
});
it("accepts only canonical YouTube hosts and video IDs", () => {
  for (const input of [
    "https://youtu.be/abcdefghijk?t=2",
    "https://youtube.com/shorts/abcdefghijk",
    "https://www.youtube.com/watch?v=abcdefghijk&list=whatever",
  ])
    expect(youtubeVideoId(input)).toBe("abcdefghijk");
  for (const input of [
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://youtube.com@127.0.0.1/watch?v=abcdefghijk",
    "file:///abcdefghijk",
    "https://youtube.com:8443/watch?v=abcdefghijk",
    "https://youtube.com/watch?v=bad",
  ])
    expect(youtubeVideoId(input)).toBeUndefined();
});
it("includes completed attached transcripts in study material without inventing missing text", () => {
  const note = {
    body: "My note",
    metadata: {
      youtubeTranscripts: [
        {
          id: "abcdefghijk",
          url: "https://youtu.be/abcdefghijk",
          title: "Lesson",
          text: "A complete lesson.",
          status: "ready",
        },
        {
          id: "other123456",
          url: "https://youtu.be/other123456",
          title: "Pending",
          text: "",
          status: "pending",
        },
      ],
    },
  };
  expect(noteStudyText(note)).toContain(
    "Transcript for Lesson\nA complete lesson.",
  );
  expect(noteStudyText(note)).not.toContain("Pending");
});
