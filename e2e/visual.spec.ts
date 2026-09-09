import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
test("inspects desktop themes, tablet layout, subject/dictionary dialogs, and journals", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/demo?sample=1");
  await expect(page.locator(".cm-content")).toBeVisible();
  const checks = [];
  for (const theme of ["Light", "Dark", "Paper"]) {
    await page
      .getByRole("button", { name: "Settings", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: theme, exact: true }).click();
    await page
      .getByRole("button", { name: "Collections", exact: true })
      .click();
    await page.getByRole("button", { name: "Reading", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    checks.push({
      theme,
      violations: audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
    });
    await page.screenshot({
      path: "docs/screenshots/desktop-" + theme.toLowerCase() + ".png",
    });
    await writeFile(
      "docs/evidence/visual-qa.json",
      JSON.stringify(checks, null, 2),
    );
  }
  await page
    .getByRole("button", { name: "Add definition", exact: true })
    .click();
  await page.screenshot({ path: "docs/screenshots/dictionary-dialog.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Create collection or subject" })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Algebra · 線形代数");
  await page.screenshot({ path: "docs/screenshots/new-subject.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Journal", exact: true })
    .first()
    .click();
  await page.screenshot({ path: "docs/screenshots/journal.png" });
  await page
    .getByRole("button", { name: "Dream journal", exact: true })
    .click();
  await page.screenshot({ path: "docs/screenshots/dream-journal.png" });
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  for (const width of [1920, 1024, 768]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 800) {
      await page
        .getByRole("button", { name: "Close inspector", exact: true })
        .last()
        .click();
      if (
        await page
          .getByRole("button", { name: "Close explorer", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Close explorer", exact: true })
          .last()
          .click();
    }
    await page.screenshot({
      path: "docs/screenshots/workspace-" + width + ".png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(checks.flatMap((c) => c.violations)).toEqual([]);
  await writeFile(
    "docs/evidence/visual-qa.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        viewports: [1280, 1920, 1024, 768],
        method:
          "Real Chromium screenshots and axe WCAG A/AA including 2.2 tags. No physical screen-reader/IME inspection.",
      },
      null,
      2,
    ),
  );
});
