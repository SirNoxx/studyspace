import { test, expect } from "@playwright/test";
test("attach an existing definition to an exact occurrence, persist it and undo it", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("npm first, npm again.");
  await editor.press("Control+End");
  await editor.press("Control+Shift+ArrowLeft");
  // Use the dictionary shortcut from the selection toolbar to create the long term.
  await page
    .getByRole("toolbar", { name: "Selected text actions" })
    .getByRole("button", { name: "Create definition", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Word or phrase", { exact: true })
    .fill("npm (Node Package Manager)");
  await dialog
    .getByLabel("Definition", { exact: true })
    .fill("Installs and manages JavaScript packages.");
  await dialog
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  // Select just the second npm via keyboard offsets.
  await editor.click();
  await editor.press("Control+Home");
  for (let i = 0; i < 11; i++) await editor.press("ArrowRight");
  for (let i = 0; i < 3; i++) await editor.press("Shift+ArrowRight");
  await page
    .getByRole("toolbar", { name: "Selected text actions" })
    .getByRole("button", {
      name: "Insert or edit link / definition",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Attach existing definition",
      exact: true,
    }),
  ).toHaveCount(0);
  await dialog.getByLabel("Destination type").selectOption("definition");
  await dialog.getByLabel("Search existing definitions").fill("package");
  await dialog
    .getByRole("button", {
      name: "Attach npm (Node Package Manager)",
      exact: true,
    })
    .click();
  await expect(editor).toContainText("npm first, [npm](#definition:");
  await expect(
    editor.locator(".cm-concept").filter({ hasText: "npm" }),
  ).toHaveCount(1);
  await expect(
    editor.locator(".cm-concept").filter({ hasText: "npm" }),
  ).toHaveAttribute("title", "Installs and manages JavaScript packages.");
  const linkedBody = await editor.innerText();
  await editor.press("Control+z");
  await expect(editor).toHaveText("npm first, npm again.");
  await editor.press("Control+y");
  await expect(editor).toHaveText(linkedBody);
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(editor).toContainText("#definition:");
  await editor.locator(".cm-concept").filter({ hasText: "npm" }).click();
  await expect(
    dialog.getByRole("heading", {
      name: "npm (Node Package Manager)",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(
    page.locator(".writing-area button.concept").filter({ hasText: "npm" }),
  ).toHaveAttribute("title", "Installs and manages JavaScript packages.");
  await page.screenshot({ path: "test-results/definition-attachment.png" });
});
