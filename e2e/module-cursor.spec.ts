import { test, expect } from "@playwright/test";

test("clicks below modules track visible text before and after resizing", async ({ page }) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const module = "```module studyspace:cursor-test\n" + JSON.stringify({ version: 1, kind: "uses", text: "A small module" }) + "\n```";
  await editor.fill(module + "\n\nFirst line\nSecond line\nTarget line\nFourth line\nLast line");
  await expect(editor.locator(".note-module")).toBeVisible();
  const target = editor.locator(".cm-line").filter({ hasText: /^Target line$/ });
  const checkCursor = async () => {
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + 3, box.y + box.height / 2);
    await expect.poll(async () => {
      const cursor = await page.locator(".editor-host > .cm-editor .cm-cursor").first().boundingBox();
      return cursor ? Math.abs(cursor.y + cursor.height / 2 - (box.y + box.height / 2)) : 999;
    }).toBeLessThan(4);
    await page.keyboard.type("X");
    await expect(editor.locator(".cm-line").filter({ hasText: /^XTarget line$/ })).toBeVisible();
    await page.keyboard.press("Backspace");
  };
  await checkCursor();
  await editor.getByRole("textbox", { name: "Use cases", exact: true }).fill(Array.from({length:12}, (_, i) => `Expanded content ${i}`).join("\n"));
  await checkCursor();
});
