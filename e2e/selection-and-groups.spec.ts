import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("selection actions follow the highlighted passage and linked study groups include its card", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.keyboard.type("TEST group origin");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill(
    "Context paragraph\n\nSelected phrase for studying\n\n" +
      Array(30).fill("Extra context to allow scrolling.").join("\n\n"),
  );
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("ArrowDown");
  await editor.press("Home");
  await editor.press("Shift+End");
  const actions = page.getByRole("toolbar", { name: "Selected text actions" });
  await expect(actions).toBeVisible();
  const above = async () => {
    const box = (await actions.boundingBox())!;
    const rect = await page.evaluate(() => {
      const r = window.getSelection()!.getRangeAt(0).getClientRects()[0];
      return { top: r.top, left: r.left };
    });
    expect(box.y + box.height).toBeLessThanOrEqual(rect.top - 6);
    expect(rect.top - (box.y + box.height)).toBeLessThanOrEqual(12);
    return box;
  };
  const initial = await above();
  await page.locator(".document-scroll").evaluate((el) => {
    el.scrollTop += 30;
  });
  await expect
    .poll(async () => (await actions.boundingBox())!.y)
    .toBeLessThan(initial.y);
  await above();
  await page.screenshot({
    path: "docs/screenshots/selection-actions.png",
    animations: "disabled",
  });
  await actions
    .getByRole("button", { name: "Create study card", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Answer", exact: true }),
  ).toHaveValue("Selected phrase for studying");
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("TEST linked recall");
  await page
    .getByRole("button", { name: "Add to review", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New study group", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("TEST General study");
  const locations = page.getByLabel("Link to a collection or folder");
  await locations.click();
  await expect(
    page.getByRole("option", { name: "General", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/styled-dropdown.png",
    animations: "disabled",
  });
  await page.getByRole("option", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page.locator(".review-question")).toContainText(
    "TEST linked recall",
  );
  await expect(page.locator(".group-linked-location")).toContainText("General");
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/review-groups.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Edit group", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("TEST renamed group");
  await locations.selectOption({ label: "Coding" });
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  await expect(page.locator(".review-view")).not.toContainText(
    "TEST linked recall",
  );
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  const groupPicker = page.getByRole("combobox", {
    name: "Study group",
    exact: true,
  });
  await groupPicker.selectOption(
    (await groupPicker
      .locator("option")
      .filter({ hasText: "TEST renamed group" })
      .getAttribute("value"))!,
  );
  await page.getByRole("button", { name: "Edit group", exact: true }).click();
  await expect(locations.locator("option:checked")).toHaveText("Coding");
  await page
    .getByRole("button", { name: "Delete group · keep cards", exact: true })
    .click();
  await page.getByRole("button", { name: /Manage.*cards/ }).click();
  await expect(page.locator(".review-manage")).toContainText(
    "TEST linked recall",
  );
});

test("reading selections have nearby actions within a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page
    .locator(".writing-area .markdown p")
    .first()
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  const actions = page.getByRole("toolbar", { name: "Selected text actions" });
  await expect(actions).toBeVisible();
  const box = (await actions.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(382);
  const top = await page.evaluate(
    () => window.getSelection()!.getRangeAt(0).getClientRects()[0].top,
  );
  expect(box.y + box.height).toBeLessThanOrEqual(top - 6);
  await actions.getByRole("button", { name: "Add to dictionary" }).click();
  await expect(page.getByLabel("Word or phrase")).not.toHaveValue("");
});
