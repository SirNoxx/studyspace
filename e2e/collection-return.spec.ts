import { test, expect } from "@playwright/test";

test("nested collections return through the previous view, including after refresh", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByTitle("Focus Coding", { exact: true }).click();
  const parentUrl = page.url();
  await page
    .getByRole("button", { name: "New folder in Coding", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Folder name", exact: true });
  await name.fill("Research folder");
  await name.press("Enter");
  const source = page
    .locator(".tree-row")
    .filter({
      has: page.getByTitle("Focus Artificial intelligence", { exact: true }),
    });
  const folder = page
    .locator(".tree-row")
    .filter({
      has: page.getByRole("button", {
        name: /^(Expand|Collapse) Research folder contents$/,
      }),
    });
  const box = (await folder.boundingBox())!;
  await source.dragTo(folder, {
    sourcePosition: { x: 50, y: 18 },
    targetPosition: { x: 100, y: box.height / 2 },
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByTitle("Focus Artificial intelligence", { exact: true })
    .click();
  const childUrl = page.url();
  await expect(
    page.getByRole("tree", { name: "Artificial intelligence files" }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await expect(page).toHaveURL(parentUrl);
  await expect(page.getByRole("tree", { name: "Coding files" })).toBeVisible();
  await expect(
    page.getByTitle("Focus Artificial intelligence", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTitle("Focus Research folder", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("tree", { name: "Coding files" })).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toBeVisible();
  // A directly opened nested collection has no return trail, so use its ancestor.
  await page.goto(childUrl);
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await expect(page).toHaveURL(parentUrl);
  await expect(page.getByRole("tree", { name: "Coding files" })).toBeVisible();
});

test("entering focus from Search returns to Search instead of the workspace root", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  const previousUrl = page.url();
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await expect(page).toHaveURL(previousUrl);
  await expect(
    page.getByRole("tree", { name: "All collections", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search workspace", exact: true }),
  ).toBeVisible();
});
