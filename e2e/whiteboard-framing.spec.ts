import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("portrait framing persists, preserves strokes, fits expanded screens and exports 1080×1920", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  const editor = page.getByRole("textbox", {
    name: "Markdown editor",
    exact: true,
  });
  await editor.fill(
    "```whiteboard studyspace:framing\n" +
      JSON.stringify({
        version: 1,
        background: "dots",
        strokes: [
          {
            id: "original",
            tool: "pen",
            color: "#123456",
            width: 4,
            points: [
              [400, 300],
              [600, 400],
            ],
          },
        ],
      }) +
      "\n```",
  );
  const surface = page.getByRole("group", {
    name: "Whiteboard drawing surface",
    exact: true,
  });
  await expect(surface).toBeVisible();
  const portrait = async () => {
    await expect
      .poll(async () => {
        const box = (await surface.boundingBox())!;
        return Math.abs(box.width / box.height - 9 / 16);
      })
      .toBeLessThan(0.003);
    await expect(surface.locator('[data-stroke-id="original"]')).toHaveCount(1);
    const bounds = (await surface.boundingBox())!;
    expect(bounds.height).toBeGreaterThan(60);
    expect(bounds.height).toBeLessThan(page.viewportSize()!.height);
  };
  await page
    .getByRole("button", { name: "Whiteboard options", exact: true })
    .click();
  await page
    .getByRole("menuitem", {
      name: "Switch to mobile portrait (9:16)",
      exact: true,
    })
    .click();
  await portrait();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG", exact: true }).click();
  const png = await readFile((await (await download).path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920]);
  await page
    .getByRole("button", { name: "Enlarge whiteboard", exact: true })
    .click();
  await portrait();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(surface.locator("[data-stroke-id]")).toHaveCount(2);
  const viewBox = await surface.getAttribute("viewBox");
  await page.mouse.wheel(0, -150);
  await expect(surface).not.toHaveAttribute("viewBox", viewBox!);
  await portrait();
  await page.getByRole("button", { name: "Whiteboard view settings" }).click();
  await page
    .getByRole("menuitem", { name: "Switch to desktop view", exact: true })
    .click();
  await expect
    .poll(async () => {
      const box = (await surface.boundingBox())!;
      return box.width / box.height;
    })
    .toBeGreaterThan(1);
  await expect(surface.locator("[data-stroke-id]")).toHaveCount(2);
  await page.getByRole("button", { name: "Whiteboard view settings" }).click();
  await page
    .getByRole("menuitem", {
      name: "Switch to mobile portrait (9:16)",
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 900, height: 700 });
  await portrait();
  await page.screenshot({ path: "test-results/whiteboard-mobile.png" });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Saved on this device/ }),
  ).toBeVisible();
  await page.reload();
  await portrait();
  await expect(surface.locator("[data-stroke-id]")).toHaveCount(2);
});
