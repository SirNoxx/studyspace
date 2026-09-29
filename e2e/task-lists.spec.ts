import { test, expect } from "@playwright/test";

test("all Space shortcuts create circular task controls", async ({ page }) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  for (const prefix of ["[]", "[ ]", "- []", "- [ ]", "-[]"]) {
    await editor.fill("");
    await editor.pressSequentially(prefix);
    await editor.press("Space");
    await editor.pressSequentially("Get groceries");
    const task = editor.getByRole("checkbox", { name: "Get groceries", exact: true });
    await expect(task).toBeVisible();
    await expect(task).toHaveCSS("border-radius", "50%");
    await task.check();
    await expect(task).toBeChecked();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await expect(editor).toHaveText("- [x] Get groceries", { useInnerText: true });
    await page.getByRole("button", { name: "Live preview", exact: true }).click();
  }
});

const launchList = `## 11. Distribution and launch operations

- [ ] Align versions: frontend currently declares 0.0.0, desktop 0.1.8, and server 1.0.0.
- [ ] Produce reproducible installers for the supported platform matrix.
- [ ] Verify actual signing and notarization; the release workflow currently permits unsigned builds.
- [ ] Verify updater keys, signed artifacts, manifests, endpoints, and failure recovery.
- [ ] Test upgrades from existing installations without data loss.
- [ ] Package inference assets and required license notices.
- [ ] Gate public releases on successful checks and release-candidate acceptance.
- [ ] Finish installation requirements, offline setup, limitations, privacy, troubleshooting, release notes, and support
  documentation.`;

test("pasted launch tasks are clickable, saved, undoable and retain Markdown", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("");
  await editor.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, launchList);
  const checkboxes = editor.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(8);
  await expect(editor).toContainText("documentation.");
  await checkboxes.nth(1).check();
  await expect(checkboxes.nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toHaveText(
    launchList.replace("- [ ] Produce", "- [x] Produce"),
    { useInnerText: true },
  );
  await editor.press("Control+z");
  await expect(editor).toHaveText(launchList, { useInnerText: true });
  await editor.press("Control+y");
  await page.getByRole("button", { name: "Live preview", exact: true }).click();
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(checkboxes).toHaveCount(8);
  await expect(checkboxes.nth(1)).toBeChecked();
  await checkboxes.nth(1).focus();
  await page.keyboard.press("Space");
  await expect(checkboxes.nth(1)).not.toBeChecked();
  await expect(checkboxes.nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checkboxes.nth(1)).toBeChecked();
});

test("typed compact tasks and nested tasks work without changing code examples", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill("");
  await editor.pressSequentially("- [] Learn tasks");
  await expect(
    editor.getByRole("checkbox", { name: "Learn tasks", exact: true }),
  ).toBeVisible();
  await editor.getByRole("checkbox").check();
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.pressSequentially("Next task");
  await expect(
    editor.getByRole("checkbox", { name: "Next task", exact: true }),
  ).not.toBeChecked();
  await editor.fill(
    "- [ ] Parent\n  - [] Child\n\n```text\n- [ ] Literal code\n```\n\n- [X] Finished",
  );
  await expect(editor.getByRole("checkbox")).toHaveCount(3);
  await editor.getByRole("checkbox", { name: "Child", exact: true }).check();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(editor).toContainText("  - [x] Child");
  await expect(editor).toContainText("```text\n- [ ] Literal code\n```", {
    useInnerText: true,
  });
  await editor.fill(
    "- [] Compact task\n- [x] Completed task\n- \\[\\] Literal brackets",
  );
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  const readingTasks = page.locator(".writing-area").getByRole("checkbox");
  await expect(readingTasks).toHaveCount(2);
  await expect(readingTasks.first()).not.toBeChecked();
  await expect(readingTasks.last()).toBeChecked();
  await expect(readingTasks.first()).toBeDisabled();
});
