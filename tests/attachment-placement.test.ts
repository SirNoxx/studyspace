import { expect, it } from "vitest";
import { placeAttachment } from "../src/lib/attachment-placement";
const image = "![Picture](attachment:example)";
it("inserts at the paste point, preserving surrounding text", () => {
  expect(
    placeAttachment("BeforeAfter", { body: "BeforeAfter", position: 6 }, image)
      .body,
  ).toBe(`Before\n${image}\nAfter`);
});
it("maps the cursor over text inserted and removed during upload", () => {
  expect(
    placeAttachment(
      "New BeforeAfter",
      { body: "BeforeAfter", position: 6 },
      image,
    ).body,
  ).toBe(`New Before\n${image}\nAfter`);
  expect(
    placeAttachment("BeAfter", { body: "BeforeAfter", position: 6 }, image)
      .body,
  ).toBe(`Be\n${image}\nAfter`);
  expect(
    placeAttachment(
      "BeforeTypedAfter",
      { body: "BeforeAfter", position: 6 },
      image,
    ).body,
  ).toBe(`Before\n${image}\nTypedAfter`);
});
it("preserves the order of multiple pasted attachments", () => {
  const first = placeAttachment(
    "Before\nAfter",
    { body: "Before\nAfter", position: 7 },
    image,
  );
  expect(
    placeAttachment(first.body, first.placement, "[PDF](attachment:pdf)").body,
  ).toBe(`Before\n${image}\n[PDF](attachment:pdf)\nAfter`);
});
