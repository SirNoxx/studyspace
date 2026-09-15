import { test, expect, type Page } from "@playwright/test";
async function wordPoint(page: Page, word: string, occurrence = 0) {
  return page.locator(".cm-content").evaluate(
    (element, { word, occurrence }) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let seen = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        let from = node.textContent!.indexOf(word);
        while (from >= 0) {
          if (seen++ === occurrence) {
            const range = document.createRange();
            range.setStart(node, from + Math.min(1, word.length - 1));
            range.setEnd(node, from + Math.min(2, word.length));
            const rect = range.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
          from = node.textContent!.indexOf(word, from + word.length);
        }
      }
      throw Error("Word not found");
    },
    { word, occurrence },
  );
}
test("right-click corrections replace only the clicked word, support undo and work offline", async ({
  page,
  context,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("First sentnce. Second sentnce.");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(2);
  const point = await wordPoint(page, "sentnce", 1);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .getByRole("group", { name: "Spelling suggestions", exact: true })
    .getByRole("menuitem", { name: "sentence", exact: true })
    .click();
  await expect(editor).toHaveText("First sentnce. Second sentence.");
  expect(
    await editor.locator(".cm-spelling-error").allTextContents(),
  ).toContain("sentnce");
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(1);
  await editor.press("Control+z");
  await expect(editor).toHaveText("First sentnce. Second sentnce.");
  await context.setOffline(true);
  const first = await wordPoint(page, "sentnce");
  await page.mouse.click(first.x, first.y, { button: "right" });
  await page
    .getByRole("group", { name: "Spelling suggestions", exact: true })
    .getByRole("menuitem", { name: "sentence", exact: true })
    .click();
  await expect(editor).toHaveText("First sentence. Second sentnce.");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await context.setOffline(false);
  await page.reload();
  await expect(editor).toHaveText("First sentence. Second sentnce.");
  await expect(
    page.getByRole("button", { name: "Study music", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/study-music?id=removed")).status()).toBe(
    404,
  );
});
test("a selected misspelled word keeps text actions alongside spelling suggestions", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("This is a sentnce.");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  const point = await wordPoint(page, "sentnce");
  await page.mouse.dblclick(point.x, point.y);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", {
    name: "Text context menu",
    exact: true,
  });
  await expect(
    menu.getByRole("menuitem", { name: "Create definition", exact: true }),
  ).toBeVisible();
  await menu.getByRole("menuitem", { name: "sentence", exact: true }).click();
  await expect(editor).toHaveText("This is a sentence.");
});

test("severe misspellings offer dictionary-backed corrections without checking code", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("We need accomodashun. This is neccessery. `sentnce`");
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(2);
  const point = await wordPoint(page, "accomodashun");
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .getByRole("group", { name: "Spelling suggestions", exact: true })
    .getByRole("menuitem", { name: "accommodation", exact: true })
    .click();
  await expect(editor).toContainText("We need accommodation.");
  expect(
    await editor.locator(".cm-spelling-error").allTextContents(),
  ).toContain("neccessery");
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/spelling-persistent-underlines.png",
  });
});

test("grammar offers I'm, article fixes and repeated-word corrections with undo", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("Today im eating a apple and the the orange. sentnce `im`");
  await expect(editor.locator(".cm-grammar-error")).toHaveCount(3);
  let point = await wordPoint(page, "im");
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .getByRole("group", { name: "Grammar suggestions", exact: true })
    .getByRole("menuitem", { name: "I'm", exact: true })
    .click();
  await expect(editor).toContainText("Today I'm eating");
  await expect(editor.locator(".cm-spelling-error")).toHaveText("sentnce");
  await expect(editor.locator(".cm-grammar-error")).toHaveCount(2);
  point = await wordPoint(page, "the", 1);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await page
    .getByRole("group", { name: "Grammar suggestions", exact: true })
    .getByRole("menuitem", { name: "the", exact: true })
    .click();
  await expect(editor).toContainText("and the orange.");
  await editor.press("Control+z");
  await expect(editor).toContainText("the the orange");
});
