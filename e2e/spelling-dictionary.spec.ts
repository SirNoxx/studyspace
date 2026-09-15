import { test, expect } from "@playwright/test";
test("personal spelling accepts words separately from definitions and can be undone in settings", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("sentnce and sentnce with neccessery.");
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(3);
  await editor.locator(".cm-spelling-error").first().click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add to spelling dictionary", exact: true })
    .click();
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(1);
  await expect(editor.locator(".cm-spelling-error")).toHaveText("neccessery");
  await expect(editor).toHaveText("sentnce and sentnce with neccessery.");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(1);
  await expect(editor.locator(".cm-spelling-error")).toHaveText("neccessery");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  const dictionary = page.getByRole("region", {
    name: "Spelling dictionary",
    exact: true,
  });
  await expect(dictionary.getByText("sentnce", { exact: true })).toBeVisible();
  await dictionary
    .getByRole("button", { name: "Remove spelling word sentnce", exact: true })
    .click();
  await expect(dictionary).toContainText("No custom spelling words yet.");
  await page.goBack();
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(3);
  await editor.locator(".cm-spelling-error").first().dblclick();
  await editor.locator(".cm-spelling-error").first().click({ button: "right" });
  const menu = page.getByRole("menu", {
    name: "Text context menu",
    exact: true,
  });
  await expect(
    menu.getByRole("menuitem", { name: "Create definition", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", {
      name: "Add to spelling dictionary",
      exact: true,
    }),
  ).toBeVisible();
  await menu
    .getByRole("menuitem", { name: "Add to spelling dictionary", exact: true })
    .click();
  await expect(editor.locator(".cm-spelling-error")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
