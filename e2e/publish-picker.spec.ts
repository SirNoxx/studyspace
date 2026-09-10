import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sampleWorkspace } from "../src/lib/demo";
import { createContainer, createNote } from "../src/lib/domain";

test("publish picker preserves nesting and reviews the selected file or folder", async ({
  page,
}) => {
  test.setTimeout(90000);
  const w = sampleWorkspace();
  const coding = w.containers.find((c) => c.title === "Coding")!;
  const folder = createContainer(w, {
    title: "Research",
    kind: "folder",
    parentId: coding.id,
  });
  const nested = createContainer(w, {
    title: "Experiments",
    kind: "folder",
    parentId: folder.id,
  });
  createNote(w, folder.id, { title: "Research overview" });
  createNote(w, nested.id, {
    title: "Trial results",
    body: "Measurements from our experiment.",
  });
  const hidden = createContainer(w, {
    title: "Archived experiments",
    kind: "folder",
    parentId: folder.id,
  });
  hidden.archived = true;
  createNote(w, hidden.id, { title: "Hidden results" });
  await page.goto("/auth");
  await page.evaluate(async (workspace) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("studyspace-device-v1", 1);
      request.onupgradeneeded = () => {
        for (const name of ["workspaces", "drafts", "assets", "navigation"])
          request.result.createObjectStore(name);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("workspaces", "readwrite");
        tx.objectStore("workspaces").put(workspace, "demo");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, w);
  await page.goto("/demo/discover");
  await page
    .getByRole("button", { name: "Publish your work", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Review selection" }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Expand Research", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Expand Experiments", exact: true })
    .click();
  const file = dialog.getByRole("button", {
    name: "Select file Trial results",
    exact: true,
  });
  await expect(file).toBeVisible();
  await expect(dialog.getByText("Hidden results", { exact: true })).toHaveCount(
    0,
  );
  const folderX = (await dialog
    .getByRole("button", { name: "Select folder Research", exact: true })
    .boundingBox())!.x;
  expect((await file.boundingBox())!.x).toBeGreaterThan(folderX + 30);
  await file.click();
  await expect(dialog.locator(".publish-picker-selection")).toContainText(
    "Coding / Research / Experiments / Trial results",
  );
  await expect(dialog.locator(".publish-picker-selection")).toContainText(
    "1 file selected",
  );
  await page.screenshot({ path: "docs/screenshots/publish-picker-tree.png" });
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Review selection" }).click();
  await expect(dialog.locator(".publish-selection input")).toHaveCount(1);
  await expect(
    dialog.getByLabel("Public title", { exact: true }),
  ).toHaveAttribute("placeholder", "Trial results");
  await dialog
    .getByRole("button", { name: "Review privacy & preview" })
    .click();
  await expect(dialog.locator(".publication-reader-preview h2")).toHaveText(
    "Trial results",
  );
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish your work", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Search collections, folders, and files")
    .fill("Trial results");
  await expect(
    dialog.getByRole("button", { name: "Select file Trial results" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Select collection Coding" }),
  ).toBeVisible();
  await dialog
    .getByLabel("Search collections, folders, and files")
    .fill("nothing-matches");
  await expect(
    dialog.getByText("No matching collections, folders, or files."),
  ).toBeVisible();
  await dialog.getByLabel("Search collections, folders, and files").fill("");
  await dialog
    .getByRole("button", { name: "Select folder Research", exact: true })
    .click();
  await expect(dialog.locator(".publish-picker-selection")).toContainText(
    "2 files selected",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Review selection" }).click();
  await expect(dialog.locator(".publish-selection input")).toHaveCount(2);
  await expect(dialog.locator(".publish-selection input:checked")).toHaveCount(
    2,
  );
});

