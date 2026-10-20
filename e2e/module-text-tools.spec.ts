import { test, expect } from "@playwright/test";
const tableBody =
  "```module studyspace:text-table\n" +
  JSON.stringify({
    version: 1,
    kind: "table",
    headers: ["Concept"],
    rows: [["speling"]],
  }) +
  "\n```";

test("ordinary module prose supports clicked-word spelling and selection tools", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const body =
    "```module studyspace:uses-text\n" +
    JSON.stringify({ version: 1, kind: "uses", text: "speling correct" }) +
    "\n```";
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(body);
  const prose = page.getByRole("textbox", { name: "Use cases", exact: true });
  await prose.focus();
  await prose.press("Control+End");
  const rect = await prose.boundingBox();
  await page.mouse.click(rect!.x + 22, rect!.y + 18, { button: "right" });
  await page.getByRole("menuitem", { name: "spelling", exact: true }).click();
  await expect(prose).toHaveValue("spelling correct");
  await prose.press("Control+a");
  await prose.press("Control+i");
  await expect(prose).toHaveValue("*spelling correct*");
  await prose.press("Control+a");
  await expect(
    page
      .getByRole("toolbar", { name: "Selected module text actions" })
      .getByRole("button", { name: "Create definition", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(page.locator(".note-module-uses:visible em")).toHaveText(
    "spelling correct",
  );
});

test("module selections use study dialogs, formatting, links and spelling corrections", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(tableBody);
  const cell = page.getByRole("textbox", {
    name: "Row 1, column 1",
    exact: true,
  });
  await cell.click();
  await cell.press("Control+a");
  const toolbar = page.getByRole("toolbar", {
    name: "Selected module text actions",
  });
  await expect(
    toolbar.getByRole("button", { name: "Create definition", exact: true }),
  ).toBeVisible();
  await cell.click({ button: "right" });
  await page.getByRole("menuitem", { name: "spelling", exact: true }).click();
  await expect(cell).toHaveValue("spelling");
  await cell.fill("Concept");
  await cell.press("Control+a");
  await cell.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Bold", exact: true }).click();
  await expect(cell).toHaveValue("**Concept**");
  await cell.fill("Visit guide");
  await cell.press("Control+a");
  await toolbar
    .getByRole("button", {
      name: "Insert or edit link / definition",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("URL", { exact: true })
    .fill("https://example.com/guide");
  await dialog.getByRole("button", { name: "Save link", exact: true }).click();
  await expect(cell).toHaveValue("[Visit guide](https://example.com/guide)");
  await cell.fill("Cell concept");
  await cell.press("Control+a");
  await toolbar
    .getByRole("button", { name: "Create definition", exact: true })
    .click();
  await expect(dialog.getByRole("heading", { name: "Define", exact: true })).toBeVisible();
  await dialog
    .getByLabel("Definition", { exact: true })
    .fill("Created from module text.");
  await dialog
    .getByLabel("Definition", { exact: true })
    .press("Enter");
  await cell.click();
  await cell.press("Control+a");
  await toolbar
    .getByRole("button", { name: "Create study card", exact: true })
    .click();
  await expect(dialog).toContainText("Cell concept");
});

test("definition module attaches an existing entry, renames itself, and persists without a duplicate", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const body =
    "```module studyspace:attached-definition\n" +
    JSON.stringify({
      version: 1,
      kind: "definition",
      term: "",
      explanation: "",
      learned: false,
    }) +
    "\n```";
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(body);
  const module = page.locator(".note-module-definition:visible");
  await module
    .getByRole("button", { name: "Attach a definition", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Search definitions", { exact: true })
    .fill("Grounding");
  await dialog.getByRole("button").filter({ hasText: "Grounding" }).click();
  await expect(
    module.getByRole("textbox", { name: "Term to define", exact: true }),
  ).toHaveValue("Grounding");
  await expect(
    module.getByRole("textbox", { name: "Module title", exact: true }),
  ).toHaveValue("Grounding definition");
  await expect(
    module.getByRole("textbox", { name: "Definition", exact: true }),
  ).not.toHaveValue("");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    module.getByRole("textbox", { name: "Module title", exact: true }),
  ).toHaveValue("Grounding definition");
  await module
    .getByRole("button", { name: "Attach a definition", exact: true })
    .click();
  await dialog
    .getByLabel("Search definitions", { exact: true })
    .fill("Grounding");
  await expect(
    dialog.getByRole("button").filter({ hasText: "Grounding" }),
  ).toHaveCount(1);
});
