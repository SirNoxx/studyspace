import { test, expect } from "@playwright/test";
import type { Workspace } from "../src/lib/model";

test("definition collections scroll with the wheel without moving the dialog", async ({ page }) => {
  await page.goto("/demo?sample=1");
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  // Seed only this test's isolated browser storage with a long collection list.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("studyspace-device-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("workspaces", "readwrite");
      const store = tx.objectStore("workspaces");
      const request = store.get("demo");
      request.onsuccess = () => {
        const workspace = request.result as Workspace;
        const base = workspace.containers.find(c => c.kind === "collection")!;
        for (let i = 0; i < 24; i++) workspace.containers.push({
          ...base, id: crypto.randomUUID(), parentId: null, system: undefined,
          title: `Wheel collection ${String(i).padStart(2, "0")}`, order: 100 + i,
        });
        store.put(workspace, "demo");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Actions for Coding", exact: true }).click();
  await page.getByRole("menuitem", { name: "Add dictionary entry", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const list = dialog.getByRole("region", { name: "Available collections" });
  await list.hover();
  const outerTop = await dialog.evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => dialog.evaluate(el => el.scrollTop)).toBe(outerTop);
  await page.mouse.wheel(0, -10000);
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(0);
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => list.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBe(0);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => dialog.evaluate(el => el.scrollTop)).toBe(outerTop);
  await list.getByRole("checkbox", { name: "Wheel collection 23", exact: true }).check();
  await dialog.getByLabel("Word or phrase", { exact: true }).fill("Wheel selection");
  await dialog.getByLabel("Definition", { exact: true }).fill("Selected after scrolling.");
  await dialog.getByRole("button", { name: "Save definition", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("definitions belong to selected collections, never ordinary folders", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", {
      name: "Actions for Artificial intelligence",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Folder name", exact: true });
  await name.fill("Folder without dictionary");
  await name.press("Enter");
  await page
    .getByRole("button", {
      name: "Actions for Folder without dictionary",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Add dictionary entry", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const choices = dialog.getByRole("group", {
    name: "Collections",
    exact: true,
  });
  await expect(
    choices.getByRole("checkbox", { name: /Folder without dictionary/ }),
  ).toHaveCount(0);
  const home = choices.getByRole("checkbox", {
    name: "Coding / Artificial intelligence",
    exact: true,
  });
  await expect(home).toBeChecked();
  await dialog
    .getByLabel("Word or phrase", { exact: true })
    .fill("Shared concept");
  await dialog
    .getByLabel("Definition", { exact: true })
    .fill("One meaning, multiple collections.");
  await home.uncheck();
  await dialog
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Choose at least one");
  await home.check();
  await choices.getByRole("checkbox", { name: "General", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Save definition", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("Shared concept");
  await editor.locator(".cm-concept").click();
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(choices.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await expect(home).toBeChecked();
  await expect(
    choices.getByRole("checkbox", { name: "General", exact: true }),
  ).toBeChecked();
});
