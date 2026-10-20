import { expect, test } from "@playwright/test";

const body =
  "# First\nIntroduction.\n\n## Child\nChild material.\n\n### Detail\nDeep material.\n\n## Peer\nPeer material.\n\n# Second\nSecond material.";

test("Live preview arrows survive reading/source switches, reload and cached note navigation", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await editor.fill(body);
  for (const mode of ["Reading", "Source", "Reading"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page
      .getByRole("button", { name: "Live preview", exact: true })
      .click();
    await expect(
      editor.getByRole("button", { name: "Collapse First", exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Collapse First", exact: true }),
  ).toBeVisible();
  await page
    .locator(".tree-row.note-row")
    .filter({ hasText: "Learning roadmap" })
    .click();
  await page
    .locator(".tree-row.note-row")
    .filter({ hasText: "Tool calling" })
    .click();
  await editor
    .getByRole("button", { name: "Collapse First", exact: true })
    .click();
  await expect(editor).not.toContainText("Introduction.");
  await expect(editor).toContainText("Second material.");
  await editor
    .getByRole("button", { name: "Expand First", exact: true })
    .click();
  await expect(editor).toContainText("Introduction.");
});

test("reading headings preserve peer sections and nested folds", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill(body);
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  const reading = page.locator(".writing-area .markdown:visible").first();
  await reading
    .getByRole("button", { name: "Collapse Child", exact: true })
    .click();
  await expect(
    reading.getByText("Child material.", { exact: true }),
  ).toBeHidden();
  await expect(
    reading.getByText("Deep material.", { exact: true }),
  ).toBeHidden();
  await expect(
    reading.getByText("Peer material.", { exact: true }),
  ).toBeVisible();
  await reading
    .getByRole("button", { name: "Collapse First", exact: true })
    .click();
  await expect(
    reading.getByText("Introduction.", { exact: true }),
  ).toBeHidden();
  await expect(
    reading.getByText("Peer material.", { exact: true }),
  ).toBeHidden();
  await expect(
    reading.getByRole("heading", { name: "Second", exact: true }),
  ).toBeVisible();
  await expect(
    reading.getByText("Second material.", { exact: true }),
  ).toBeVisible();
  await reading
    .getByRole("button", { name: "Expand First", exact: true })
    .press("Enter");
  await expect(
    reading.getByText("Introduction.", { exact: true }),
  ).toBeVisible();
  await expect(
    reading.getByText("Child material.", { exact: true }),
  ).toBeHidden();
  await reading
    .getByRole("button", { name: "Expand Child", exact: true })
    .click();
  await expect(
    reading.getByText("Deep material.", { exact: true }),
  ).toBeVisible();
  await reading
    .getByRole("button", { name: "Collapse Second", exact: true })
    .click();
  await expect(
    reading.getByText("Second material.", { exact: true }),
  ).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(
    reading.getByText("Second material.", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toHaveText(body, { useInnerText: true });
});

test("heading arrows fold only their section, preserve child folds and never change source", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill(body);
  await editor
    .getByRole("button", { name: "Collapse Child", exact: true })
    .click();
  await expect(editor).not.toContainText("Child material.");
  await expect(editor).not.toContainText("Deep material.");
  await expect(editor).toContainText("Peer material.");
  await expect(
    editor.getByRole("button", { name: "Expand Child", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await editor
    .getByRole("button", { name: "Collapse First", exact: true })
    .click();
  await expect(editor).not.toContainText("Peer material.");
  await expect(editor).not.toContainText("Introduction.");
  await expect(editor).toContainText("Second material.");
  await expect(
    editor.getByRole("button", { name: "Expand First", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor).toContainText("Introduction.");
  await expect(
    editor.getByRole("button", { name: "Expand Child", exact: true }),
  ).toBeVisible();
  await expect(editor).not.toContainText("Child material.");
  await editor
    .getByRole("button", { name: "Expand Child", exact: true })
    .click();
  await expect(editor).toContainText("Deep material.");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  // Folding adds controls, never Markdown or hidden-note content changes.
  await expect(editor).toHaveText(body, { useInnerText: true });
  await editor
    .getByRole("button", { name: "Collapse Second", exact: true })
    .click();
  await expect(editor).not.toContainText("Second material.");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toHaveText(body, { useInnerText: true });
});

test("folds task lists and embedded code blocks together without deleting them", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill(
    "# Tasks\n- [ ] Learn folding\n\n```javascript studyspace:fold-test\nconsole.log('Preserved');\n```\n\n# Next\nStill here.",
  );
  await expect(
    editor.getByRole("checkbox", { name: "Learn folding", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-cell-widget")).toHaveCount(1);
  await editor
    .getByRole("button", { name: "Collapse Tasks", exact: true })
    .click();
  await expect(editor.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator(".code-cell-widget")).toHaveCount(0);
  await expect(editor).toContainText("Still here.");
  await editor
    .getByRole("button", { name: "Expand Tasks", exact: true })
    .click();
  await expect(
    editor.getByRole("checkbox", { name: "Learn folding", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-cell-widget")).toHaveCount(1);
  await page.screenshot({ path: "test-results/heading-folds.png" });
});
