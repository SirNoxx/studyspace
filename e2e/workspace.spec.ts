import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("capture, autosave, collection focus, dictionary, review, and publication", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/demo");
  await expect(page.getByText("Make room for your ideas.")).toBeVisible();
  await page
    .getByRole("button", { name: "Explore an editable sample collection" })
    .click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Tool calling",
  );
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await expect(
    page.locator(".markdown h2").filter({ hasText: "Beyond generating text" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/desktop-paper.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create collection or subject" })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Test College");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page.getByTitle("Focus Test College", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "All Collections", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTitle("Focus Game Development", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "All Collections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quick note", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Quick note title" })
    .fill("Test capture");
  await page
    .getByRole("textbox", { name: "Quick note body" })
    .fill("## A saved thought\n\nTool calling stays connected to evidence.");
  await page.getByRole("button", { name: "Save & open" }).click();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Test capture",
  );
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue(
    "Test capture",
  );
  await page
    .getByRole("button", { name: "Add definition", exact: true })
    .click();
  await page.getByLabel("Word or phrase").fill("Test concept");
  await page
    .getByLabel("Definition", { exact: true })
    .fill("A durable personal definition.");
  await page.getByRole("button", { name: "Save definition" }).click();
  await page
    .getByRole("button", { name: /Test concept/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Need to review", exact: true })
    .click();
  await page.getByRole("button", { name: "Add to review" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.getByRole("button", { name: /Good/ }).click();
  await expect(
    page.getByRole("button", { name: "Undo last grade" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/review-paper.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByLabel("Allow independent study copies").check();
  await page.getByRole("button", { name: "Review privacy & preview" }).click();
  await expect(page.getByText(/Frontmatter, hidden comments/)).toBeVisible();
  await page.getByRole("button", { name: "Save local publication" }).click();
  await page.getByRole("button", { name: "Open reader", exact: true }).click();
  await expect(page.getByText(/LOCAL DEMO · Version/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(errors).toEqual([]);
});
test("mobile navigation, dialog keyboard escape, and base accessibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  // Close contextual sheets to expose the mobile writing surface.
  if (
    await page
      .getByRole("button", { name: "Close inspector", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Close inspector", exact: true })
      .last()
      .click();
  if (await page.getByRole("button", { name: "Collapse explorer" }).count())
    await page.getByRole("button", { name: "Collapse explorer" }).click();
  await expect(
    page.getByRole("button", { name: "Start writing" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start writing" }).click();
  await page.getByRole("textbox", { name: "Note title" }).fill("Mobile note");
  await page
    .getByRole("button", { name: "Quick note", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      description: v.description,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
