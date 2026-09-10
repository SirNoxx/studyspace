import { test, expect } from "@playwright/test";
test("collection tools are conditional and folder menus contain metadata", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByTitle("Focus Coding", { exact: true }).click();
  const footer = page.locator(".managed-views");
  await expect(footer.getByRole("button", { name: /Code blocks/ })).toHaveCount(
    0,
  );
  await expect(footer.getByRole("button", { name: /Whiteboards/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Actions for Coding", exact: true })
    .click();
  await expect(page.locator(".menu-info").first()).toContainText("3 files");
  await expect(page.locator(".menu-info").last()).toContainText("Created");
  await page.keyboard.press("Escape");
  const background = await page
    .locator(".focused-collection")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Code block", exact: true })
    .click();
  await expect(
    footer.getByRole("button", { name: /Code blocks/ }),
  ).toContainText("1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteboard", exact: true })
    .click();
  await expect(
    footer.getByRole("button", { name: /Whiteboards/ }),
  ).toContainText("1");
  await footer.getByRole("button", { name: /Dictionary/ }).click();
  await expect(
    page.getByRole("heading", { name: "Coding dictionary", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await page.getByTitle("Focus College", { exact: true }).click();
  await expect(
    footer.getByRole("button", { name: /Code blocks|Whiteboards/ }),
  ).toHaveCount(0);
});
test("block menus save, copy, study, preview publication and delete with undo", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Code block", exact: true })
    .click();
  await page
    .getByLabel("Code block title", { exact: true })
    .fill("Example snippet");
  await page
    .getByLabel("Code editor", { exact: true })
    .fill("console.log(42);");
  const options = page.getByRole("button", { name: "Code block options" });
  await options.click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Example snippet.js");
  await options.click();
  await page.getByRole("menuitem", { name: "Study", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "AI Chat", exact: true }),
  ).toBeVisible();
  await options.click();
  await page.getByRole("menuitem", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Example snippet");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await options.click();
  await page
    .getByRole("menuitem", { name: "Add to folder / file", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Learning roadmap/ })
    .click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(
    "Learning roadmap",
  );
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".reading-code-block")).toContainText(
    "console.log(42)",
  );
});
test("whiteboard navigation and editable-copy menu retain drawing data", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteboard", exact: true })
    .click();
  await page.getByRole("button", { name: "Zoom in whiteboard" }).click();
  await expect(
    page.getByRole("button", { name: "Reset whiteboard view" }),
  ).toHaveText("125%");
  await page.getByRole("button", { name: "Pan", exact: true }).click();
  const surface = page.getByRole("img", { name: "Whiteboard drawing surface" });
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("viewBox", "100 62.5 800 500");
  await page.getByRole("button", { name: "Whiteboard options" }).click();
  await page.getByRole("menuitem", { name: "Reset view", exact: true }).click();
  await expect(surface).toHaveAttribute("viewBox", "0 0 1000 625");
  await page.getByRole("button", { name: "Whiteboard options" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save editable copy" }).click();
  expect((await download).suggestedFilename()).toBe("Whiteboard.md");
  await page.getByRole("button", { name: "Whiteboard options" }).click();
  await page.getByRole("menuitem", { name: "Delete whiteboard" }).click();
  await expect(surface).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .press("Control+z");
  await expect(surface).toBeVisible();
});
