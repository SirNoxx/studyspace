import { test, expect } from "@playwright/test";
test("journal entries stay in the journal with ordinal dates and reusable templates", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Journal", exact: true })
    .click();
  await page.getByLabel("Journal date", { exact: true }).fill("2026-09-09");
  await expect(
    page.getByRole("heading", { name: "September 9th, 2026", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open this day’s entry", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo\/journal$/);
  const section = page.getByRole("region", { name: "Journal entry editor" });
  await expect(section).toBeVisible();
  const title = page.getByLabel("Journal entry title", { exact: true });
  await expect(title).toHaveValue("September 9th, 2026");
  await title.press("Enter");
  const editor = section.getByRole("textbox", { name: "Markdown editor" });
  await expect(editor).toBeFocused();
  await editor.fill("My private entry");
  await section
    .getByRole("button", { name: "My templates", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Evening reflection");
  await page
    .getByLabel("Template content", { exact: true })
    .fill("## Gratitude\n\n## Tomorrow");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Replaced text stays in version history",
  );
  await page
    .getByRole("button", { name: "Append to entry", exact: true })
    .click();
  await expect(editor).toContainText("My private entry");
  await expect(editor).toContainText("Gratitude");
  await page
    .getByLabel("Journal template", { exact: true })
    .selectOption({ label: "Evening reflection" });
  await section
    .getByRole("button", { name: "Use for new entries", exact: true })
    .click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByLabel("Journal date", { exact: true }).fill("2026-09-09");
  await page
    .getByRole("button", { name: "Open this day’s entry", exact: true })
    .click();
  await expect(editor).toContainText("My private entry");
  await page
    .getByLabel("Journal template", { exact: true })
    .selectOption({ label: "Evening reflection" });
  await section
    .getByRole("button", { name: "Apply template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Replace entry", exact: true })
    .click();
  await expect(editor).not.toContainText("My private entry");
  await section
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("My private entry");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/journal-inline-editor.png",
    fullPage: true,
  });
  await page.getByLabel("Journal date", { exact: true }).fill("2026-09-10");
  await page
    .getByRole("button", { name: "Open this day’s entry", exact: true })
    .click();
  await expect(title).toHaveValue("September 10th, 2026");
  await expect(editor).toContainText("Tomorrow");
});
test("public template browser handles outages and imports explicit public content", async ({
  page,
}) => {
  await page.goto("/demo/journal");
  await page
    .getByRole("button", { name: "Open this day’s entry", exact: true })
    .click();
  await page.route("**/api/journal-templates?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture: public service unavailable" }),
    }),
  );
  await page
    .getByRole("button", { name: "Public templates", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "public service unavailable",
  );
  await page.unroute("**/api/journal-templates?*");
  await page.route("**/api/journal-templates?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        templates: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            title: "Public reflection fixture",
            body: "## A reusable public prompt",
            kind: "journal",
            author: "Fixture author",
          },
        ],
        hasMore: false,
      }),
    }),
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Fixture author");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("dialog").last()).toContainText(
    "A reusable public prompt",
  );
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Use template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Append to entry", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Markdown editor" }),
  ).toContainText("A reusable public prompt");
  await page.getByRole("button", { name: "My templates", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Public reflection fixture",
  );
  await expect(
    page.getByRole("button", { name: "Publish publicly", exact: true }),
  ).toBeDisabled();
});
