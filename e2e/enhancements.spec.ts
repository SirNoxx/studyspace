import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile, readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("studyspace-device-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const w = await new Promise<any>((resolve, reject) => {
      const r = db
        .transaction("workspaces")
        .objectStore("workspaces")
        .get("demo");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return w;
  });
}
test("labeled navigation, scoped inline folder creation, and preference persistence preserve the original backup", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await expect(
    page.getByRole("button", { name: "Collapse navigation labels" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse navigation labels" })
    .click();
  await expect(
    page.getByRole("button", { name: "Expand navigation labels" }),
  ).toBeVisible();
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await expect(page.getByRole("tree", { name: "Coding files" })).toBeVisible();
  await page
    .getByRole("button", { name: "New folder in Coding", exact: true })
    .click();
  const input = page.getByRole("textbox", { name: "Folder name", exact: true });
  await expect(input).toHaveValue("Untitled");
  await input.fill("TEST inline folder");
  await input.press("Enter");
  await expect(
    page.getByTitle("Focus TEST inline folder", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New folder in Coding", exact: true })
    .click();
  await input.fill("CANCELLED NAME");
  await input.press("Escape");
  await expect(
    page.getByTitle("Focus Untitled", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const w = await state(page);
      return w.containers.some((c: any) => c.title === "TEST inline folder");
    })
    .toBe(true);
  const w = await state(page),
    root = w.containers.find((c: any) => c.title === "Coding");
  expect(
    w.containers.find((c: any) => c.title === "TEST inline folder").parentId,
  ).toBe(root.id);
  expect(w.notes.some((n: any) => n.title === "Tool calling")).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand navigation labels" }),
  ).toBeVisible();
  const backup = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("studyspace-device-v1", 1);
      q.onsuccess = () => r(q.result);
    });
    return new Promise<any>((r) => {
      const q = db
        .transaction("workspaces")
        .objectStore("workspaces")
        .get("before-enhancements:demo");
      q.onsuccess = () => r(q.result);
    });
  });
  expect(backup.notes.some((n: any) => n.title === "Tool calling")).toBe(true);
  expect(
    backup.containers.some((c: any) => c.title === "TEST inline folder"),
  ).toBe(false);
});
test("selection creates a grouped card and a stable link without losing Markdown or undo", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note title" })
    .fill("TEST linked writing");
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  await editor.fill(
    "# TEST heading\n\n**Retained emphasis**\n\nOriginal selected passage",
  );
  await editor.press("Control+End");
  await expect(editor).not.toContainText("# TEST heading");
  await editor.press("Control+Home");
  await expect(editor).toContainText("# TEST heading");
  await editor.press("Control+End");
  await editor.press("Control+Shift+Home");
  await page
    .getByRole("button", { name: "Create study card", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Question", exact: true })
    .fill("TEST recall question");
  await expect(
    page.getByRole("textbox", { name: "Answer", exact: true }),
  ).toHaveValue(/Original selected passage/);
  await page
    .getByRole("button", { name: "Add to review", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await page
    .getByText("Manage study-card collections", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "New study-card collection name" })
    .fill("TEST AI cards");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page.getByLabel("Review study-card collection").selectOption("all");
  await page.getByRole("button", { name: /Manage all .* cards/ }).click();
  await page
    .getByLabel("Collection for TEST recall question")
    .selectOption({ label: "TEST AI cards" });
  await page
    .getByLabel("Review study-card collection")
    .selectOption({ label: "TEST AI cards · 1" });
  await expect(page.locator(".review-question")).toContainText(
    "TEST recall question",
  );
  await page
    .getByRole("button", { name: "Remove grouping; keep cards" })
    .click();
  await expect(page.locator(".review-manage")).toContainText(
    "TEST recall question",
  );
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Home");
  await editor.press("Shift+End");
  await page.getByRole("button", { name: "Insert / edit link" }).click();
  await page.getByLabel("Destination type").selectOption("internal");
  await page
    .getByRole("textbox", { name: "Find a note", exact: true })
    .fill("Tool calling");
  await page
    .locator(".link-picker")
    .getByRole("button", { name: /Tool calling/ })
    .click();
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("#note:");
  await editor.click();
  await editor.press("Control+z");
  await expect(editor).not.toContainText("#note:");
  await expect(editor).toContainText("**Retained emphasis**");
});
test("study method previews, calendar periods, and attachment browsing stay within their scopes", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Create collection or subject", exact: true })
    .click();
  await page.locator(".method-choice").click();
  await page
    .getByRole("button", { name: /Worked examples.*Follow a problem/ })
    .click();
  await expect(page.locator(".method-choice")).toContainText("Worked examples");
  await page.getByLabel("Name", { exact: true }).fill("TEST methods");
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Journal", exact: true })
    .click();
  await expect(page.getByLabel("Calendar view")).toHaveValue("week");
  await page.getByLabel("Journal date").fill("2024-02-29");
  await page.getByLabel("Calendar view").selectOption("year");
  await expect(page.locator(".calendar-year button")).toHaveCount(366);
  await page
    .getByRole("button", { name: "2024-02-29 · no entries", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open this day’s entry", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Journal", exact: true })
    .click();
  await page.getByLabel("Journal date").fill("2024-02-29");
  await expect(page.locator(".calendar-grid .has-entries")).toHaveCount(1);
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await page
    .getByRole("button", { name: "Actions for Coding", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "View attachments", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Folder attachments" }),
  ).toBeVisible();
  await expect(
    page.getByText(/No referenced attachments in this folder yet/),
  ).toBeVisible();
});
test("all eight themes remain readable and the walkthrough and chat preferences are reversible", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Hide AI Chat launcher" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const results: any[] = [];
  for (const theme of [
    "Winter",
    "Spring",
    "Summer",
    "Fall",
    "Tropical",
    "Underwater",
    "Space",
    "Forest",
  ]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      theme.toLowerCase(),
    );
    const check = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    results.push({
      theme,
      violations: check.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    });
    await page.screenshot({
      path: `docs/screenshots/theme-${theme.toLowerCase()}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await writeFile(
    "docs/evidence/enhancement-themes.json",
    JSON.stringify(results, null, 2),
  );
  expect(results.flatMap((r) => r.violations)).toEqual([]);
  await page.getByLabel("Show AI Chat launcher").check();
  await page
    .getByRole("button", { name: "Revisit welcome walkthrough" })
    .click();
  await expect(
    page.getByRole("region", { name: "Studyspace walkthrough" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.locator(".tool-description")).toContainText(
    "Sources connects",
  );
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Collections", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open AI Chat" }),
  ).toBeVisible();
});
test("Discover publication requires metadata and scope preview while leaving originals private", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish a collection or folder" })
    .click();
  await page
    .locator(".link-picker")
    .getByRole("button", { name: /Artificial intelligence/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: /^Research category/ })
    .selectOption("Artificial intelligence");
  await page.getByLabel("Tags · comma separated").fill("agents, study");
  await page.getByRole("button", { name: "Review privacy & preview" }).click();
  await expect(page.locator(".publication-reader-preview")).toContainText(
    "Artificial intelligence",
  );
  await expect(page.locator(".publication-reader-preview")).toContainText(
    "identifiable sources",
  );
  await page.getByRole("button", { name: "Save local publication" }).click();
  await expect
    .poll(async () => (await state(page)).publications.length)
    .toBe(1);
  const saved = await state(page);
  expect(saved.publications[0].current.category).toBe(
    "Artificial intelligence",
  );
  expect(saved.publications[0].current.topics).toEqual(["agents", "study"]);
  expect(saved.notes.length).toBeGreaterThan(
    saved.publications[0].current.notes.length,
  );
  expect(
    saved.publications[0].current.notes.every(
      (n: any) => !saved.notes.find((p: any) => p.id === n.id)?.journalDate,
    ),
  ).toBe(true);
});
test("folder attachment previews expose real bytes and ZIP export reports archive readiness", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Add attachment", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "TEST-preview.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByRole("button", { name: /^TEST-preview\.png 0 KB$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByTitle("Focus Coding", { exact: true }).click();
  await page
    .getByRole("button", { name: "Actions for Coding", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "View attachments", exact: true })
    .click();
  await expect(page.locator(".attachment-manager article")).toHaveCount(1);
  const image = page.getByRole("img", { name: "TEST-preview.png" });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((n: HTMLImageElement) => n.naturalWidth))
    .toBe(1);
  await expect(page.locator(".attachment-origin")).toContainText(
    "Tool calling",
  );
  await expect(page.locator(".attachment-origin small")).toContainText(
    "Coding / Artificial intelligence",
  );
  await page.screenshot({
    path: "docs/screenshots/folder-attachments.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Data", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export all Markdown notes as ZIP" })
    .click();
  const file = await download;
  await expect(
    page.getByRole("progressbar", { name: "Export preparation" }),
  ).toBeVisible();
  await expect(page.locator(".export-progress")).toContainText(
    "Archive ready. Download handed to your browser.",
  );
  const zip = unzipSync(new Uint8Array(await readFile((await file.path())!)));
  expect(Object.keys(zip).some((p) => p.endsWith("TEST-preview.png"))).toBe(
    true,
  );
  expect(
    strFromU8(zip["Coding/Artificial intelligence/Tool calling.md"]),
  ).toContain("TEST-preview.png");
});

test("application dictionary shortcut preserves editor content and nested Escape closes only the method picker", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor" });
  const before = await editor.innerText();
  await editor.click();
  await editor.press("Control+Shift+d");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(editor).toHaveText(before, { useInnerText: true });
  await page
    .getByRole("button", { name: "Create collection or subject", exact: true })
    .click();
  await page.locator(".method-choice").click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.locator(".method-choice")).toBeVisible();
});

test("onboarding keeps the invited tools reachable on narrow and short screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Revisit welcome walkthrough" })
    .click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expect(page.locator(".tool-description")).toContainText(
      "Sources connects",
    );
    const box = await page.locator(".onboarding-card").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.screenshot({
      path: `docs/screenshots/onboarding-${viewport.width}.png`,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Studyspace walkthrough" }),
  ).toHaveCount(0);
});
