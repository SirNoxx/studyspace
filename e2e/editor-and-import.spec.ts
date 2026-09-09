import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("source editing retains undo through reading and tab switches", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nUnique test paragraph.");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".writing-area>.markdown")).toContainText(
    "Unique test paragraph.",
  );
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await editor.click();
  await page.keyboard.press("Control+z");
  await expect(editor).not.toContainText("Unique test paragraph.");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("Second test note");
  await page
    .getByRole("textbox", { name: "Markdown editor" })
    .fill("Second note body");
  await page
    .getByRole("button", { name: "Tool calling", exact: true })
    .first()
    .click();
  await editor.click();
  await page.keyboard.press("Control+Home");
  await expect(editor).toContainText("Beyond generating text");
  await editor.click();
  await page.keyboard.press("Control+z");
  await expect(editor).not.toContainText("Second note body");
});
test("Markdown import, keyboard dictionary palette, export and paper dialog accessibility", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await page.locator("input[type=file][accept]").setInputFiles([
    {
      name: "Unicode-研究.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "---\naliases: [Study]\n---\n# Research fixture\n\n[[Tool calling]]\n\nUnknown %%private comment%% stays in source.",
      ),
    },
  ]);
  await expect(
    page.getByText("Unicode-研究.md", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import notes", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "1 notes imported" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to your workspace" }).click();
  await page.keyboard.press("Control+Shift+d");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("A word, a phrase, an idea…").fill("Tool");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Tool calling", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Create collection or subject" })
    .click();
  const audit = await new AxeBuilder({ page })
    .include("[role=dialog]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/new-subject.png",
    fullPage: true,
  });
});
test("PDF render, region citation, zoom and rotation", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const fixture = await browser.newPage();
  await fixture.setContent(
    "<h1>Studyspace PDF test fixture</h1><p>This is a clearly labeled test passage for exact evidence anchoring.</p>",
  );
  const bytes = await fixture.pdf({ format: "A4" });
  await fixture.close();
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "evidence-test.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await expect(
    page.getByRole("button", { name: /evidence-test.pdf/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /evidence-test.pdf/ })
    .first()
    .click();
  await expect(page.locator(".pdf-page canvas")).toBeVisible();
  await expect(page.locator(".textLayer")).toContainText("Studyspace");
  await page.getByRole("button", { name: "Draw region", exact: true }).click();
  const box = await page.locator(".pdf-page").boundingBox();
  await page.mouse.move(box!.x + 50, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 300, box!.y + 110);
  await page.mouse.up();
  await page
    .getByLabel("Selected quote / region description")
    .fill("A test region with a durable file hash.");
  await page.getByRole("button", { name: "Save exact highlight" }).click();
  await expect(page.locator(".pdf-highlight")).toHaveCount(1);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
  await expect(page.locator(".pdf-highlight")).toHaveCount(1);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Rotate PDF", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.locator(".textLayer")).toContainText("Studyspace");
  await page.screenshot({
    path: "docs/screenshots/pdf-evidence.png",
    fullPage: true,
  });
});
