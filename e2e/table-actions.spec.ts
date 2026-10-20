import { test, expect } from "@playwright/test";
const body =
  "```module studyspace:table-actions\n" +
  JSON.stringify({
    version: 1,
    kind: "table",
    headers: ["A", "B", "C"],
    rows: [
      ["alpha", "beta", "gamma"],
      ["delta", "epsilon", "zeta"],
    ],
  }) +
  "\n```";

test("table context menu inserts and deletes the targeted rows and columns, then persists", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(body);
  const table = page.locator(".note-module-table");
  const cell = (r: number, c: number) =>
    table.getByRole("textbox", { name: `Row ${r}, column ${c}`, exact: true });
  await cell(2, 2).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Delete column", exact: true })
    .click();
  await expect(
    table.getByRole("textbox", { name: "Column 2 heading", exact: true }),
  ).toHaveValue("C");
  await expect(cell(1, 2)).toHaveValue("gamma");
  await expect(cell(2, 2)).toHaveValue("zeta");
  await cell(2, 2).click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "New column left", exact: true })
    .click();
  await expect(cell(2, 3)).toHaveValue("zeta");
  await expect(cell(2, 2)).toHaveValue("");
  await cell(2, 1).press("Shift+F10");
  await page
    .getByRole("menuitem", { name: "New row above", exact: true })
    .click();
  await expect(cell(3, 1)).toHaveValue("delta");
  await expect(cell(2, 1)).toHaveValue("");
  await cell(2, 1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete row", exact: true }).click();
  await expect(cell(2, 1)).toHaveValue("delta");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(cell(2, 3)).toHaveValue("zeta");
  await expect(cell(1, 2)).toHaveValue("");
});

test("table clipboard actions copy and cut cell text and paste spreadsheet cells", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(body);
  const table = page.locator(".note-module-table");
  const first = table.getByRole("textbox", {
    name: "Row 1, column 1",
    exact: true,
  });
  await first.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("alpha");
  await first.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
  await expect(first).toHaveValue("");
  await page.evaluate(() =>
    navigator.clipboard.writeText("one\ttwo\nthree\tfour"),
  );
  await first.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(first).toHaveValue("one");
  await expect(
    table.getByRole("textbox", { name: "Row 2, column 2", exact: true }),
  ).toHaveValue("four");
  await expect(
    table.getByRole("textbox", { name: "Row 2, column 3", exact: true }),
  ).toHaveValue("zeta");
  // Reading mode has copy actions only.
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page.locator(".note-module-table:visible").getByText("one", { exact: true }).click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Copy table", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Delete column", exact: true }),
  ).toHaveCount(0);
});
