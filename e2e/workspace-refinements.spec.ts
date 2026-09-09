import { test, expect } from "@playwright/test";

test("each tab introduction can be dismissed independently and stays dismissed", async ({
  page,
}) => {
  for (const view of [
    "collections",
    "review",
    "journal",
    "discover",
    "dictionary",
    "sources",
    "bookmarks",
    "jobs",
    "inbox",
    "settings",
    "search",
  ]) {
    await page.goto(view === "collections" ? "/demo" : `/demo/${view}`);
    const dismiss = page.getByRole("button", {
      name: "Dismiss this tab’s introduction",
    });
    await expect(dismiss).toBeVisible();
    await dismiss.click();
    await expect(dismiss).toHaveCount(0);
    await expect(
      page.locator(".view-header-compact h1, .welcome-compact h1"),
    ).toBeVisible();
    if (view === "review")
      await expect(
        page.getByRole("button", { name: "Create card", exact: true }),
      ).toBeVisible();
    await expect(page.locator(".save-state")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(dismiss).toHaveCount(0);
    await expect(
      page.locator(".view-header-compact h1, .welcome-compact h1"),
    ).toBeVisible();
  }
  await page.goto("/demo/review");
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/review-compact-introduction.png",
  });
});

test("collection rows unfold while dedicated navigation remains a separate action", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const open = page.getByRole("button", {
    name: "Open Coding in dedicated view",
    exact: true,
  });
  const row = page.locator(".container-row").filter({ has: open });
  const originalUrl = page.url();
  const before = await row.getAttribute("aria-expanded");
  await page
    .getByRole("button", { name: /^(Expand|Collapse) Coding contents$/ })
    .click();
  await expect(row).toHaveAttribute(
    "aria-expanded",
    before === "true" ? "false" : "true",
  );
  expect(page.url()).toBe(originalUrl);
  await row.click({ position: { x: 3, y: 10 } });
  await expect(row).toHaveAttribute("aria-expanded", before!);
  await row.focus();
  await row.press("Enter");
  expect(page.url()).toBe(originalUrl);
  await row.hover();
  await expect(open).toHaveCSS("opacity", "1");
  await open.click();
  await expect(page).toHaveURL(/\/collection\//);
  await expect(
    page.getByRole("button", { name: "All Collections", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo$/);
  const general = page.locator(".container-row").filter({
    has: page.getByRole("button", {
      name: "Open General in dedicated view",
      exact: true,
    }),
  });
  await general.hover();
  await page
    .getByRole("button", { name: "New folder in General", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Folder name" });
  await expect(name).toBeFocused();
  expect(
    await name.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([0, 8]);
  await page.keyboard.type("Typed folder");
  await expect(name).toHaveValue("Typed folder");
  await name.press("Enter");
  await expect(page).toHaveURL(/\/demo$/);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Note title" });
  await title.click();
  expect(
    await title.evaluate((el: HTMLInputElement) => [
      el.selectionStart,
      el.selectionEnd,
    ]),
  ).toEqual([0, 8]);
  await page.keyboard.type("Typed note");
  await expect(title).toHaveValue("Typed note");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(title).toHaveValue("Typed note");
});

test("selected editor text has a keyboard and pointer context menu without duplicate links", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.keyboard.type("Context menu evidence");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("A passage worth remembering");
  await editor.press("Control+a");
  const toolbar = page.getByRole("toolbar", { name: "Selected text actions" });
  await expect(toolbar).toBeVisible();
  await editor.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Text context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /link/i })).toHaveCount(1);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Add to dictionary" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Word or phrase")).toHaveValue(
    "A passage worth remembering",
  );
  await page.keyboard.press("Escape");
  await editor.click();
  await editor.press("Control+a");
  const rect = await page.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    return { x: r.left + 10, y: r.top + 8 };
  });
  await page.mouse.click(rect.x, rect.y, { button: "right" });
  await expect(menu).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/text-right-click-menu.png",
    animations: "disabled",
  });
  await menu.getByRole("menuitem", { name: "Create study card" }).click();
  await expect(
    page.getByRole("textbox", { name: "Answer", exact: true }),
  ).toHaveValue("A passage worth remembering");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveText("A passage worth remembering");
});

test("reading context menu preserves the passage and stays inside a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.keyboard.type("Reading selection");
  await page
    .getByRole("textbox", { name: "Markdown editor" })
    .fill("Remember this selected passage.");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  const paragraph = page.locator(".writing-area .markdown p").first();
  await paragraph.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await expect(
    page.getByRole("toolbar", { name: "Selected text actions" }),
  ).toBeVisible();
  await paragraph.click({ button: "right", position: { x: 10, y: 8 } });
  const menu = page.getByRole("menu", { name: "Text context menu" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Cut", exact: true }),
  ).toHaveCount(0);
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(900);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
  await menu.getByRole("menuitem", { name: "Add to dictionary" }).click();
  await expect(page.getByLabel("Word or phrase")).toHaveValue(
    "Remember this selected passage.",
  );
});

test("the journal quill has no opaque patch on hover", async ({ page }) => {
  await page.goto("/demo?sample=1");
  const journal = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Journal", exact: true });
  await journal.hover();
  await expect(journal.locator(".journal-symbol > svg:last-child")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});
