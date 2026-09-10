import { test, expect } from "@playwright/test";
test("code can be rerun repeatedly and restarted before the last run completes", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add code block", exact: true })
    .click();
  const block = page.getByRole("region", { name: "Code block", exact: true }),
    editor = block.getByRole("textbox", { name: "Code editor", exact: true });
  const run = block.getByRole("button", { name: "Run", exact: true }),
    output = block.getByLabel("Code output");
  for (let i = 0; i < 4; i++) {
    await editor.fill(`console.log(${i});`);
    await run.click();
    await expect(output).toHaveText(String(i));
    await expect(run).toBeEnabled();
  }
  await editor.fill(
    "await new Promise(resolve => setTimeout(resolve, 3000)); console.log('old result');",
  );
  await run.click();
  await expect(
    block.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await editor.fill("console.log('new result');");
  await run.click();
  await expect(output).toHaveText("new result");
  await expect(
    block.getByRole("button", { name: "Stop", exact: true }),
  ).toHaveCount(0);
  await editor.fill("throw new Error('example failure');");
  await run.click();
  await expect(output).toContainText("example failure");
  await editor.fill("console.log('recovered');");
  await run.click();
  await expect(output).toHaveText("recovered");
});
test("code typing in the right pane survives workspace rerenders", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .locator(".note-row")
    .filter({ hasText: "Learning roadmap" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open file to the right" }).click();
  const pane = page.getByRole("region", { name: "Right file pane" });
  await pane
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add code block", exact: true })
    .click();
  const code = pane.getByRole("textbox", { name: "Code editor", exact: true });
  await code.fill("// example\n");
  await code.press("Control+End");
  await page.keyboard.type("const result = 42;", { delay: 150 });
  await expect(code).toBeFocused();
  await expect(code).toContainText("const result = 42;");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await expect(code).toBeFocused();
});
test("code editor keeps focus while saving and titles survive reopening", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add code block", exact: true })
    .click();
  const block = page.getByRole("region", { name: "Code block", exact: true });
  await block
    .getByLabel("Code block title", { exact: true })
    .fill("Example calculation");
  const editor = block.getByRole("textbox", {
    name: "Code editor",
    exact: true,
  });
  await editor.fill("// typing test\n");
  await editor.press("Control+End");
  await page.keyboard.type("const total = 3 + 4;", { delay: 150 });
  await expect(editor).toBeFocused();
  await expect(editor).toContainText("const total = 3 + 4;");
  for (const language of ["c", "cpp", "typescript"]) {
    await block.getByLabel("Code language").selectOption(language);
    await expect(editor).toContainText("const total = 3 + 4;");
    await expect(
      block.getByRole("button", { name: "Run", exact: true }),
    ).toBeDisabled();
  }
  await block.getByLabel("Code language").selectOption("javascript");
  await expect(
    block.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
  await editor.click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await expect(editor).toBeFocused();
  await block.getByRole("button", { name: "Collapse code block" }).click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    block.getByLabel("Code block title", { exact: true }),
  ).toHaveValue("Example calculation");
  await block.getByRole("button", { name: "Expand code block" }).click();
  await expect(editor).toContainText("const total = 3 + 4;");
});

test("whiteboard draws, erases, undoes, exports and persists in notes", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add whiteboard", exact: true })
    .click();
  const board = page.getByRole("region", { name: "Whiteboard", exact: true });
  await board
    .getByLabel("Whiteboard title", { exact: true })
    .fill("Cell diagram");
  const surface = board.getByRole("img", {
    name: "Whiteboard drawing surface",
  });
  await surface.scrollIntoViewIfNeeded();
  const draw = async (y: number) => {
    const rect = (await surface.boundingBox())!;
    await page.mouse.move(rect.x + rect.width * 0.15, rect.y + rect.height * y);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width * 0.7,
      rect.y + rect.height * (y + 0.1),
      { steps: 12 },
    );
    await page.mouse.up();
  };
  await draw(0.2);
  await expect(board.locator("[data-stroke-id]")).toHaveCount(1);
  await board.getByRole("button", { name: "Highlighter", exact: true }).click();
  await draw(0.4);
  await expect(board.locator("[data-stroke-id]")).toHaveCount(2);
  await expect(board.locator("[data-stroke-id]").last()).toHaveAttribute(
    "opacity",
    "0.3",
  );
  await board.getByRole("button", { name: "Rectangle", exact: true }).click();
  await draw(0.6);
  await expect(board.locator("[data-stroke-id]")).toHaveCount(3);
  await board.getByRole("button", { name: "Undo drawing" }).click();
  await expect(board.locator("[data-stroke-id]")).toHaveCount(2);
  await board.getByRole("button", { name: "Redo drawing" }).click();
  await expect(board.locator("[data-stroke-id]")).toHaveCount(3);
  await board.getByRole("button", { name: "Eraser", exact: true }).click();
  await draw(0.2);
  await expect(board.locator("[data-stroke-id]")).toHaveCount(2);
  await board.getByRole("button", { name: "Undo drawing" }).click();
  await expect(board.locator("[data-stroke-id]")).toHaveCount(3);
  await board.getByLabel("Whiteboard background").selectOption("grid");
  const downloaded = page.waitForEvent("download");
  await board.getByRole("button", { name: "Export PNG", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("Cell diagram.png");
  await board.getByRole("button", { name: "Collapse whiteboard" }).click();
  await expect(board).toContainText("3 strokes · Drawing saved");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await board.getByRole("button", { name: "Expand whiteboard" }).click();
  await expect(
    board.getByLabel("Whiteboard title", { exact: true }),
  ).toHaveValue("Cell diagram");
  await expect(board.locator("[data-stroke-id]")).toHaveCount(3);
  await expect(board.getByLabel("Whiteboard background")).toHaveValue("grid");
  await board.getByRole("button", { name: "Enlarge whiteboard" }).click();
  await expect(
    page.getByRole("dialog", { name: "Cell diagram" }),
  ).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/whiteboard.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  const reading = page.locator(".writing-area > .markdown");
  await expect(
    reading.getByRole("img", { name: "Saved whiteboard drawing" }),
  ).toBeVisible();
  await expect(reading).toContainText("Cell diagram");
});
