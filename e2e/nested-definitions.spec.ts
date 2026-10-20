import { test, expect } from "@playwright/test";

test("full definition draft outlines known words and preserves its text while nesting", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Add definition", exact: true })
    .click();
  const parent = page.locator(".dialog:not(.quick-definition)");
  await parent
    .getByLabel("Word or phrase", { exact: true })
    .fill("Outer concept");
  const body = parent.getByRole("textbox", { name: "Definition", exact: true });
  await body.fill("Grounding connects Quasar");
  await body.press("End");
  await expect(body.locator(".definition-term")).toHaveText("Grounding");
  await body.press("Control+Shift+ArrowLeft");
  await parent.getByRole("button", { name: "Define", exact: true }).click();
  const child = page.locator(".quick-definition");
  await expect(
    child.getByRole("heading", { name: "Define", exact: true }),
  ).toBeVisible();
  const childBody = child.getByRole("textbox", {
    name: "Definition",
    exact: true,
  });
  await expect(childBody).toBeFocused();
  await expect(child.getByLabel("Word or phrase", { exact: true })).toHaveCount(
    0,
  );
  await childBody.fill("A bright galactic nucleus.");
  await page.screenshot({ path: "test-results/nested-definition.png", animations: "disabled" });
  await childBody.press("Enter");
  await expect(child).toHaveCount(0);
  await expect(body).toHaveText("Grounding connects Quasar");
  await expect(body.locator(".definition-term")).toHaveCount(2);
  await body
    .locator(".definition-term")
    .filter({ hasText: "Grounding" })
    .click();
  await expect(childBody).toContainText("Connecting an explanation");
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(body).toHaveText("Grounding connects Quasar");
  await parent
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await expect(parent).toHaveCount(0);
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page
    .getByRole("textbox", { name: "Find a definition" })
    .fill("Outer concept");
  await page
    .locator(".definition-preview")
    .filter({ hasText: "Outer concept" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Quasar", exact: true })
    .click();
  await expect(
    page
      .locator(".quick-definition")
      .getByRole("textbox", { name: "Definition" }),
  ).toContainText("A bright galactic nucleus.");
});

test("selected note text opens a minimal focused popup and right-click nests a smaller one", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("Orbit");
  await editor.press("Control+Home");
  await editor.press("Control+Shift+End");
  await page
    .getByRole("toolbar", { name: "Selected text actions" })
    .getByRole("button", { name: "Create definition", exact: true })
    .click();
  const parent = page.locator(".quick-definition").first();
  const body = parent.getByRole("textbox", { name: "Definition", exact: true });
  await expect(body).toBeFocused();
  await expect(parent.getByRole("heading")).toHaveText("Define");
  await body.fill("A path around Stellar");
  await body.press("End");
  await body.press("Control+Shift+ArrowLeft");
  await body.dispatchEvent("contextmenu");
  const child = page.locator(".quick-definition").last();
  await expect(page.locator(".quick-definition")).toHaveCount(2);
  expect((await child.boundingBox())!.width).toBeLessThan(
    (await parent.boundingBox())!.width,
  );
  const childBody = child.getByRole("textbox", {
    name: "Definition",
    exact: true,
  });
  await expect(childBody).toBeFocused();
  await childBody.fill("Related to stars.");
  await childBody.press("Shift+Enter");
  await childBody.pressSequentially("A stellar object.");
  await childBody.press("Enter");
  await expect(page.locator(".quick-definition")).toHaveCount(1);
  await expect(body).toHaveText("A path around Stellar");
  await expect(body.locator(".definition-term")).toHaveText("Stellar");
  await body.press("End");
  await body.press("Enter");
  await expect(parent).toHaveCount(0);
  await expect(editor.locator(".cm-concept")).toHaveText("Orbit");
});

test("View in notes opens and selects the exact chosen occurrence, including after reading mode", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  const source =
    "First Grounding mention.\n\n" +
    Array(60).fill("A separate line of notes.").join("\n\n") +
    "\n\nLast Grounding mention.";
  await editor.fill(source);
  await editor.press("End");
  await page
    .getByRole("treeitem", {
      name: "Retrieval augmented generation",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Find a definition" })
    .fill("Grounding");
  await page
    .locator(".definition-preview")
    .filter({ hasText: "Grounding" })
    .click();
  const usages = page.getByRole("region", {
    name: "View in notes",
    exact: true,
  });
  const choices = usages
    .getByRole("button")
    .filter({ hasText: "Tool calling" });
  await expect(choices).toHaveCount(2);
  await page.screenshot({ path: "test-results/definition-note-locations.png", animations: "disabled" });
  await choices.last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Note title", exact: true }),
  ).toHaveValue("Tool calling");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Grounding");
  await expect(
    editor.locator(".cm-line").filter({ hasText: "Last Grounding mention." }),
  ).toBeInViewport();
  // Typing replaces only the second occurrence: proves source offsets, not first-match search.
  await page.keyboard.type("Verified");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("Last Verified mention.");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page
    .locator(".definition-preview")
    .filter({ hasText: "Grounding" })
    .click();
  await usages.getByRole("button").filter({ hasText: "Tool calling" }).click();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Grounding");
  await expect(
    editor.locator(".cm-line").filter({ hasText: "First Grounding mention." }),
  ).toBeInViewport();
});
