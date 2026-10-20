import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function segment(page: Page, title: string) {
  const picker = page.getByRole("combobox", { name: "Go to segment" });
  const options = await picker.locator("option").allTextContents();
  await picker.selectOption({
    label: options.find((text) => text.endsWith(title))!,
  });
}

test("a draft can choose a different template before beginning again", async ({
  page,
}) => {
  await page.goto("/demo/weekly-checkups?sample=1");
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New task", exact: true })
    .fill("Keep this task");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page
    .getByRole("button", { name: "Change template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "The 10-minute check-in", exact: false })
    .click();
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await expect(page.locator(".meeting-topbar")).toContainText(
    "The 10-minute check-in",
  );
  await expect(
    page.getByRole("checkbox", { name: "Keep this task", exact: true }),
  ).toBeVisible();
  await segment(page, "Look back, look ahead");
  await expect(page.getByLabel("This week's intention")).toBeVisible();
});

test("a focused journey plans tasks, meals, finances and goals, then compares saved weeks", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Weekly checkups", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Long-term goals", exact: true })
    .click();
  await page.getByRole("button", { name: "New goal", exact: true }).click();
  await page.getByLabel("Goal name", { exact: true }).fill("Emergency fund");
  await page.getByLabel("Life area").selectOption("Finances");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page.getByRole("button", { name: "My week", exact: true }).click();
  await page.getByLabel("Week containing").fill("2026-10-12");
  await page
    .getByRole("button", { name: "Whole-life reset", exact: false })
    .click();
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Upcoming tasks", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Checkup sections" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Weekly consistency" }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "New task", exact: true })
    .fill("Finish course chapter");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Finish course chapter", exact: true })
    .check();
  await page
    .getByLabel("Planning notes", { exact: false })
    .fill("Leave Friday evening free");
  await page
    .getByRole("button", { name: "Friday, 2026-10-16", exact: true })
    .click();
  await page.getByLabel("Friday Events & time").fill("Concert at 7pm");
  await page.screenshot({
    animations: "disabled",
    timeout: 30000,
    path: "test-results/weekly-meeting-tasks.png",
  });
  expect(
    (await new AxeBuilder({ page }).include(".checkup-session").analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meal plan", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Monday breakfast", { exact: true }).fill("Oatmeal");
  await page
    .getByLabel("Monday dinner", { exact: true })
    .fill("Pasta with family");
  await page.getByLabel("Groceries & prep notes").fill("Tomatoes and pasta");
  await page.screenshot({
    animations: "disabled",
    timeout: 30000,
    path: "test-results/weekly-meeting-meals.png",
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Savings balance", { exact: true }).fill("100");
  await page.getByLabel("Savings goal", { exact: true }).fill("1000");
  await expect(
    page.getByText("10% of your savings goal", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    animations: "disabled",
    timeout: 30000,
    path: "test-results/weekly-meeting-finances-dark.png",
  });
  expect(
    (await new AxeBuilder({ page }).include(".checkup-session").analyze())
      .violations,
  ).toEqual([]);
  await page.evaluate(() => (document.documentElement.dataset.theme = "paper"));
  await segment(page, "Choose your direction");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.locator(".checkup-session").getByRole("alert"),
  ).toContainText("This week's intention");
  await page.getByLabel("This week's intention").fill("Make steady progress");
  await segment(page, "Commit to the week");
  await page.getByLabel("One concrete action").fill("Transfer 50 to savings");
  await page
    .getByLabel("Connect to a long-term goal")
    .selectOption({ label: "Emergency fund" });
  await page
    .getByRole("button", { name: "Add commitment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish checkup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your week has a direction." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to my week", exact: true })
    .click();
  await page.getByLabel("Next week", { exact: true }).click();
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await segment(page, "A moment for your money");
  await page.getByLabel("Savings balance", { exact: true }).fill("150");
  await segment(page, "Choose your direction");
  await page.getByLabel("This week's intention").fill("Keep it going");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("group", { name: "Outcome for Transfer 50 to savings" })
    .getByRole("button", { name: "Accomplished", exact: true })
    .click();
  await page
    .getByLabel("Reflection on Transfer 50 to savings")
    .fill("Automated it on Friday");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish checkup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to my week", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Compare weeks", exact: true })
    .click();
  await expect(page.getByText("+50 change", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pasta with family", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Finish course chapter", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.locator(".checkup-history-item")).toHaveCount(2);
  await page.getByLabel("Search checkup history").fill("Automated");
  await expect(page.locator(".checkup-history-item")).toHaveCount(1);
});

test("save and exit resumes the segment and preserves meals when navigating back", async ({
  page,
}) => {
  await page.goto("/demo/weekly-checkups?sample=1");
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New task", exact: true })
    .fill("Book dentist");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Tuesday dinner", { exact: true }).fill("Dinner out");
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Resume checkup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Meal plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tuesday dinner", { exact: true })).toHaveValue(
    "Dinner out",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Book dentist" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Tuesday dinner", { exact: true })).toHaveValue(
    "Dinner out",
  );
});

test("custom segments, required prompts, template snapshots and mobile session layout", async ({
  page,
}) => {
  await page.goto("/demo/weekly-checkups?sample=1");
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: "New template", exact: true }).click();
  const builder = page.getByRole("dialog", {
    name: "Form builder",
    exact: true,
  });
  await builder
    .getByLabel("Template name", { exact: true })
    .fill("Sunday reset");
  await builder
    .getByLabel("Prompt label", { exact: true })
    .fill("What matters this week?");
  await builder
    .getByRole("combobox", { name: "Segment experience", exact: true })
    .selectOption("tasks");
  await builder
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "My week", exact: true }).click();
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Weekly planning calendar", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.locator(".checkup-session").getByRole("alert"),
  ).toContainText("What matters this week?");
  await page.getByLabel("What matters this week?").fill("Leave room for rest");
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .locator(".checkup-card")
    .filter({ hasText: "Sunday reset" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await builder
    .getByLabel("Prompt label", { exact: true })
    .first()
    .fill("A different question");
  await builder
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.getByRole("button", { name: "My week", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume checkup", exact: true })
    .click();
  await expect(page.getByLabel("What matters this week?")).toHaveValue(
    "Leave room for rest",
  );
  await page
    .getByRole("button", { name: "Collapse explorer", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: "disabled",
    timeout: 30000,
    path: "test-results/weekly-meeting-mobile.png",
  });
  expect(
    await page
      .locator(".checkup-session")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish checkup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your week has a direction." }),
  ).toBeVisible();
});
