import { test, expect } from "@playwright/test";
test("two local sessions keep both conflicting edits and resume saving", async ({
  page,
  context,
}) => {
  await page.goto("/demo?sample=1");
  await expect(page.locator(".save-state")).toContainText("Saved");
  const other = await context.newPage();
  await other.goto("/demo");
  await expect(other.locator(".cm-content")).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n\nTEST OWNER A SAVED");
  await expect(page.locator(".save-state")).toContainText("Saved");
  await other.locator(".cm-content").click();
  await other.keyboard.press("Control+End");
  await other.keyboard.insertText("\n\nTEST SESSION B DRAFT");
  await expect(other.locator(".save-state")).toContainText("Conflict");
  await other
    .getByRole("button", { name: "Review draft", exact: true })
    .click();
  await other
    .getByRole("button", {
      name: "Keep both versions & resume saving",
      exact: true,
    })
    .click();
  await expect(other.locator(".save-state")).toContainText("Saved");
  await other.reload();
  const result = await other.evaluate(async () => {
    const r = indexedDB.open("studyspace-device-v1");
    return new Promise<any>((resolve) => {
      r.onsuccess = () => {
        const q = r.result
          .transaction("workspaces")
          .objectStore("workspaces")
          .get("demo");
        q.onsuccess = () =>
          resolve(
            q.result.notes.map((n: any) => ({ title: n.title, body: n.body })),
          );
      };
    });
  });
  expect(result.some((n: any) => n.body.includes("TEST OWNER A SAVED"))).toBe(
    true,
  );
  expect(
    result.some(
      (n: any) =>
        n.title.includes("recovered draft") &&
        n.body.includes("TEST SESSION B DRAFT"),
    ),
  ).toBe(true);
});
