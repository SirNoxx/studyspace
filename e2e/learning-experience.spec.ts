import { test, expect } from "@playwright/test";
test("module shortcuts preserve literal fenced code", async ({ page }) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("```\ndef:\n```");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("End");
  await editor.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Term to define", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("def:");
  await expect(editor).not.toContainText("studyspace:");
});
test("definition boxes appear in the dictionary and dictionary edits update the original box", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("def:");
  await editor.press("Enter");
  await page
    .getByRole("textbox", { name: "Term to define", exact: true })
    .fill("distributed version control");
  await page
    .getByRole("textbox", { name: "Term to define", exact: true })
    .press("Enter");
  await page
    .getByRole("textbox", { name: "Definition", exact: true })
    .fill("Keep a local copy of repository history.");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  const noteUrl = page.url();
  await page.goto("/demo/dictionary");
  await page
    .getByRole("textbox", { name: "Search dictionary" })
    .fill("distributed version control");
  const entry = page.locator(".dictionary-document>section").filter({
    has: page.getByRole("heading", {
      name: "distributed version control",
      exact: true,
    }),
  });
  await expect(entry).toHaveCount(1);
  await entry.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Definition", exact: true })
    .fill("Every contributor has repository history.");
  await page
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.goto(noteUrl);
  await expect(
    page.getByRole("textbox", { name: "Definition", exact: true }),
  ).toHaveValue("Every contributor has repository history.");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await page.keyboard.type("Distributed   version control works.");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(page.locator(".cm-concept")).toHaveAttribute(
    "title",
    "Every contributor has repository history.",
  );
});
test("topic wheel starts a persistent path and excludes the topic from later spins", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await expect(page.locator(".save-state")).toContainText("Saved on this device");
  await page.goto("/demo/learning");
  await expect(
    page.getByRole("status").filter({ hasText: "320 in your catalog" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Computer science");
  await page.getByRole("button", { name: "Spin & start learning" }).click();
  await expect(
    page.getByRole("button", { name: "Mark path as learned" }),
  ).toBeVisible();
  const title = await page.locator(".learning-path-heading h2").innerText();
  await page.getByRole("button", { name: "Topic wheel", exact: true }).click();
  await page.getByLabel("Find a topic").fill(title);
  await expect(
    page.getByRole("button", { name: "Spin & start learning" }),
  ).toBeDisabled();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: /In progress/ }).click();
  await expect(page.locator(".learning-path-heading h2")).toHaveText(title);
});
test("a learned skill keeps nested files and can be found and reviewed in the vault", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await expect(page.locator(".save-state")).toContainText("Saved on this device");
  await page.goto("/demo/learning");
  await page
    .getByText("Add your own topic or explore Wikipedia", { exact: true })
    .click();
  await page.getByLabel("Topic title", { exact: true }).fill("GitHub commands");
  await page.getByRole("button", { name: "Start this learning path" }).click();
  await page.getByLabel("New concept").fill("Resolve a merge conflict");
  await page.getByRole("button", { name: "Add concept", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Resolve a merge conflict", exact: true })
    .check();
  const files = page.getByRole("navigation", { name: "Learning path files" });
  await files.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Git examples");
  await page
    .getByRole("button", { name: "Create folder", exact: true })
    .click();
  await files.getByRole("button", { name: "New file", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Useful commands");
  await page.getByRole("button", { name: "Create note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Markdown editor", exact: true })
    .fill("git status shows changed files");
  await page
    .getByRole("button", { name: "Mark path as learned", exact: true })
    .click();
  await page.getByRole("button", { name: /Learned Vault/ }).click();
  await page.getByLabel("Search learned skills").fill("GitHub commands");
  await expect(
    page.getByRole("heading", { name: "GitHub commands", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: /Learned Vault/ }).click();
  await page.getByLabel("Search learned skills").fill("GitHub commands");
  await page.getByRole("button", { name: "Revisit path", exact: true }).click();
  await files
    .getByRole("button", { name: "Useful commands", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Markdown editor", exact: true }),
  ).toContainText("git status shows changed files");
  await page.getByRole("button", { name: "Review again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark path as learned" }),
  ).toBeVisible();
});
test("def and uses shortcuts create editable blocks, phrase definitions highlight, and learned definitions enter the vault", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("def:");
  await editor.press("Enter");
  const term = page.getByRole("textbox", {
    name: "Term to define",
    exact: true,
  });
  await expect(term).toBeFocused();
  await term.fill("version control");
  await term.press("Enter");
  const definition = page.getByRole("textbox", {
    name: "Definition",
    exact: true,
  });
  await expect(definition).toBeFocused();
  await definition.fill("Track changes to files over time.");
  await definition.press("End");
  await page.keyboard.type(" Keep a history.", { delay: 70 });
  await expect(definition).toBeFocused();
  await page.getByRole("checkbox", { name: "Mark concept as learned" }).check();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await page.keyboard.type("Version control is useful.");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(
    page.locator(".cm-concept").filter({ hasText: "Version control" }),
  ).toHaveAttribute("title", /Track changes to files/);
  await editor.press("Control+End");
  await editor.press("Enter");
  await page.keyboard.type("uses:");
  await editor.press("Enter");
  const uses = page.getByRole("textbox", { name: "Use cases", exact: true });
  await expect(uses).toBeFocused();
  await uses.fill("Compare revisions and recover earlier work.");
  const module = page.getByRole("region", { name: "uses module" });
  await module.getByRole("button", { name: "Collapse module" }).click();
  await module.getByRole("button", { name: "Expand module" }).click();
  await expect(uses).toHaveValue("Compare revisions and recover earlier work.");
  await expect(page.locator(".save-state")).toContainText("Saved on this device");
  await page.goto("/demo/learning");
  await page.getByRole("button", { name: /Learned Vault/ }).click();
  await expect(
    page.getByRole("heading", { name: "version control", exact: true }),
  ).toBeVisible();
});
