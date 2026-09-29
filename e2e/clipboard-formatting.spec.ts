import { test, expect, type Locator } from "@playwright/test";

async function paste(editor: Locator, plain: string, html = "") {
  await editor.evaluate(
    (element, { plain, html }) => {
      const data = new DataTransfer();
      data.setData("text/plain", plain);
      if (html) data.setData("text/html", html);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { plain, html },
  );
}

test("pasted Markdown becomes a heading and editable table in one undoable operation", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("");
  await paste(
    editor,
    "Suggested order\n\n| **PhaseGoalDepends on** | | |\n| --- | --- | --- |\n| 0 | **One codebase** | Nothing |\n| 1 | Tool list | Phase 0 |",
  );
  const table = page.locator(".note-module-table");
  await expect(
    table.getByRole("button", { name: "Convert to spreadsheet", exact: true }),
  ).toHaveCount(0);
  await table
    .getByRole("button", { name: "Module options", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Convert to spreadsheet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Convert table to spreadsheet",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(table.getByLabel("Column 1 heading")).toHaveValue("**Phase**");
  await expect(
    table.getByLabel("Row 1, column 2", { exact: true }),
  ).toHaveValue("**One codebase**");
  await editor.press("Control+z");
  await expect(table).toHaveCount(0);
  await editor.press("Control+y");
  await expect(table).toBeVisible();
  await table
    .getByLabel("Row 2, column 2", { exact: true })
    .fill("Edited goal");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Suggested order", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".note-module-table strong")
      .filter({ hasText: "One codebase" }),
  ).toBeVisible();
  await expect(page.locator(".note-module-table:visible")).toContainText(
    "Edited goal",
  );
  await page.screenshot({ path: "test-results/paste-formatted-table.png" });
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".note-module-table:visible")).toContainText(
    "Edited goal",
  );
});

test("rich clipboard keeps headings, separate columns and bold prose", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("");
  await paste(
    editor,
    "Suggested order PhaseGoalDepends on0One codebaseNothing",
    "<h2>Suggested order</h2><table><thead><tr><th>Phase</th><th>Goal</th><th>Depends on</th></tr></thead><tbody><tr><td><p>0</p></td><td><p><strong>One codebase</strong></p><p>Production fixed</p></td><td><p>Nothing</p></td></tr></tbody></table><p><strong>Things only you can do:</strong> Choose a plan.</p>",
  );
  await expect(
    page.locator(".note-module-table").getByLabel("Column 2 heading"),
  ).toHaveValue("Goal");
  await expect(
    page
      .locator(".note-module-table")
      .getByLabel("Row 1, column 2", { exact: true }),
  ).toHaveValue("**One codebase**\n\nProduction fixed");
  await expect(
    page
      .locator(".note-module-table")
      .getByLabel("Row 1, column 3", { exact: true }),
  ).toHaveValue("Nothing");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Suggested order", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("strong").filter({ hasText: "Things only you can do:" }),
  ).toBeVisible();
});

test("pasting a table inside a code example stays literal", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("```text\nexample\n```");
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("Home");
  await paste(editor, "| A | B |\n| --- | --- |\n| x | y |\n");
  await expect(editor).toContainText("| A | B |");
  await expect(editor).not.toContainText('"kind":"table"');
});
