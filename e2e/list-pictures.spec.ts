import { test, expect } from "@playwright/test";

test("formatted lists select across entries, add with Tab, wrap and persist", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Formatted list", exact: true })
    .click();
  const list = page.getByRole("textbox", { name: "Formatted list entries" });
  await list.fill("First entry\nSecond entry\nThird entry");
  const box = (await list.boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + 13);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + 39, { steps: 12 });
  await page.mouse.up();
  await list.press("Control+c");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
  ).toBe("First entry\nSecond entry");
  await list.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3));
  await list.press("Tab");
  await expect(list).toBeFocused();
  await list.pressSequentially("Inserted");
  await expect(list).toHaveValue(
    "First entry\nInserted\nSecond entry\nThird entry",
  );
  await page.getByRole("combobox", { name: "List style" }).selectOption("todo");
  await page
    .getByRole("checkbox", { name: "Complete task 2", exact: true })
    .check();
  const long = "A long entry with visible text that wraps naturally. ".repeat(
    30,
  );
  await list.focus();
  await list.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.indexOf("Third entry"), el.value.length));
  await page.keyboard.insertText(long);
  await expect(
    page.getByRole("checkbox", { name: "Complete task 2", exact: true }),
  ).toBeChecked();
  const metrics = await list.evaluate((el) => ({
    height: el.clientHeight,
    scroll: el.scrollHeight,
    resize: getComputedStyle(el).resize,
  }));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.height + 2);
  expect(metrics.resize).toBe("none");
  await page.screenshot({ path: "test-results/list-layout.png" });
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect
    .poll(() => list.evaluate((el) => el.scrollHeight <= el.clientHeight + 2))
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await list.press("Shift+Tab");
  await expect(list).not.toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open("studyspace-device-v1");
          r.onsuccess = () => resolve(r.result);
        });
        const value = await new Promise<any>((resolve) => {
          const r = db
            .transaction("workspaces")
            .objectStore("workspaces")
            .get("demo");
          r.onsuccess = () => resolve(r.result);
        });
        db.close();
        return (
          JSON.stringify(value).includes("Inserted") &&
          JSON.stringify(value).includes("A long entry")
        );
      }),
    )
    .toBe(true);
  await page.reload();
  const reopened = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await reopened.click();
  await reopened.press("Control+End");
  await expect(list).toHaveValue(
    `First entry\nInserted\nSecond entry\n${long}`,
  );
  await expect(
    page.getByRole("checkbox", { name: "Complete task 2", exact: true }),
  ).toBeChecked();
});

test("picture menus expose metadata, copy image bytes, print and remove only one occurrence", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo?sample=1");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#779e8a";
    ctx.fillRect(0, 0, 360, 180);
    ctx.fillStyle = "#10281c";
    ctx.font = "24px sans-serif";
    ctx.fillText("Study diagram", 35, 95);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "study-picture.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page.getByRole("button", { name: /^study-picture\.png \d+ KB$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const source = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await source.click();
  await source.press("Control+End");
  await expect(source).toContainText("study-picture.png");
  const body = await source.innerText();
  const embedded = body.match(
    /!\[study-picture\.png\]\(attachment:[^)]+\)/,
  )![0];
  await source.fill(`${embedded}\n\n${embedded}\n`);
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .press("Control+End");
  const image = page.locator(".editor-image img").last();
  await expect(image).toBeVisible();
  await image.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Picture properties", exact: true })
    .click();
  const properties = page.getByRole("dialog", {
    name: "Picture properties",
    exact: true,
  });
  await expect(properties).toContainText("study-picture.png");
  await expect(properties).toContainText("image/png");
  await expect(properties).toContainText("Added");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const options = page
    .getByRole("button", {
      name: "Picture options: study-picture.png",
      exact: true,
    })
    .last();
  await options.click();
  await page
    .getByRole("menuitem", { name: "Copy picture", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Picture copied." }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () =>
      (await navigator.clipboard.read()).some((item) =>
        item.types.includes("image/png"),
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    (window as any).__picturePrinted = false;
    const original = document.createElement.bind(document);
    document.createElement = ((...args: any[]) => {
      const el = (original as any)(...args);
      if (args[0] === "iframe") {
        const observer = new MutationObserver(() => {
          if (el.contentWindow) {
            el.contentWindow.print = () => {
              (window as any).__picturePrinted = true;
            };
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true });
      }
      return el;
    }) as typeof document.createElement;
  });
  await options.click();
  await page
    .getByRole("menuitem", { name: "Print picture", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__picturePrinted))
    .toBe(true);
  await options.click();
  await page
    .getByRole("menuitem", { name: "Delete picture", exact: true })
    .click();
  await expect(page.locator(".editor-image img")).toHaveCount(1);
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.click();
  await editor.press("Control+z");
  await expect(page.locator(".editor-image img")).toHaveCount(2);
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await options.click();
  await page
    .getByRole("menuitem", { name: "Delete picture", exact: true })
    .click();
  await expect(page.locator(".writing-area .markdown .note-picture")).toHaveCount(1);
});
