const { _electron: electron, expect } = require("@playwright/test");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
const fs = require("node:fs/promises"),
  path = require("node:path");
const root = path.resolve(__dirname, "../..");
(async () => {
  const profile = path.join(root, "desktop/.smoke", "pdf-" + Date.now());
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(
    path.join(profile, "desktop-settings.json"),
    JSON.stringify({ lastWorkspace: "local", automaticUpdates: false }),
  );
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
    page.drawText("Original styled page " + (i + 1), {
      x: 35,
      y: 720,
      size: 28,
      font,
      color: rgb(1, 1, 1),
    });
    if (i === 2) page.setRotation(degrees(90));
  }
  const buffer = Buffer.from(await pdf.save());
  const env = { ...process.env, STUDYSPACE_SMOKE_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: path.join(
      root,
      "desktop/release/win-unpacked/Studyspace.exe",
    ),
    args: ["--smoke-test"],
    env,
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(30000);
    await page.waitForURL("http://127.0.0.1:47832/**", { timeout: 60000 });
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.showInactive();
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    await page.goto("http://127.0.0.1:47832/demo?sample=1");
    await page
      .getByRole("button", { name: "Modules", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Add PDFs", exact: true }).click();
    await page
      .getByLabel("Import PDF into module")
      .setInputFiles({
        name: "Desktop PDF.pdf",
        mimeType: "application/pdf",
        buffer,
      });
    await expect(
      page.getByRole("dialog", {
        name: "How would you like to import this PDF?",
        exact: true,
      }),
    ).toHaveCount(0);
    const module = page.locator(".pdf-module-editor");
    await expect(
      module.getByLabel("Total PDF pages", { exact: true }),
    ).toHaveText("3", { timeout: 60000 });
    await expect
      .poll(() =>
        module
          .locator(".pdf-page-canvas")
          .first()
          .evaluate((c) => {
            if (!c.width) return false;
            const p = c.getContext("2d").getImageData(10, 10, 1, 1).data;
            return p[2] > p[0] * 2;
          }),
      )
      .toBe(true);
    await module.getByRole("button", { name: "Add text", exact: true }).click();
    await module
      .locator('[data-pdf-page="1"]')
      .click({ position: { x: 80, y: 250 } });
    await module
      .getByLabel("PDF annotation text", { exact: true })
      .fill("Saved desktop annotation");
    await module
      .getByRole("button", { name: "Apply text", exact: true })
      .click();
    await expect(page.locator(".save-state")).toContainText(
      "Saved on this device",
    );
    await page.reload();
    await expect(
      module.getByRole("button", {
        name: "Edit annotation: Saved desktop annotation",
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    await module.getByLabel("PDF page number").fill("3");
    await module.getByRole("button", { name: "Add text", exact: true }).click();
    await module
      .locator('[data-pdf-page="3"]')
      .click({ position: { x: 80, y: 180 } });
    await module
      .getByLabel("PDF annotation text", { exact: true })
      .fill("Rotated page annotation");
    await module
      .getByRole("button", { name: "Apply text", exact: true })
      .click();
    const exportPath = path.join(profile, "exported.pdf");
    await app.evaluate(({ session }, savePath) => {
      global.pdfDownloadState = "waiting";
      session.defaultSession.once("will-download", (_event, item) => {
        item.setSavePath(savePath);
        global.pdfDownloadState = "started";
        item.once("done", (_event, state) => {
          global.pdfDownloadState = state;
        });
      });
    }, exportPath);
    await module
      .getByRole("button", { name: "Save PDF copy", exact: true })
      .click();
    await expect
      .poll(
        async () => ({
          state: await app.evaluate(() => global.pdfDownloadState),
          errors: await module.locator('[role="alert"]').allTextContents(),
        }),
        { timeout: 60000 },
      )
      .toEqual({ state: "completed", errors: [] });
    const exportedBytes = await fs.readFile(exportPath);
    const exported = await PDFDocument.load(exportedBytes);
    expect(exported.getPageCount()).toBe(3);
    expect(exported.getPage(2).getRotation().angle).toBe(90);
    // Reimport the exported PDF to prove overlays are actually present in PDF bytes.
    await page
      .getByRole("button", { name: "Modules", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Add PDFs", exact: true }).click();
    await page
      .getByLabel("Import PDF into module")
      .setInputFiles({
        name: "Export verification.pdf",
        mimeType: "application/pdf",
        buffer: exportedBytes,
      });
    await expect(
      page.getByRole("dialog", {
        name: "How would you like to import this PDF?",
        exact: true,
      }),
    ).toHaveCount(0);
    const verification = page
      .locator(".note-module-pdf")
      .filter({ has: page.locator('input[value="Export verification.pdf"]') })
      .locator(".pdf-module-editor");
    await expect(
      verification.getByLabel("Total PDF pages", { exact: true }),
    ).toHaveText("3", { timeout: 60000 });
    await verification.getByLabel("PDF page number").fill("3");
    await expect(verification.getByLabel("PDF page number")).toHaveValue("3");
    await verification.screenshot({
      path: path.join(root, "docs/screenshots/pdf-module-desktop.png"),
    });
    await expect
      .poll(() =>
        verification
          .locator('[data-pdf-page="3"] .pdf-page-canvas')
          .evaluate((c) => {
            if (!c.width) return 0;
            const ctx = c.getContext("2d"),
              w = Math.floor(c.width * 0.7),
              h = Math.floor(c.height * 0.8),
              p = ctx.getImageData(0, 0, w, h).data;
            let blue = 0;
            for (let i = 0; i < p.length; i += 4)
              if (p[i + 2] > p[i] * 1.5 && p[i + 2] > 80 && p[i] < 200) blue++;
            return blue;
          }),
      )
      .toBeGreaterThan(20);
    await verification.screenshot({
      path: path.join(root, "docs/screenshots/pdf-module-desktop.png"),
    });
    await expect(verification.getByLabel("PDF page number")).toHaveValue("3");
    expect(errors).toEqual([]);
    console.log(
      "PASS: packaged PDF module with external network blocked; original styled pages, local font/worker resources, durable annotations, rotated-page export and rendered reimport.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
