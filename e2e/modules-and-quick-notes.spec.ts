import { test, expect } from "@playwright/test";
test("modules insert, edit, persist and render in Reading mode", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Modules", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search modules").fill("cornell");
  await page
    .getByRole("button", { name: "Add Cornell notes", exact: true })
    .click();
  const cornell = page.getByRole("region", { name: "cornell module" });
  await cornell
    .getByLabel("Cues & questions", { exact: true })
    .fill("How does retrieval help?");
  await cornell
    .getByLabel("Notes", { exact: true })
    .fill("Practice retrieving ideas from memory.");
  await cornell
    .getByLabel("Summary", { exact: true })
    .fill("Recall strengthens learning.");
  for (const title of [
    "Table",
    "Chart",
    "Venn diagram",
    "Formatted list",
    "To-do list",
    "Paper",
    "Calendar",
  ]) {
    await page.getByRole("button", { name: "Modules", exact: true }).click();
    await page
      .getByRole("button", { name: "Add " + title, exact: true })
      .click();
    if (title === "Table") {
      await page.getByLabel("Column 1 heading").fill("Concept");
      await page
        .getByLabel("Row 1, column 1", { exact: true })
        .fill("Retrieval practice");
      await page.getByRole("button", { name: "Add row", exact: true }).click();
      await expect(
        page.getByLabel("Row 3, column 1", { exact: true }),
      ).toBeVisible();
    }
    if (title === "Chart") {
      await page.getByLabel("Chart value 1", { exact: true }).fill("9");
      await page.getByLabel("Chart type").selectOption("line");
      await expect(
        page.getByRole("img", { name: /line chart: A 9/ }),
      ).toBeVisible();
    }
    if (title === "Venn diagram") {
      await page.getByLabel("Topic A", { exact: true }).fill("Recall");
      await page.getByLabel("Shared ideas").fill("Learning");
    }
    if (title === "To-do list") {
      const todo = page.getByRole("region", { name: "list module" }).filter({
        has: page
          .getByLabel("Module title")
          .and(page.locator('[value="To-do list"]')),
      });
      await todo
        .getByLabel("List item 1", { exact: true })
        .fill("Review chapter");
      await todo.getByLabel("Complete task 1", { exact: true }).check();
    }
    if (title === "Paper")
      await page
        .getByLabel("Writing", { exact: true })
        .fill("A quiet place to think.");
    if (title === "Calendar") {
      await page.getByLabel("Calendar month").fill("2026-09");
      await page.getByLabel("Notes for 2026-09-10").fill("Study session");
      await page
        .getByRole("button", { name: "Next month", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Previous month", exact: true })
        .click();
      await expect(page.getByLabel("Notes for 2026-09-10")).toHaveValue(
        "Study session",
      );
    }
  }
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "paper module" }),
  ).toContainText("A quiet place to think.");
  await expect(
    page.getByRole("region", { name: "cornell module" }),
  ).toContainText("Practice retrieving ideas from memory.");
  await expect(
    page.getByRole("region", { name: "calendar module" }),
  ).toContainText("Study session");
  await page.screenshot({ path: "docs/screenshots/note-modules.png" });
});
test("right-click gallery and module deletion undo work", async ({ page }) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Add a module", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Table", exact: true }).click();
  await page
    .getByLabel("Row 1, column 1", { exact: true })
    .fill("Retain this value");
  await page.getByRole("button", { name: "Module options" }).click();
  await page.getByRole("menuitem", { name: "Delete module" }).click();
  await expect(page.getByRole("region", { name: "table module" })).toHaveCount(
    0,
  );
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .press("Control+z");
  await expect(page.getByLabel("Row 1, column 1", { exact: true })).toHaveValue(
    "Retain this value",
  );
});
test("quick notes stay separate and move into nested folders", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await page
    .getByRole("button", { name: "New folder in Coding", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Folder name", exact: true })
    .fill("Research folder");
  await page
    .getByRole("textbox", { name: "Folder name", exact: true })
    .press("Enter");
  await page.getByRole("button", { name: "Quick notes", exact: true }).click();
  await page
    .getByRole("button", { name: "New quick note", exact: true })
    .click();
  await page.getByLabel("Quick note title").fill("An unfiled idea");
  await page.getByLabel("Quick note body").fill("Remember this thought.");
  await expect(page.getByText("Save to", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save & open", exact: true }).click();
  await expect(page.getByLabel("Note title", { exact: true })).toHaveValue(
    "An unfiled idea",
  );
  await expect(page.locator(".file-tree")).not.toContainText("An unfiled idea");
  await page
    .getByRole("button", { name: "Move to collection / folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand Coding", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move into Research folder", exact: true })
    .click();
  await expect(
    page.getByText("This thought is unfiled.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Quick notes", exact: true }).click();
  await expect(page.locator(".quick-notes-list")).not.toContainText(
    "An unfiled idea",
  );
});
test("AI personality is saved and attached to new requests", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page
    .getByLabel("AI personality preferences")
    .fill("Use short examples and encourage me.");
  await page.getByText("Allow sending this selected context").click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Open AI Chat", exact: true }).click();
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await expect(page.getByLabel("AI personality preferences")).toHaveValue(
    "Use short examples and encourage me.",
  );
  let sent: any;
  await page.route("**/api/ai", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic test response" }),
    });
  });
  await page
    .getByRole("textbox", { name: "Chat message" })
    .fill("Explain this");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect
    .poll(() => sent?.personality)
    .toBe("Use short examples and encourage me.");
});
test("regular and pinned notes can move to Quick notes and stay there after reload", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const title = page.getByLabel("Note title", { exact: true });
  const noteTitle = await title.inputValue();
  const noteUrl = page.url();
  await page
    .locator(".note-row")
    .filter({ hasText: noteTitle })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Move to quick notes", exact: true })
    .click();
  await expect(title).toHaveValue(noteTitle);
  await expect(page.locator(".file-tree")).not.toContainText(noteTitle);
  await expect(
    page.getByText("This thought is unfiled.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  expect(page.url()).toBe(noteUrl);
  await expect(title).toHaveValue(noteTitle);
  await page.getByRole("button", { name: "Note actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Move to quick notes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Pin note", exact: true }).click();
  const pins = page.getByRole("region", { name: "Pinned notes", exact: true });
  await pins
    .getByRole("button", { name: noteTitle, exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Move to quick notes", exact: true })
    .click();
  await expect(pins).toHaveCount(0);
  await page
    .getByRole("button", { name: "Quick notes", exact: true })
    .first()
    .click();
  await expect(page.locator(".quick-notes-list")).toContainText(noteTitle);
  await page.locator(".quick-note-open").filter({ hasText: noteTitle }).click();
  await expect(title).toHaveValue(noteTitle);
});
test("Quick notes wrap long titles and previews within evenly padded content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Quick notes", exact: true }).click();
  await page
    .getByRole("button", { name: "New quick note", exact: true })
    .click();
  const longTitle = "LongStudyTopic".repeat(16);
  await page.getByLabel("Quick note title").fill(longTitle);
  await page.getByLabel("Quick note body").fill("longunbrokenlink".repeat(30));
  await page.getByRole("button", { name: "Save & open", exact: true }).click();
  await page
    .getByRole("button", { name: "Quick notes", exact: true })
    .first()
    .click();
  const card = page
    .locator(".quick-notes-list article")
    .filter({ hasText: longTitle });
  await expect(card).toBeVisible();
  const geometry = await card.evaluate((el) => {
    const text = el.querySelector(".quick-note-open")!;
    const parent = el.closest(".workspace-view")!;
    const list = el.parentElement!;
    const rect = el.getBoundingClientRect();
    const main = el.closest("main")!.getBoundingClientRect();
    const style = getComputedStyle(parent);
    return {
      textOverflow: text.scrollWidth - text.clientWidth,
      listOverflow: list.scrollWidth - list.clientWidth,
      right: rect.right,
      mainRight: main.right,
      leftPadding: style.paddingLeft,
      rightPadding: style.paddingRight,
      wraps: getComputedStyle(text.querySelector("strong")!).whiteSpace,
    };
  });
  expect(geometry.textOverflow).toBeLessThanOrEqual(1);
  expect(geometry.listOverflow).toBeLessThanOrEqual(1);
  expect(geometry.right).toBeLessThan(geometry.mainRight);
  expect(geometry.leftPadding).toBe(geometry.rightPadding);
  expect(geometry.wraps).toBe("normal");
});
