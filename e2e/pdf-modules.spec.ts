import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { readFile } from "node:fs/promises";
async function fixture() {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < 3; i++) {
    const page = pdf.addPage([600, 800]);
    page.drawRectangle({
      x: 0,
      y: 660,
      width: 600,
      height: 140,
      color: rgb(0.08, 0.28, 0.5),
    });
    page.drawText(`Original styled page ${i + 1}`, {
      x: 35,
      y: 720,
      size: 28,
      font,
      color: rgb(1, 1, 1),
    });
    page.drawText("Editable study material", {
      x: 40,
      y: 580,
      size: 18,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
    if (i === 2) page.setRotation(degrees(90));
  }
  return Buffer.from(await pdf.save());
}
test("PDF module preserves pages, saves annotations, exports and prints", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Modules", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Add PDFs", exact: true }).click();
  await page.getByLabel("Import PDF into module").setInputFiles({
    name: "Styled lecture.pdf",
    mimeType: "application/pdf",
    buffer: await fixture(),
  });
  await expect(
    page.getByRole("dialog", {
      name: "How would you like to import this PDF?",
      exact: true,
    }),
  ).toHaveCount(0);
  const module = page.locator(".pdf-module-editor");
  await expect(module).toHaveCount(1);
  await expect(
    module.getByLabel("Total PDF pages", { exact: true }),
  ).toBeVisible({
    timeout: 45000,
  });
  const canvas = module.locator(".pdf-page-canvas").first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        if (!c.width) return false;
        const p = c.getContext("2d")!.getImageData(10, 10, 1, 1).data;
        return p[2] > p[0] * 2;
      }),
    )
    .toBe(true);
  await module.getByRole("button", { name: "Add text", exact: true }).click();
  await module
    .locator('[data-pdf-page="1"]')
    .click({ position: { x: 90, y: 320 } });
  await module
    .getByLabel("PDF annotation text", { exact: true })
    .fill("My study annotation");
  await module.getByRole("button", { name: "Apply text", exact: true }).click();
  await expect(
    module.getByRole("button", {
      name: "Edit annotation: My study annotation",
      exact: true,
    }),
  ).toBeVisible();
  await module.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    module.getByRole("button", {
      name: "Edit annotation: My study annotation",
      exact: true,
    }),
  ).toHaveCount(0);
  await module.getByRole("button", { name: "Redo", exact: true }).click();
  await module.getByRole("button", { name: "Pen", exact: true }).click();
  await module.getByLabel("PDF annotation size").fill("3");
  const bounds = (await module.locator('[data-pdf-page="1"]').boundingBox())!;
  await page.mouse.move(bounds.x + 80, bounds.y + 380);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 220, bounds.y + 390, { steps: 12 });
  await page.mouse.up();
  await module.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.mouse.move(bounds.x + 80, bounds.y + 420);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 220, bounds.y + 444, { steps: 6 });
  await page.mouse.up();
  await expect(module.locator(".pdf-annotation-list summary")).toHaveText(
    "Annotations (3)",
  );
  await module
    .getByRole("button", { name: "Correct text", exact: true })
    .click();
  await module
    .getByRole("button", {
      name: "Correct text: Editable study material",
      exact: true,
    })
    .first()
    .click();
  await module
    .getByLabel("PDF annotation text", { exact: true })
    .fill("Corrected study material");
  await module.getByRole("button", { name: "Apply text", exact: true }).click();
  await expect(module.locator(".pdf-annotation-list summary")).toHaveText(
    "Annotations (4)",
  );
  await expect(page.locator(".save-state")).toContainText(
    "Saved on this device",
  );
  await page.reload();
  await expect(
    module.getByRole("button", {
      name: "Edit annotation: My study annotation",
      exact: true,
    }),
  ).toBeVisible({ timeout: 45000 });
  await module
    .getByRole("button", { name: "Next PDF page", exact: true })
    .click();
  await expect(module.getByLabel("PDF page number")).toHaveValue("2");
  await module.getByLabel("PDF page number").fill("3");
  await expect(module.getByLabel("PDF page number")).toHaveValue("3");
  await expect(
    module.locator('[data-pdf-page="3"] canvas.pdf-page-canvas'),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await module
    .getByRole("button", { name: "Save PDF copy", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Styled lecture-annotated.pdf");
  const saved = await PDFDocument.load(
    await readFile((await download.path())!),
  );
  expect(saved.getPageCount()).toBe(3);
  expect(saved.getPage(2).getRotation().angle).toBe(90);
  await page.evaluate(() => {
    const append = document.body.append.bind(document.body);
    document.body.append = (...nodes) => {
      append(...nodes);
      for (const n of nodes)
        if (n instanceof HTMLIFrameElement)
          n.contentWindow!.print = () => {
            (window as any).__pdfPrinted =
              n.contentDocument!.querySelectorAll("img").length;
          };
    };
  });
  await module.getByRole("button", { name: "Print", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__pdfPrinted))
    .toBe(3);
  await module.getByLabel("PDF page number").fill("1");
  await module.screenshot({ path: "test-results/pdf-module.png" });
  await module.getByLabel("PDF zoom").selectOption("1.5");
  await expect
    .poll(() =>
      module
        .locator(".pdf-pages")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    )
    .toBe(true);
  await module.getByLabel("PDF zoom").selectOption("1");
});

test("PDF module reports unreadable files and retains the original attachment", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page
    .getByRole("button", { name: "Modules", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Add PDFs", exact: true }).click();
  await page.getByLabel("Import PDF into module").setInputFiles({
    name: "Damaged.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\ntruncated"),
  });
  await expect(
    page.getByRole("dialog", {
      name: "How would you like to import this PDF?",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.locator(".pdf-module-editor").getByRole("alert"),
  ).toContainText(/PDF/i);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Markdown editor", exact: true }),
  ).toContainText('"source":"attachment:');
});

test("PDF file imports explicitly offer original pages or Markdown conversion", async ({
  page,
}) => {
  await page.goto("/demo?sample=1");
  await page.getByRole("button", { name: "Import notes", exact: true }).click();
  await page.locator("input[type=file][accept]").setInputFiles({
    name: "Reading.pdf",
    mimeType: "application/pdf",
    buffer: await fixture(),
  });
  await expect(
    page.getByRole("dialog", {
      name: "How would you like to import this PDF?",
      exact: true,
    }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", {
    name: "How would you like to import this PDF?",
    exact: true,
  });
  await expect
    .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth))
    .toBe(true);
  await expect
    .poll(() => dialog.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(700);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth))
    .toBe(true);
  await dialog.screenshot({ path: "test-results/pdf-import-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.screenshot({ path: "test-results/pdf-import-desktop.png" });
  await page.getByRole("button", { name: /Convert to Markdown text/ }).click();
  await expect(page.getByText("Reading.pdf.md", { exact: true })).toBeVisible({
    timeout: 45000,
  });
  await page
    .getByRole("button", { name: "Import notes", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "1 notes imported", exact: true }),
  ).toBeVisible();
});
