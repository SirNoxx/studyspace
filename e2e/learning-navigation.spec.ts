import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("whiteboard pans beyond the original page, zooms widely and fits saved content", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteboard", exact: true })
    .click();
  const board = page.getByRole("region", { name: "Whiteboard", exact: true }),
    surface = board.getByRole("group", {
      name: "Whiteboard drawing surface",
      exact: true,
    });
  await surface.scrollIntoViewIfNeeded();
  await surface.focus();
  for (let i = 0; i < 12; i++) await surface.press("ArrowDown");
  await expect
    .poll(async () =>
      Number((await surface.getAttribute("viewBox"))!.split(" ")[1]),
    )
    .toBeGreaterThan(625);
  await board.getByRole("button", { name: "Text", exact: true }).click();
  await surface.click({ position: { x: 80, y: 80 } });
  await board
    .getByRole("textbox", { name: "Whiteboard text box", exact: true })
    .fill("Beyond the original page");
  await board.getByRole("button", { name: "Done", exact: true }).click();
  await board.getByRole("button", { name: "Reset whiteboard view" }).click();
  await board.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await expect(board.locator("[data-stroke-id] text")).toBeInViewport();
  await surface.focus();
  await surface.press("Space");
  for (let i = 0; i < 30; i++) await surface.press("-");
  await expect(
    board.getByRole("button", { name: "Reset whiteboard view" }),
  ).toHaveText("5%");
  for (let i = 0; i < 30; i++) await surface.press("+");
  await expect(
    board.getByRole("button", { name: "Reset whiteboard view" }),
  ).toHaveText("1600%");
  await board.getByRole("button", { name: "Fit drawing", exact: true }).click();
  const download = page.waitForEvent("download");
  await board.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await board.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await expect(board.locator("g[data-stroke-id]")).toHaveAttribute(
    "aria-label",
    "Beyond the original page",
  );
});

test("Wikipedia failure preserves the local wheel", async ({ page }) => {
  await page.route("**/api/learning-topics?**", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "Topic search is unavailable. Use the offline wheel." },
    }),
  );
  await page.goto("/demo?sample=1");
  await expect(
    page.getByRole("button", { name: "Learning", exact: true }),
  ).toHaveCount(0);
  await page.goto("/demo/learning");
  await page.getByLabel("Find a topic").fill("GitHub");
  await page
    .getByText("Add your own topic or explore Wikipedia", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Search Wikipedia using the topic filter" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Topic search is unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Spin & start learning" }),
  ).toBeEnabled();
});

test("Learning remains readable and accessible on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?sample=1");
  await expect(
    page.getByRole("button", { name: "Learning", exact: true }),
  ).toHaveCount(0);
  await page.goto("/demo/learning");
  await expect(
    page.getByRole("heading", { name: "Learning", exact: true }),
  ).toBeVisible();
  const bounds = await page.locator(".learning-page").boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const results = await new AxeBuilder({ page })
    .include(".learning-page")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/learning-mobile.png",
    fullPage: true,
  });
});
