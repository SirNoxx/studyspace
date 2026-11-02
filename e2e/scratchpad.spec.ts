import { test, expect } from "@playwright/test";

test("scratchpad drawing saves, reopens, and stays in Quick notes", async ({
  page,
}) => {
  await page.goto("/demo/quick-notes?sample=1");
  const main = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await page
    .locator(".quick-capture-actions")
    .getByRole("button", { name: "New scratchpad" })
    .click();
  const board = page.getByRole("region", { name: "Whiteboard", exact: true });
  await expect(
    board.getByLabel("Whiteboard title", { exact: true }),
  ).toHaveValue("Quick sketch");
  await expect(
    main.getByRole("button", { name: "Quick notes", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("complementary", { name: "Notes and sources" }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Note title", exact: true })
    .fill("Garden layout");
  const surface = board.getByRole("group", {
    name: "Whiteboard drawing surface",
    exact: true,
  });
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + 70, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 110, { steps: 12 });
  await page.mouse.up();
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(1);
  await board
    .getByRole("button", { name: "Undo drawing", exact: true })
    .click();
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(0);
  await board
    .getByRole("button", { name: "Redo drawing", exact: true })
    .click();
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(1);
  await expect(page.locator(".save-state").first()).toContainText("Saved");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Note title", exact: true }),
  ).toHaveValue("Garden layout");
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/scratchpad-desktop.png",
    animations: "disabled",
    timeout: 30000,
  });
  await main.getByRole("button", { name: "Quick notes", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search quick notes" })
    .fill("Garden");
  await expect(page.locator(".quick-notes-list")).toContainText(
    "Scratchpad · Open to keep sketching",
  );
  await expect(page.locator(".quick-notes-list")).not.toContainText(
    "studyspace:",
  );
  await page.locator(".quick-notes-list .quick-note-open").click();
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(1);
  await page
    .getByRole("complementary", { name: "Quick notes explorer" })
    .getByRole("button", { name: "New scratchpad" })
    .click();
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(0);
  await main.getByRole("button", { name: "Quick notes", exact: true }).click();
  await page.getByRole("textbox", { name: "Search quick notes" }).fill("");
  await expect(page.locator(".quick-notes-list article")).toHaveCount(2);
});

test("mobile quick capture offers both notes and scratchpads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/quick-notes");
  await page
    .locator(".quick-capture-actions")
    .getByRole("button", { name: "New quick note" })
    .click();
  await page
    .getByRole("textbox", { name: "Quick note title" })
    .fill("Shopping list");
  await page
    .getByRole("textbox", { name: "Quick note body" })
    .fill("Bread and milk");
  await page.getByRole("dialog").getByRole("button", { name: /Save/ }).click();
  const main = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await main.getByRole("button", { name: "Quick notes", exact: true }).click();
  await expect(page.locator(".quick-notes-list")).toContainText(
    "Bread and milk",
  );
  await page
    .locator(".quick-capture-actions")
    .getByRole("button", { name: "New scratchpad" })
    .click();
  const surface = page.getByRole("group", {
    name: "Whiteboard drawing surface",
    exact: true,
  });
  await expect(surface).toBeVisible();
  await surface.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/scratchpad-mobile.png",
    animations: "disabled",
    timeout: 30000,
  });
});
