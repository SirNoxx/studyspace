import { test, expect } from "@playwright/test";

test("pasted attachments stay at the cursor, and selected images drag without duplicating", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("Before\n\nAfter\n\nEnd");
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("Home");
  await editor.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#527e69";
    ctx.fillRect(0, 0, 160, 80);
    const bytes = Uint8Array.from(
      atob(canvas.toDataURL("image/png").split(",")[1]),
      (c) => c.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], "diagram.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  let picture = page.locator(".editor-image img");
  await expect(picture).toBeVisible();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("Before");
  const original = await editor.innerText();
  expect(original.indexOf("![diagram.png]")).toBeGreaterThan(
    original.indexOf("Before"),
  );
  expect(original.indexOf("![diagram.png]")).toBeLessThan(
    original.indexOf("After"),
  );
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await picture.click();
  await expect(page.locator(".editor-image.image-selected")).toHaveCount(1);
  const target = editor.locator(".cm-line").filter({ hasText: /^End$/ });
  await picture.dragTo(target, { targetPosition: { x: 2, y: 8 } });
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const moved = await editor.innerText();
  expect(moved.indexOf("![diagram.png]")).toBeGreaterThan(
    moved.indexOf("After"),
  );
  expect(moved.match(/!\[diagram.png\]/g)).toHaveLength(1);
  await editor.press("Control+z");
  await expect(editor).toHaveText(original, { useInnerText: true });
  await editor.press("Control+y");
  await expect(editor).toHaveText(moved, { useInnerText: true });
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toHaveText(moved, { useInnerText: true });
});
