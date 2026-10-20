import { test, expect } from "@playwright/test";

test("settings overlays the current note, previews heading fonts and persists the selection", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill(
    "# First heading\n\n## Second heading\n\nBody text stays readable.",
  );
  await editor.press("End");
  const title = page.getByRole("textbox", { name: "Note title", exact: true });
  await expect(title).toHaveCSS("font-weight", "600");
  const originalBodyFont = await editor.evaluate(
    (el) => getComputedStyle(el).fontFamily,
  );
  const currentUrl = page.url();
  const openSettings = page.getByRole("button", {
    name: "Settings",
    exact: true,
  });
  await openSettings.click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(currentUrl);
  await expect(page.locator(".writing-area .cm-content")).toHaveCount(1);
  expect(
    await page
      .locator(".dialog-overlay")
      .evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toContain("blur");
  const fonts = dialog.getByRole("group", { name: "Note titles & headings" });
  await expect(
    fonts.getByRole("radio", { name: "Professional", exact: true }),
  ).toBeChecked();
  await expect(fonts.getByRole("radio")).toHaveCount(5);
  await fonts.getByRole("radio", { name: "Editorial", exact: true }).check();
  await page.screenshot({
    path: "test-results/settings-fonts.png",
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(openSettings).toBeFocused();
  await expect(title).toHaveCSS("font-family", /Georgia/);
  await expect(editor.locator(".cm-h1")).toHaveCSS("font-family", /Georgia/);
  await expect(editor.locator(".cm-h2")).toHaveCSS("font-family", /Georgia/);
  expect(await editor.evaluate((el) => getComputedStyle(el).fontFamily)).toBe(
    originalBodyFont,
  );
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".writing-area .markdown h2")).toHaveCSS(
    "font-family",
    /Georgia/,
  );
  await openSettings.click();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Second heading" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keyboard shortcuts", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await openSettings.click();
  await expect(
    fonts.getByRole("radio", { name: "Editorial", exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Revisit welcome walkthrough" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Studyspace walkthrough" })).toBeVisible();
});

test("normal note opening replaces the active tab; the first context action explicitly adds one", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const tabs = page.getByRole("region", { name: "Open file tabs" });
  const tool = page.getByRole("treeitem", {
    name: "Tool calling",
    exact: true,
  });
  const retrieval = page.getByRole("treeitem", {
    name: "Retrieval augmented generation",
    exact: true,
  });
  const roadmap = page.getByRole("treeitem", {
    name: "Learning roadmap",
    exact: true,
  });
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("Keep this draft while browsing.");
  await editor.press("End");
  await retrieval.click();
  await expect(tabs.locator(".note-tab")).toHaveCount(1);
  await expect(
    tabs.getByRole("button", {
      name: "Retrieval augmented generation",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to previous note", exact: true })
    .click();
  await expect(tabs.locator(".note-tab")).toHaveCount(1);
  await expect(editor).toContainText("Keep this draft while browsing.");
  await retrieval.click({ button: "right" });
  await expect(page.getByRole("menu").getByRole("menuitem").first()).toHaveText(
    "Open in new tab",
  );
  await page
    .getByRole("menuitem", { name: "Open in new tab", exact: true })
    .click();
  await expect(tabs.locator(".note-tab")).toHaveCount(2);
  await tabs.getByRole("button", { name: "Tool calling", exact: true }).click();
  await roadmap.click();
  await expect(tabs.locator(".note-tab")).toHaveCount(2);
  await expect(tabs.locator(".note-tab").first()).toContainText(
    "Learning roadmap",
  );
  await expect(tabs.locator(".note-tab").last()).toContainText(
    "Retrieval augmented generation",
  );
  await retrieval.click();
  await expect(tabs.locator(".note-tab")).toHaveCount(2);
  await retrieval.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Open in new tab", exact: true })
    .click();
  await expect(tabs.locator(".note-tab")).toHaveCount(2);
  await tool.click();
  await expect(editor).toContainText("Keep this draft while browsing.");
  await expect(tabs.locator(".note-tab")).toHaveCount(2);
});

test("settings is usable on a narrow screen and old settings links open the popup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/settings?sample=1");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "Technical", exact: true }).check();
  await expect(
    dialog.getByRole("radio", { name: "Technical", exact: true }),
  ).toBeChecked();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(
    dialog.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeInViewport();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});
