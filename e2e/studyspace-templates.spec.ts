import { test, expect } from "@playwright/test";

test("ten originals can be searched, previewed and saved during a community outage", async ({
  page,
}) => {
  await page.goto("/demo/journal");
  await page
    .getByRole("button", { name: "Open this day’s entry", exact: true })
    .click();
  await page.route("**/api/journal-templates?*", (route) =>
    route.abort("internetdisconnected"),
  );
  await page
    .getByRole("button", { name: "Browse templates", exact: true })
    .click();
  await expect(page.locator(".studyspace-template-card")).toHaveCount(10);
  await expect(
    page.getByRole("heading", { name: "Daybreak Compass", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/studyspace-original-templates.png" });
  await page.getByLabel("Search public templates").fill("recall");
  await page
    .getByRole("button", { name: "Search templates", exact: true })
    .click();
  await expect(page.locator(".studyspace-template-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog").last();
  await expect(preview).toContainText("Close the source");
  await expect(preview.getByRole("table")).toBeVisible();
  await preview
    .getByRole("button", { name: "Use template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Append to entry", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Markdown editor", exact: true }),
  ).toContainText("Put it under pressure");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await expect(page.locator(".journal-template-grid article")).toContainText(
    "Recall Forge",
  );
});
