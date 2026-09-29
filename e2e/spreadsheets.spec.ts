import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { blankWorkbook } from "../src/lib/spreadsheets/model";
import { mergeWorkbook } from "../src/lib/spreadsheets/concurrency";

test("clearing cells removes content and styling, and undo restores both", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:clear-style\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module");
  const cell = module.locator('td[data-sheet-row="0"][data-sheet-column="0"]');
  await expect(cell).toBeVisible({ timeout: 90000 });
  const defaults = await cell.evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    font: getComputedStyle(el).fontSize,
    weight: getComputedStyle(el).fontWeight,
  }));
  await cell.dblclick();
  await module.getByLabel("Edit cell A1").fill("Keep me on undo");
  await module.getByLabel("Edit cell A1").press("Tab");
  await cell.click();
  await module.getByLabel("Spreadsheet cell color").fill("#113355");
  await module.getByLabel("Spreadsheet font size", { exact: true }).fill("24");
  await module.getByRole("button", { name: "Bold", exact: true }).click();
  const styled = async () => {
    await expect(cell).toHaveText("Keep me on undo");
    await expect(cell).toHaveCSS("background-color", "rgb(17, 51, 85)");
    await expect(cell).toHaveCSS("font-size", "32px");
    await expect(cell).toHaveCSS("font-weight", "700");
  };
  const cleared = async () => {
    await expect(cell).toHaveText("");
    await expect(cell).toHaveCSS("background-color", defaults.background);
    await expect(cell).toHaveCSS("font-size", defaults.font);
    await expect(cell).toHaveCSS("font-weight", defaults.weight);
  };
  await styled();
  await cell.press("Delete");
  await cleared();
  await module.getByRole("button", { name: "Undo", exact: true }).click();
  await styled();
  await module.getByRole("button", { name: "Edit", exact: true }).click();
  await module
    .getByRole("button", { name: "Clear contents", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await cleared();
  await module.getByRole("button", { name: "Undo", exact: true }).click();
  await styled();
  await cell.dblclick();
  await module.getByLabel("Edit cell A1").fill("");
  await module.getByLabel("Edit cell A1").press("Enter");
  await cleared();
  await expect(module.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await cleared();
});

test("cell clicks keep row positions stable and Ctrl-wheel scrolls the grid", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:scroll-sheet\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module"),
    grid = module.getByRole("grid");
  await expect(grid).toBeVisible({ timeout: 90000 });
  const firstRow = () => grid.locator("tbody tr").first().locator("th");
  await expect(firstRow()).toHaveText("1");
  await module
    .getByRole("gridcell", { name: "A9: Empty", exact: true })
    .click();
  await expect(firstRow()).toHaveText("1");
  await module
    .getByRole("gridcell", { name: "F9: Empty", exact: true })
    .click();
  await expect(grid.locator("thead th").nth(1)).toHaveText("A");
  await grid.dispatchEvent("wheel", {
    deltaY: 200,
    bubbles: true,
    cancelable: true,
  });
  await expect(firstRow()).toHaveText("1");
  await grid.dispatchEvent("wheel", {
    deltaY: 200,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  await expect(firstRow()).toHaveText("3");
  await grid.dispatchEvent("wheel", {
    deltaY: 100,
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  await expect(grid.locator("thead th").nth(1)).toHaveText("B");
  await module
    .getByRole("gridcell", { name: "B3: Empty", exact: true })
    .click();
  await expect(firstRow()).toHaveText("3");
});

test("top toolbar formats the selection, undoes changes and scales only the grid", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:toolbar-sheet\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module");
  const grid = module.getByRole("grid");
  await expect(grid).toBeVisible({ timeout: 90000 });
  const toolbar = module.getByRole("group", {
    name: "Spreadsheet formatting toolbar",
    exact: true,
  });
  await expect(toolbar).toBeVisible();
  expect((await toolbar.boundingBox())!.y).toBeLessThan(
    (await grid.boundingBox())!.y,
  );
  await module
    .getByLabel("Spreadsheet cell text or formula")
    .fill("Study data");
  await module
    .getByRole("button", { name: "Apply cell value", exact: true })
    .click();
  const cell = module.getByRole("gridcell", {
    name: "A1: Study data",
    exact: true,
  });
  const bold = toolbar.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(cell).toHaveCSS("font-weight", "700");
  await toolbar.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await toolbar.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(cell).toHaveCSS("font-style", "italic");
  await toolbar
    .getByLabel("Spreadsheet font", { exact: true })
    .selectOption("Georgia");
  await expect(cell).toHaveCSS("font-family", "Georgia");
  const fontSize = toolbar.getByLabel("Spreadsheet font size", { exact: true });
  await fontSize.fill("18");
  await expect(cell).toHaveCSS("font-size", "24px");
  await expect(fontSize).toBeFocused();
  await fontSize.press("ArrowUp");
  await expect(fontSize).toHaveValue("19");
  await expect(fontSize).toBeFocused();
  await fontSize.fill("24");
  await expect(cell).toHaveCSS("font-size", "32px");
  await fontSize.fill("2");
  await expect(cell).toHaveCSS("font-size", "32px");
  await fontSize.press("Tab");
  await expect(fontSize).toHaveValue("24");
  await fontSize.fill("18");
  await expect(cell).toHaveCSS("font-size", "24px");
  for (const alignment of ["center", "right", "left"]) {
    await toolbar
      .getByRole("button", { name: `Align ${alignment}`, exact: true })
      .click();
    await expect(cell).toHaveCSS("text-align", alignment);
  }
  await toolbar.getByLabel("Spreadsheet cell color").fill("#113355");
  await expect(cell).toHaveCSS("background-color", "rgb(17, 51, 85)");
  await toolbar.getByLabel("Border sides", { exact: true }).selectOption("ALL");
  await expect(cell).toHaveCSS("border-top-color", "rgb(115, 155, 142)");
  await toolbar
    .getByLabel("Border sides", { exact: true })
    .selectOption("NONE");
  await expect(cell).not.toHaveCSS("border-top-color", "rgb(115, 155, 142)");
  await toolbar.getByLabel("Spreadsheet UI scale").selectOption("150");
  await expect(grid).toHaveCSS("zoom", "1.5");
  await expect(cell).toHaveCSS("font-size", "24px");
  await module
    .getByRole("gridcell", { name: "B1: Empty", exact: true })
    .click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(
    toolbar.getByLabel("Spreadsheet font size", { exact: true }),
  ).toHaveValue("11");
  await module
    .getByRole("button", { name: "Expand spreadsheet", exact: true })
    .click();
  await toolbar.getByLabel("Spreadsheet UI scale").selectOption("100");
  await page.screenshot({ path: "test-results/spreadsheet-toolbar.png" });
});

test("spreadsheet edits, groups, formulas and backup survive reopening", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Spreadsheet", exact: true })
    .click();
  const module = page.locator(".spreadsheet-module");
  await expect(
    module.getByRole("grid", { name: "Spreadsheet cells" }),
  ).toBeVisible({ timeout: 90000 });
  const address = module.getByRole("textbox", {
    name: "Spreadsheet cell or range",
  });
  const value = module.getByRole("textbox", {
    name: "Spreadsheet cell text or formula",
  });
  const set = async (cell: string, text: string) => {
    await address.fill(cell);
    await module
      .getByRole("button", { name: "Go to range", exact: true })
      .click();
    await value.fill(text);
    await module
      .getByRole("button", { name: "Apply cell value", exact: true })
      .click();
    await expect(module.getByRole("alert")).not.toBeVisible();
    await expect(module.getByRole("status")).toHaveText("Saved on this device");
  };
  await set("A1", "Biology");
  await set("B1", "4");
  await set("B2", "=B1*2");
  await expect(
    module.getByRole("gridcell", { name: "B2: 8", exact: true }),
  ).toBeVisible();
  await address.fill("A1:A2");
  await module
    .getByRole("button", { name: "Go to range", exact: true })
    .click();
  await module.getByRole("button", { name: "Insert", exact: true }).click();
  await module
    .getByRole("textbox", { name: "Spreadsheet group name" })
    .fill("Sciences");
  await module.getByRole("button", { name: "Group rows", exact: true }).click();
  await page.keyboard.press("Escape");
  const group = module.getByRole("button", { name: /Sciences \(rows\)/ });
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(
    module.getByRole("gridcell", { name: "A1: Biology", exact: true }),
  ).toHaveCount(0);
  await group.click();
  await expect(
    module.getByRole("gridcell", { name: "A1: Biology", exact: true }),
  ).toBeVisible();
  await expect(module.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(
    module.getByRole("gridcell", { name: "B2: 8", exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await module.getByRole("button", { name: "File", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await module.getByRole("button", { name: "Backup", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toMatch(
    /\.studyspace-sheet\.json$/,
  );
  await page.keyboard.press("Escape");
  await module
    .getByRole("button", { name: "Expand spreadsheet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Expanded spreadsheet" }),
  ).toBeVisible();
  expect((await module.boundingBox())!.width).toBeGreaterThan(1000);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Expanded spreadsheet" }),
  ).toHaveCount(0);
  await module
    .getByRole("gridcell", { name: "B2: 8", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Clear contents", exact: true })
    .click();
  await expect(
    module.getByRole("gridcell", { name: "B2: Empty", exact: true }),
  ).toBeVisible();
  await expect(module.getByRole("status")).toHaveText("Saved on this device");
});

test("imports locally, supports keyboard editing and exposes an accessible grid", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:import-sheet\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module");
  await expect(module.getByRole("grid")).toBeVisible({ timeout: 90000 });
  await module.getByRole("button", { name: "File", exact: true }).click();
  await module
    .getByText("Import Excel or Google Sheets file", { exact: true })
    .click();
  await module.getByLabel("Import spreadsheet file").setInputFiles({
    name: "topics.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Topic,Code\nPhysics,0012\nChemistry,0013"),
  });
  await expect(
    module.getByRole("region", { name: "Spreadsheet import preview" }),
  ).toBeVisible({ timeout: 60000 });
  await module
    .getByRole("button", { name: "Replace workbook with selected sheets" })
    .click();
  await expect(
    module.getByRole("gridcell", { name: "B2: 0012", exact: true }),
  ).toBeVisible();
  const first = module.getByRole("gridcell", {
    name: "A1: Topic",
    exact: true,
  });
  await first.focus();
  await first.press("ArrowRight");
  await expect(
    module.getByRole("gridcell", { name: "B1: Code", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("F2");
  await expect(module.getByLabel("Edit cell B1")).toBeFocused();
  await module.getByLabel("Edit cell B1").fill("Identifier");
  await page.keyboard.press("Control+Enter");
  await expect(
    module.getByRole("gridcell", { name: "B1: Identifier", exact: true }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .include(".spreadsheet-module")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await module.getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await module
    .getByRole("button", { name: "Export Excel", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "test-results/spreadsheet-accessible.png" });
});

test("opens a 10,000-cell workbook and recalculates the supported formula baseline", async ({
  page,
}, testInfo) => {
  const workbook = blankWorkbook(crypto.randomUUID()),
    sheet = workbook.sheets["sheet-1"];
  sheet.rowCount = 1000;
  for (let r = 0; r < 1000; r++) {
    sheet.cellData[r] = {};
    for (let c = 0; c < 10; c++) sheet.cellData[r][c] = { v: r + c, t: 2 };
  }
  const formulas = [
    "=SUM(A1:A3)",
    "=AVERAGE(A1:A3)",
    "=MIN(A1:A3)",
    "=MAX(A1:A3)",
    "=COUNT(A1:A3)",
    '=IF(A2>0,"Yes","No")',
    "=$A$2+$A$3",
  ];
  formulas.forEach((f, r) => (sheet.cellData[r][1] = { f }));
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:performance-sheet\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module");
  await expect(module.getByRole("grid")).toBeVisible({ timeout: 90000 });
  await module.getByRole("button", { name: "File", exact: true }).click();
  await module
    .getByText("Import Excel or Google Sheets file", { exact: true })
    .click();
  await module.getByLabel("Import spreadsheet file").setInputFiles({
    name: "benchmark.studyspace-sheet.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, snapshot: workbook })),
  });
  const replace = module.getByRole("button", {
    name: "Replace workbook with selected sheets",
  });
  await expect(replace).toBeVisible({ timeout: 60000 });
  const started = Date.now();
  await replace.click();
  for (const [i, value] of ["3", "1", "0", "2", "3", "Yes", "3"].entries())
    await expect(
      module.getByRole("gridcell", {
        name: `B${i + 1}: ${value}`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
  await testInfo.attach("10000-cell-ready", {
    body: JSON.stringify({
      populatedCells: 10000,
      importApplyToAssertionsMs: Date.now() - started,
      browser: await page.context().browser()!.version(),
      note: "Includes test-driver overhead; not a hardware-independent latency guarantee.",
    }),
    contentType: "application/json",
  });
});

test("two editors receive live cell changes through the shared resource adapter", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const id = crypto.randomUUID(),
    collection = crypto.randomUUID(),
    history = new Map<number, ReturnType<typeof blankWorkbook>>();
  let current = {
    id,
    snapshot: blankWorkbook(id),
    revision: 1,
    updated_at: new Date().toISOString(),
  };
  history.set(1, structuredClone(current.snapshot));
  try {
    for (const ctx of [a, b])
      await ctx.route("**/api/shared/spreadsheets**", async (route) => {
        if (route.request().method() === "POST") {
          const input = route.request().postDataJSON();
          try {
            const snapshot =
              input.revision === current.revision
                ? input.snapshot
                : mergeWorkbook(
                    history.get(input.revision)!,
                    input.snapshot,
                    current.snapshot,
                  );
            current = { ...current, snapshot, revision: current.revision + 1 };
            history.set(current.revision, structuredClone(snapshot));
            await route.fulfill({ json: { workbook: current } });
          } catch (e) {
            await route.fulfill({
              status: 409,
              json: { error: (e as Error).message },
            });
          }
        } else
          await route.fulfill({ json: { workbook: current, readOnly: false } });
      });
    const pages = await Promise.all([a.newPage(), b.newPage()]);
    for (const page of pages) {
      await page.goto("/demo?sample=1");
      await page
        .getByRole("textbox", { name: "Markdown editor", exact: true })
        .waitFor();
      await page.locator(".writing-area").evaluate((el, collection) => {
        (el as HTMLElement).dataset.workbookCollection = collection;
      }, collection);
      await page
        .getByRole("textbox", { name: "Markdown editor", exact: true })
        .fill(
          "```module studyspace:shared-sheet\n" +
            JSON.stringify({
              version: 1,
              kind: "spreadsheet",
              workbookId: id,
            }) +
            "\n```",
        );
      await expect(
        page.locator(".spreadsheet-module").getByRole("grid"),
      ).toBeVisible({ timeout: 90000 });
    }
    const first = pages[0].locator(".spreadsheet-module"),
      second = pages[1].locator(".spreadsheet-module");
    await first
      .getByLabel("Spreadsheet cell text or formula")
      .fill("Live collaborator value");
    await first
      .getByRole("button", { name: "Apply cell value", exact: true })
      .click();
    await expect(first.getByRole("alert")).not.toBeVisible();
    await expect(first.getByRole("status")).toHaveText(
      "Synced with collaborators",
      { timeout: 20000 },
    );
    await expect(
      second.getByRole("gridcell", {
        name: "A1: Live collaborator value",
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    await second.getByLabel("Spreadsheet cell or range").fill("B1");
    await second
      .getByRole("button", { name: "Go to range", exact: true })
      .click();
    await second
      .getByLabel("Spreadsheet cell text or formula")
      .fill("Second editor");
    await second
      .getByRole("button", { name: "Apply cell value", exact: true })
      .click();
    await expect(
      first.getByRole("gridcell", { name: "B1: Second editor", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      first.getByRole("gridcell", {
        name: "A1: Live collaborator value",
        exact: true,
      }),
    ).toBeVisible();
    for (const [module, address, value] of [
      [first, "A2", "Concurrent Alice"],
      [second, "B2", "Concurrent Bob"],
    ] as const) {
      await module.getByLabel("Spreadsheet cell or range").fill(address);
      await module
        .getByRole("button", { name: "Go to range", exact: true })
        .click();
      await module.getByLabel("Spreadsheet cell text or formula").fill(value);
    }
    await Promise.all(
      [first, second].map((module) =>
        module
          .getByRole("button", { name: "Apply cell value", exact: true })
          .click(),
      ),
    );
    await expect(
      first.getByRole("gridcell", { name: "B2: Concurrent Bob", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      second.getByRole("gridcell", {
        name: "A2: Concurrent Alice",
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
  } finally {
    await a.close();
    await b.close();
  }
});

test("type directly into cells with formulas, commit, cancel and clipboard text", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:inline-cells\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module");
  await expect(module.getByRole("grid")).toBeVisible({ timeout: 90000 });
  const cell = (name: string) =>
    module.getByRole("gridcell", { name, exact: true });
  await cell("A1: Empty").click();
  await page.keyboard.type("12");
  await expect(module.getByLabel("Edit cell A1")).toHaveValue("12");
  await page.keyboard.press("Tab");
  await expect(cell("A1: 12")).toBeVisible();
  await expect(cell("B1: Empty")).toBeFocused();
  await page.keyboard.type("=A1*2");
  await expect(module.getByLabel("Edit cell B1")).toHaveValue("=A1*2");
  await page.keyboard.press("Enter");
  await expect(cell("B1: 24")).toBeVisible({ timeout: 20000 });
  await expect(cell("B2: Empty")).toBeFocused();
  await cell("A1: 12").dblclick();
  await expect(module.getByLabel("Edit cell A1")).toHaveValue("12");
  await module.getByLabel("Edit cell A1").fill("99");
  await page.keyboard.press("Escape");
  await expect(cell("A1: 12")).toBeFocused();
  await cell("A1: 12").press("F2");
  await module.getByLabel("Edit cell A1").fill("21");
  await cell("A2: Empty").click();
  await expect(cell("A1: 21")).toBeVisible();
  await expect(cell("B1: 42")).toBeVisible();
  await page.keyboard.type("Copied text");
  const input = module.getByLabel("Edit cell A2");
  await input.press("Control+a");
  await input.press("Control+c");
  await input.press("End");
  await input.press("Control+v");
  await expect(input).toHaveValue("Copied textCopied text");
  await page.keyboard.press("Alt+Enter");
  await page.keyboard.type("Another line");
  await expect(input).toHaveValue("Copied textCopied text\nAnother line");
  await page.keyboard.press("Tab");
  await cell("B2: Empty").press("F2");
  await module
    .getByLabel("Edit cell B2")
    .fill('=WEBSERVICE("https://example.com")');
  await page.keyboard.press("Enter");
  await expect(module.getByRole("alert")).toContainText("network formulas");
  await expect(module.getByLabel("Edit cell B2")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(cell("B2: Empty")).toBeFocused();
  await expect(module.getByRole("status")).toHaveText("Saved on this device");
  await page.reload();
  await expect(cell("B1: 42")).toBeVisible({ timeout: 90000 });
});

test("category dropdowns overlay the grid and dismiss without resizing it", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill(
      "```module studyspace:menu-sheet\n" +
        JSON.stringify({
          version: 1,
          kind: "spreadsheet",
          workbookId: crypto.randomUUID(),
        }) +
        "\n```",
    );
  const module = page.locator(".spreadsheet-module");
  const grid = module.getByRole("grid");
  await expect(grid).toBeVisible({ timeout: 90000 });
  const before = (await grid.boundingBox())!;
  const file = module.getByRole("button", { name: "File", exact: true });
  await file.click();
  const dropdown = module.getByRole("dialog", {
    name: "File spreadsheet tools",
    exact: true,
  });
  await expect(dropdown).toBeVisible();
  expect((await dropdown.boundingBox())!.width).toBeLessThanOrEqual(340);
  expect(Math.abs((await grid.boundingBox())!.y - before.y)).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await expect(dropdown).toHaveCount(0);
  await expect(file).toBeFocused();
  await file.press("ArrowDown");
  await expect(dropdown).toBeVisible();
  await module.getByRole("button", { name: "Format", exact: true }).click();
  await expect(
    module.getByRole("dialog", {
      name: "Format spreadsheet tools",
      exact: true,
    }),
  ).toBeVisible();
  await module.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(module.locator(".sheet-menu-panel")).toHaveCount(0);
  await module
    .getByRole("button", { name: "Expand spreadsheet", exact: true })
    .click();
  await file.click();
  await expect(dropdown).toBeVisible();
  await page.screenshot({ path: "test-results/spreadsheet-dropdown.png" });
  await page.keyboard.press("Escape");
  await expect(dropdown).toHaveCount(0);
  await expect(module).toHaveClass(/spreadsheet-expanded/);
});
