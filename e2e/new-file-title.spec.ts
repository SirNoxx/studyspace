import { test, expect } from "@playwright/test";

test("new files select the default title across creation paths and retain the typed name", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const title = page.getByRole("textbox", { name: "Note title" });
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  for (const source of ["tab", "collection", "quick actions"]) {
    if (source === "tab") {
      await page.getByRole("button", { name: "New note", exact: true }).click();
    } else if (source === "collection") {
      await page.getByTitle("Focus Coding", { exact: true }).click();
      await page
        .getByRole("button", { name: "New file in Coding", exact: true })
        .click();
    } else {
      await page
        .getByRole("button", { name: "Quick actions", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /New note/ })
        .click();
    }
    await expect(title).toBeEditable();
    await expect(title).toBeFocused();
    await expect
      .poll(() =>
        title.evaluate((el: HTMLInputElement) => [
          el.selectionStart,
          el.selectionEnd,
        ]),
      )
      .toEqual([0, 8]);
    await page.keyboard.type(`TEST ${source}`);
    await expect(title).toHaveValue(`TEST ${source}`);
    await page.getByRole("textbox", { name: "Markdown editor" }).click();
    await title.click();
    await title.press("End");
    await page.keyboard.type(" edited");
    await expect(title).toHaveValue(`TEST ${source} edited`);
    await expect(page.locator(".save-state")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(title).toHaveValue(`TEST ${source} edited`);
  }
});
