import { test, expect } from "@playwright/test";
test("planner has a navigable week and persistent checklist sections with two creation buttons", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Planner", exact: true }).click();
  const week = page.getByRole("region", { name: "Week calendar", exact: true });
  await expect(week).toBeVisible();
  await expect(week.locator(".planner-week-day")).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Open calendar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Overdue tasks" }),
  ).toBeVisible();
  const completed = page.locator(".planner-completed");
  await expect(completed).not.toHaveAttribute("open", "");
  const start = await week
    .locator(".planner-week-day")
    .first()
    .getAttribute("aria-label");
  await week.getByRole("button", { name: "Next week", exact: true }).click();
  expect(
    await week.locator(".planner-week-day").first().getAttribute("aria-label"),
  ).not.toBe(start);
  await week.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task title", { exact: true }).fill("Learn npm");
  await dialog.getByRole("button", { name: "Save task", exact: true }).click();
  const todo = page.getByRole("region", { name: "To do tasks" });
  await expect(
    todo.getByRole("button", { name: "Learn npm", exact: true }),
  ).toBeVisible();
  await expect(week).toContainText("Learn npm");
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await dialog
    .getByLabel("Task title", { exact: true })
    .fill("Catch up reading");
  await dialog.getByLabel("Due date", { exact: true }).fill("2000-01-01");
  await dialog.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Overdue tasks" }),
  ).toContainText("Catch up reading");
  await todo
    .getByRole("checkbox", { name: "Complete Learn npm", exact: true })
    .click();
  await expect(
    todo.getByRole("button", { name: "Learn npm", exact: true }),
  ).toHaveCount(0);
  await expect(completed).not.toHaveAttribute("open", "");
  await completed.locator("summary").click();
  await expect(completed).toContainText("Learn npm");
  await completed
    .getByRole("checkbox", { name: "Complete Learn npm", exact: true })
    .click();
  await expect(todo).toContainText("Learn npm");
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Overdue tasks" }),
  ).toContainText("Catch up reading");
  const heading=page.locator('.planner-page > .social-heading');
  const headingRect=await heading.boundingBox(),buttonRect=await heading.getByRole('button',{name:'New task',exact:true}).boundingBox();
  expect(buttonRect!.x+buttonRect!.width).toBeGreaterThan(headingRect!.x+headingRect!.width-2);
  const weekScroll=page.locator('.planner-week-scroll');
  expect(await weekScroll.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({
    path: "test-results/planner-week-checklist.png",
    fullPage: true,
  });
});
