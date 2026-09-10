import { test, expect, type Page } from "@playwright/test";

test("password reveal and public signup name", async ({ page }) => {
  await page.goto("/auth");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("Synthetic-test-password");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByLabel("Username", { exact: true }).fill("  Study Friend  ");
  await page
    .getByLabel("Email", { exact: true })
    .fill("studyspace-test@example.invalid");
  await password.fill("Synthetic-test-password");
  let metadata: unknown;
  await page.route("**/auth/v1/signup**", async (route) => {
    metadata = route.request().postDataJSON().data;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        identities: [],
        email: "studyspace-test@example.invalid",
      }),
    });
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  expect(metadata).toEqual({
    username: "Study Friend",
    display_name: "Study Friend",
  });
  await page.screenshot({ path: "docs/screenshots/signup-public-name.png" });
});

test("walkthrough follows targets without covering them", async ({ page }) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Revisit welcome walkthrough" })
    .click();
  const card = page.getByRole("region", { name: "Studyspace walkthrough" });
  const positions: number[] = [];
  for (let step = 0; step < 5; step++) {
    await expect(card).toContainText(`${step + 1} / 5`);
    await expect(page.locator(".onboarding-focus")).toBeVisible();
    await expect
      .poll(async () => {
        const c = (await card.boundingBox())!,
          f = (await page.locator(".onboarding-focus").boundingBox())!;
        return (
          c.x >= f.x + f.width ||
          c.x + c.width <= f.x ||
          c.y >= f.y + f.height ||
          c.y + c.height <= f.y
        );
      })
      .toBe(true);
    positions.push((await card.boundingBox())!.x);
    if (step === 2) await expect(card).toContainText("All Collections");
    if (step === 3) {
      await expect(card).toContainText("Markdown (.md)");
      await expect(card).toContainText("Bold");
      await page.screenshot({
        path: "docs/screenshots/onboarding-writing.png",
      });
    }
    if (step < 4)
      await card.getByRole("button", { name: "Next", exact: true }).click();
  }
  expect(new Set(positions).size).toBeGreaterThan(1);
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.locator(".tool-description")).toContainText(
    "Sources connects",
  );
  await card.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.locator(".onboarding-layer")).toHaveCount(0);
});

async function drag(
  page: Page,
  source: string,
  target: string,
  fraction: number,
) {
  const from = page
    .locator(".tree-row")
    .filter({ has: page.getByRole("button", { name: source, exact: true }) })
    .first();
  const to = page
    .locator(".tree-row")
    .filter({ has: page.getByRole("button", { name: target, exact: true }) })
    .first();
  const a = (await from.boundingBox())!,
    b = (await to.boundingBox())!;
  await page.mouse.move(a.x + 50, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 70, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * fraction, {
    steps: 10,
  });
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height * fraction);
  await expect(to).toHaveAttribute(
    "data-drop-position",
    fraction < 0.25 ? "before" : fraction > 0.75 ? "after" : "inside",
  );
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("tree shows insertion markers, reorders, nests, and keeps the result after reload", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await drag(page, "Expand College contents", "Collapse Coding contents", 0.1);
  const roots = page.locator(
    ".file-tree > .tree-branch > .root-row .tree-title",
  );
  await expect(roots).toHaveText([
    "General",
    "College",
    "Coding",
    "Content Creation",
    "Game Development",
  ]);
  await drag(page, "Expand College contents", "Collapse Coding contents", 0.5);
  await expect(
    page.locator(".file-tree > .tree-branch > .root-row .tree-title"),
  ).toHaveText(["General", "Coding", "Content Creation", "Game Development"]);
  await expect(
    page.getByRole("button", { name: "Expand College contents", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    page.locator(".file-tree > .tree-branch > .root-row .tree-title"),
  ).toHaveText(["General", "Coding", "Content Creation", "Game Development"]);
});
