import { test, expect } from "@playwright/test";

test("text boxes appear at the click, resize, format, export and persist without losing typing focus", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteboard", exact: true })
    .click();
  const board = page.getByRole("region", { name: "Whiteboard", exact: true });
  await board.getByRole("button", { name: "Text", exact: true }).click();
  const surface = board.getByRole("group", {
    name: "Whiteboard drawing surface",
    exact: true,
  });
  await surface.scrollIntoViewIfNeeded();
  const canvasPosition = (await surface.boundingBox())!;
  await surface.click({ position: { x: 120, y: 100 } });
  const input = board.getByRole("textbox", {
    name: "Whiteboard text box",
    exact: true,
  });
  await expect(input).toBeFocused();
  const placed = (await input.boundingBox())!;
  expect(
    Math.abs(placed.x + placed.width / 2 - canvasPosition.x - 120),
  ).toBeLessThan(2);
  expect(
    Math.abs(placed.y + placed.height / 2 - canvasPosition.y - 100),
  ).toBeLessThan(2);
  expect(placed.width).toBeLessThan(80);
  await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(input).toHaveCSS("text-align", "center");
  await expect(
    board.getByRole("button", { name: "Bold text", exact: true }),
  ).toHaveAttribute("title", "Bold");
  await expect(
    board.getByRole("button", { name: "Italic text", exact: true }),
  ).toHaveAttribute("title", "Italic");
  await expect(
    board.getByRole("button", { name: "Done", exact: true }),
  ).toHaveCSS("border-top-style", "solid");
  await expect(
    board.getByRole("button", { name: "Delete text box", exact: true }),
  ).toHaveCSS("border-top-style", "solid");
  await input.fill(
    "The cell is the basic unit of life.\nRecall its structure.",
  );
  await input.press("End");
  await page.keyboard.type(" More details.", { delay: 120 });
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await expect(input).toBeFocused();
  await board.getByLabel("Text size", { exact: true }).fill("30");
  await board.getByRole("button", { name: "Bold text", exact: true }).click();
  await board.getByRole("button", { name: "Italic text", exact: true }).click();
  await board.getByLabel("Text color", { exact: true }).fill("#9333ea");
  await expect(input).toHaveCSS("font-weight", "700");
  await expect(input).toHaveCSS("font-style", "italic");
  const before = (await input.boundingBox())!;
  const corner = board.getByRole("button", {
    name: "Resize text box",
    exact: true,
  });
  await corner.scrollIntoViewIfNeeded();
  const handle = (await corner.boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + 80, handle.y + 65, { steps: 8 });
  await page.mouse.up();
  const after = (await input.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 50);
  expect(after.height).toBeGreaterThan(before.height + 35);
  await corner.focus();
  await corner.press("Shift+ArrowRight");
  await board.getByRole("button", { name: "Done", exact: true }).click();
  const savedText = board.locator("[data-stroke-id] text");
  await expect(savedText).toHaveAttribute("font-weight", "bold");
  await expect(savedText).toHaveAttribute("font-style", "italic");
  await expect(savedText).toHaveAttribute("fill", "#9333ea");
  await board.locator("g[data-stroke-id]").click();
  await expect(input).toHaveValue(
    "The cell is the basic unit of life.\nRecall its structure. More details.",
  );
  const download = page.waitForEvent("download");
  await board.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await board
    .getByRole("button", { name: "Collapse whiteboard", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await board
    .getByRole("button", { name: "Expand whiteboard", exact: true })
    .click();
  await board.getByRole("button", { name: "Text", exact: true }).click();
  await board.locator("g[data-stroke-id]").click();
  await expect(input).toContainText("More details.");
  await expect(input).toHaveCSS("font-weight", "700");
  await expect(input).toHaveCSS("font-style", "italic");
  expect((await input.boundingBox())!.width).toBeGreaterThan(before.width + 50);
  await board
    .getByRole("button", { name: "Delete text box", exact: true })
    .click();
  await expect(board.locator("[data-stroke-id]")).toHaveCount(0);
  await board
    .getByRole("button", { name: "Undo drawing", exact: true })
    .click();
  await expect(board.locator("g[data-stroke-id]")).toHaveAttribute(
    "aria-label",
    "The cell is the basic unit of life.\nRecall its structure. More details.",
  );
});
