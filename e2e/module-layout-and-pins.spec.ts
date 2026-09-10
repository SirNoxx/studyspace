import { test, expect } from "@playwright/test";
test("calendar fills its module and all seven weekdays remain reachable", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page.getByRole("button", { name: "Add Calendar", exact: true }).click();
  const board = page.getByRole("region", {
    name: "calendar module",
    exact: true,
  });
  await board.getByLabel("Calendar month").fill("2026-09");
  await board.getByLabel("Notes for 2026-09-10").fill("Thursday study");
  const bounds = await board.evaluate((el) => {
    const rect = el.getBoundingClientRect(),
      head = el.querySelector(".module-heading")!.getBoundingClientRect(),
      grid = el.querySelector(".module-calendar")!.getBoundingClientRect();
    return {
      display: getComputedStyle(el).display,
      headRatio: head.width / rect.width,
      gridRatio: grid.width / rect.width,
      gridTop: grid.top,
      headerBottom: head.bottom,
    };
  });
  expect(bounds.display).toBe("block");
  expect(bounds.headRatio).toBeGreaterThan(0.95);
  expect(bounds.gridRatio).toBeGreaterThan(0.95);
  expect(bounds.gridTop).toBeGreaterThan(bounds.headerBottom);
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await board.screenshot({
    path: "docs/screenshots/calendar-module-fixed.png",
  });
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(board).toContainText("Thursday study");
  await expect(board.locator(".calendar-weekday")).toHaveCount(7);
});
test("charts expose editable data and candlesticks survive style changes and reload", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page.getByRole("button", { name: "Add Chart", exact: true }).click();
  const chart = page.getByRole("region", { name: "chart module", exact: true });
  await chart.getByLabel("Chart label 1", { exact: true }).fill("First sample");
  await chart.getByLabel("Chart value 1", { exact: true }).fill("12");
  expect(
    await chart.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThan(330);
  await chart.getByRole("button", { name: "Add value", exact: true }).click();
  await chart.getByLabel("Chart type").selectOption("candlestick");
  await chart
    .getByRole("button", { name: "Add candlestick", exact: true })
    .click();
  await chart.getByLabel("Candlestick label 5", { exact: true }).fill("Friday");
  for (const [key, value] of Object.entries({
    high: 15,
    low: 8,
    open: 10,
    close: 12,
  }))
    await chart
      .getByLabel(`Candlestick 5 ${key}`, { exact: true })
      .fill(String(value));
  await expect(chart.locator('[data-candlestick="5"] rect')).toHaveCount(1);
  await chart.getByLabel("Candlestick 5 high", { exact: true }).fill("9");
  await expect(chart.getByRole("status")).toContainText(
    "High must be at least",
  );
  await chart.getByLabel("Candlestick 5 high", { exact: true }).fill("15");
  await expect(chart.getByRole("status")).toHaveCount(0);
  await chart.getByLabel("Chart type").selectOption("bar");
  await expect(chart.getByLabel("Chart value 1", { exact: true })).toHaveValue(
    "12",
  );
  await chart.getByLabel("Chart type").selectOption("candlestick");
  await expect(
    chart.getByLabel("Candlestick label 5", { exact: true }),
  ).toHaveValue("Friday");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    chart.getByLabel("Candlestick 5 open", { exact: true }),
  ).toHaveValue("10");
  await chart.screenshot({ path: "docs/screenshots/candlestick-module.png" });
});
test("whiteboard gallery has its own sketch and pinning separates a note until unpinned", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: "Add Whiteboard", exact: true })
      .locator(".preview-whiteboard svg"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Add Venn diagram", exact: true })
      .locator(".preview-venn i"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator(".note-row")
    .filter({ hasText: "Tool calling" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin note", exact: true }).click();
  const pins = page.getByRole("region", { name: "Pinned notes", exact: true });
  await expect(pins).toContainText("Tool calling");
  await expect(page.locator(".file-tree")).not.toContainText("Tool calling");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(pins).toContainText("Tool calling");
  await pins
    .getByRole("button", { name: "Tool calling", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin note", exact: true }).click();
  await expect(pins).toHaveCount(0);
  await expect(page.locator(".file-tree")).toContainText("Tool calling");
});
