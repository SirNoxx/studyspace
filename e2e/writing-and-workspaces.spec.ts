import { test, expect, type Page } from "@playwright/test";
async function saved(page: Page) {
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("studyspace-device-v1", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const key = sessionStorage.getItem("studyspace:device-workspace") ?? "demo";
    const w = await new Promise<any>((resolve) => {
      const r = db.transaction("workspaces").objectStore("workspaces").get(key);
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return w;
  });
}
test("rename folders and files inline, cancel safely, and move from title to empty editor", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await page
    .getByRole("button", { name: "New folder in Coding", exact: true })
    .click();
  const folder = page.getByLabel("Folder name", { exact: true });
  await folder.fill("Original folder");
  await folder.press("Enter");
  const row = page
    .locator(".container-row")
    .filter({
      has: page.locator(".tree-title").filter({ hasText: /^Original folder$/ }),
    });
  await row.focus();
  await row.press("F2");
  await expect(folder).toBeFocused();
  expect(
    await folder.evaluate((e: HTMLInputElement) => [
      e.selectionStart,
      e.selectionEnd,
    ]),
  ).toEqual([0, 15]);
  await folder.fill("Cancelled");
  await folder.press("Escape");
  await expect(row).toBeVisible();
  await page
    .getByRole("button", { name: "New file in Original folder", exact: true })
    .click();
  const title = page.getByLabel("Note title", { exact: true });
  await title.fill("Original file");
  await title.press("Enter");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeFocused();
  await expect(page.locator(".cm-placeholder")).toHaveText("Type here...");
  await saved(page);
  expect(
    (await stored(page)).notes.find((n: any) => n.title === "Original file")
      .body,
  ).toBe("");
  const note = page.locator(".note-row").filter({ hasText: "Original file" });
  await note.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const file = page.getByLabel("File name", { exact: true });
  await expect(file).toBeFocused();
  expect(
    await file.evaluate((e: HTMLInputElement) => [
      e.selectionStart,
      e.selectionEnd,
    ]),
  ).toEqual([0, 13]);
  await file.fill("Renamed file");
  await file.press("Enter");
  await expect(title).toHaveValue("Renamed file");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved(page);
  await page.reload();
  await expect(title).toHaveValue("Renamed file");
});
test("collection tools stay below the tree, creation returns only in All Collections, and menus rename inline", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New collection", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Create collection or subject",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("New collection or subject", { exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".explorer-footer .managed-views")).toContainText(
    "Search this collection",
  );
  expect(
    await page
      .locator(".explorer-divider")
      .evaluate((e) => e.previousElementSibling?.className),
  ).toBe("explorer-search");
  const before = await page.locator(".managed-views").boundingBox();
  await page.locator(".tree-scroll").evaluate((el) => {
    const filler = document.createElement("div");
    filler.style.height = "2000px";
    el.append(filler);
    el.scrollTop = 2000;
  });
  expect((await page.locator(".managed-views").boundingBox())!.y).toBe(
    before!.y,
  );
  await page
    .getByRole("button", { name: "Actions for Coding", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const input = page.getByLabel("Collection name", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("Computing");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "New collection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTitle("Focus Computing", { exact: true }),
  ).toBeVisible();
});
test("pasted image renders in Live and Reading and survives reload without losing Markdown", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Note title", { exact: true }).fill("Pasted image");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.click();
  await editor.evaluate((el) => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const image = page.locator(".editor-image img");
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((e: HTMLImageElement) => e.naturalWidth))
    .toBe(1);
  await saved(page);
  await page.reload();
  await expect(image).toBeVisible();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".writing-area .markdown img")).toBeVisible();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("![pasted.png](attachment:");
});
test("device workspace names and contents remain separate across switching and reload", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await saved(page);
  const original = (await stored(page)).notes.map((n: any) => n.id);
  await page.getByRole("button", { name: "Manage workspaces" }).click();
  await page.getByLabel("Workspace name", { exact: true }).fill("University");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await saved(page);
  await page.getByLabel("New workspace name", { exact: true }).fill("Personal");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Manage workspaces" }),
  ).toContainText("Personal");
  expect((await stored(page)).notes).toHaveLength(0);
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByLabel("Note title", { exact: true })
    .fill("Private personal note");
  await saved(page);
  await page.reload();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(
    "Private personal note",
  );
  await page.getByRole("button", { name: "Manage workspaces" }).click();
  await page
    .getByRole("button", { name: "University · On this device", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Manage workspaces" }),
  ).toContainText("University");
  expect((await stored(page)).notes.map((n: any) => n.id)).toEqual(original);
});
test("AI chat is docked with persistent conversations, adjustable options, and contextual follow-ups", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await expect(page.locator(".inspector .ai-chat")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Close inspector", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page
    .getByLabel(
      "Allow sending this selected context to the configured AI provider.",
    )
    .check();
  await page
    .getByLabel("Response style", { exact: true })
    .selectOption("concise");
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  const requests: any[] = [];
  await page.route("**/api/ai", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "complete",
          text: "Fixture response " + requests.length,
          evidence: [],
        }) + "\n",
    });
  });
  const message = page.getByLabel("Chat message", { exact: true });
  await message.fill("Explain this");
  await expect(page.locator(".chat-starters")).toHaveCount(0);
  await message.press("Enter");
  await expect(page.getByRole("log")).toContainText("Fixture response 1");
  await message.fill("Give an example");
  await message.press("Enter");
  await expect(page.getByRole("log")).toContainText("Fixture response 2");
  expect(requests[1].history).toEqual([
    { question: "Explain this", answer: "Fixture response 1" },
  ]);
  expect(requests[1].responseStyle).toBe("concise");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(page.getByRole("log")).not.toContainText("Fixture response");
  await message.fill("A fresh chat");
  await message.press("Enter");
  await expect(page.getByRole("log")).toContainText("Fixture response 3");
  expect(requests[2].history).toEqual([]);
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Fixture response 3");
  await page.getByRole("button", { name: "Chat history", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Chat history" })
    .getByRole("button")
    .filter({ hasText: "Explain this" })
    .click();
  await expect(page.getByRole("log")).toContainText("Fixture response 1");
  await page.screenshot({
    path: "docs/screenshots/sidebar-chat-refinements.png",
  });
});
test("caret follows background and links use the readable note palette", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill("[Lighter link](https://example.com)");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await editor.click();
  await expect(page.locator(".cm-cursor").first()).toHaveCSS(
    "border-left-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.getByLabel("Note title", { exact: true })).toHaveCSS(
    "caret-color",
    "rgb(255, 255, 255)",
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await expect(page.locator(".cm-cursor").first()).not.toHaveCSS(
    "border-left-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Lighter link", exact: true }),
  ).toHaveCSS("color", "rgb(82, 120, 150)");
});
