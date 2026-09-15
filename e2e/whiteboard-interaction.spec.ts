import { test, expect } from "@playwright/test";

test("whiteboard text fits content and empty padding remains drawable", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await expect(
    page.getByRole("button", { name: "Learning", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteboard", exact: true })
    .click();
  const board = page.getByRole("region", { name: "Whiteboard", exact: true });
  const surface = board.getByRole("group", {
    name: "Whiteboard drawing surface",
    exact: true,
  });
  await board.getByRole("button", { name: "Text", exact: true }).click();
  await surface.click({ position: { x: 170, y: 90 } });
  const input = board.getByRole("textbox", { name: "Whiteboard text box" });
  await input.fill("Hi");
  const short = (await input.boundingBox())!;
  await input.fill("A longer thought worth remembering");
  expect((await input.boundingBox())!.width).toBeGreaterThan(short.width * 3);
  await input.fill("Hi");
  expect(
    Math.abs((await input.boundingBox())!.width - short.width),
  ).toBeLessThan(2);
  // A deliberately resized box still only captures clicks close to its text.
  const corner = board.getByRole("button", { name: "Resize text box" });
  await corner.focus();
  for (let i = 0; i < 15; i++) await corner.press("Shift+ArrowRight");
  for (let i = 0; i < 8; i++) await corner.press("Shift+ArrowDown");
  const enlarged = (await input.boundingBox())!;
  await board.getByRole("button", { name: "Done", exact: true }).click();
  await board.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.move(enlarged.x + 12, enlarged.y + 12);
  await page.mouse.down();
  await page.mouse.move(enlarged.x + 30, enlarged.y + 18, { steps: 4 });
  await page.mouse.up();
  await expect(input).toHaveCount(0);
  await expect(board.locator("g[data-stroke-id]")).toHaveCount(2);
  await board.locator("[data-stroke-id] text").click();
  await expect(input).toHaveValue("Hi");
  await page.screenshot({ path: "test-results/whiteboard-fitted-text.png" });
});

test("expanded whiteboard stays on screen and wheel zoom preserves the pointer position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Whiteboard", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enlarge whiteboard", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const surface = dialog.getByRole("group", {
    name: "Whiteboard drawing surface",
    exact: true,
  });
  const checkFit = async () => {
    const d = await dialog.evaluate((el) => ({
      height: el.clientHeight,
      scroll: el.scrollHeight,
      top: el.getBoundingClientRect().top,
      bottom: el.getBoundingClientRect().bottom,
    }));
    expect(d.scroll).toBeLessThanOrEqual(d.height + 1);
    expect(d.top).toBeGreaterThanOrEqual(0);
    expect(d.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect((await surface.boundingBox())!.height).toBeGreaterThan(60);
  };
  await checkFit();
  const rect = (await surface.boundingBox())!;
  const view = () =>
    surface.getAttribute("viewBox").then((v) => v!.split(" ").map(Number));
  const before = await view();
  await page.mouse.move(rect.x + rect.width / 3, rect.y + rect.height / 3);
  await page.mouse.wheel(0, -250);
  await expect.poll(async () => (await view())[2]).toBeLessThan(before[2]);
  const after = await view();
  expect(
    Math.abs(before[0] + before[2] / 3 - after[0] - after[2] / 3),
  ).toBeLessThan(2);
  expect(
    Math.abs(before[1] + before[3] / 3 - after[1] - after[3] / 3),
  ).toBeLessThan(2);
  await page.mouse.wheel(0, 250);
  await expect.poll(async () => (await view())[2]).toBeGreaterThan(after[2]);
  await dialog.getByRole("button", { name: "Text", exact: true }).click();
  const position = (await surface.boundingBox())!;
  await surface.click({ position: { x: 180, y: 95 } });
  const input = dialog.getByRole("textbox", { name: "Whiteboard text box" });
  await expect(input).toBeFocused();
  const placed = (await input.boundingBox())!;
  expect(Math.abs(placed.x + placed.width / 2 - position.x - 180)).toBeLessThan(
    2,
  );
  expect(Math.abs(placed.y + placed.height / 2 - position.y - 95)).toBeLessThan(
    2,
  );
  await input.fill("A centered thought");
  await checkFit();
  await page.screenshot({ path: "test-results/whiteboard-expanded.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkFit();
  await page.screenshot({
    path: "test-results/whiteboard-expanded-mobile.png",
  });
});
