const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { chromium, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { serve } = require("./serve.cjs");

(async () => {
  const { server, url, output } = await serve();
  let browser;
  const results = [];
  const record = async (name, run) => {
    try {
      const detail = await run();
      results.push({ name, status: "pass", detail });
    } catch (error) {
      results.push({ name, status: "fail", detail: error.message });
    }
    console.log(`${results.at(-1).status}: ${name}`);
  };
  try {
    browser = await chromium.launch({ channel: "msedge" });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const started = performance.now();
    await page.goto(url);
    await page.waitForFunction(() => window.spreadsheetSpike);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.spreadsheetSpike.current.workbook
            .getActiveSheet()
            .getRange("B4")
            .getValue(),
        ),
      )
      .toBe(5);
    const initialReadyMs = performance.now() - started;

    await record("Formula recalculation", async () => {
      await page.evaluate(() =>
        window.spreadsheetSpike.current.workbook
          .getActiveSheet()
          .getRange("B2")
          .setValue(7),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.spreadsheetSpike.current.workbook
              .getActiveSheet()
              .getRange("B4")
              .getValue(),
          ),
        )
        .toBe(10);
      return "SUM recalculates from 5 to 10 after editing B2.";
    });
    await record("Formatting and local XLSX fixture round trip", async () => {
      await page.evaluate(() =>
        window.spreadsheetSpike.current.workbook
          .getActiveSheet()
          .getRange("A1")
          .setFontWeight("bold")
          .setFontStyle("italic")
          .setFontSize(18)
          .setBackground("#123456"),
      );
      const result = await page.evaluate(() =>
        window.spreadsheetSpike.xlsxRoundTrip(),
      );
      assert.equal(result.title, "Topic");
      assert.equal(result.formula.formula, "SUM(B2:B3)");
      assert.equal(result.formula.result, 10);
      assert.equal(result.font.bold, true);
      assert.equal(result.font.italic, true);
      assert.equal(result.font.size, 18);
      assert.equal(result.fill.fgColor.argb, "FF123456");
      assert.equal(result.richText.richText[0].font.bold, true);
      assert.equal(result.outlineLevel, 1);
      return result;
    });
    await record("Hide/show primitive preserves values", async () => {
      const result = await page.evaluate(() => {
        const { workbook } = window.spreadsheetSpike.current;
        const sheet = workbook.getActiveSheet();
        sheet.hideRows(1, 2);
        const hidden = workbook.save().sheets.main.rowData;
        sheet.showRows(1, 2);
        return {
          hidden,
          values: sheet.getRange("B2:B3").getValues(),
          visible: workbook.save().sheets.main.rowData,
        };
      });
      assert.equal(result.hidden[1].hd, 1);
      assert.equal(result.hidden[2].hd, 1);
      assert.deepEqual(result.values, [[7], [3]]);
      assert.notEqual(result.visible[1]?.hd, 1);
      return "Primitive works; named nested groups and structural maintenance are not supplied by this test.";
    });
    await record("Structural formula references and undo", async () => {
      await page.evaluate(() =>
        window.spreadsheetSpike.current.workbook
          .getActiveSheet()
          .insertRows(1, 1),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.spreadsheetSpike.current.workbook
              .getActiveSheet()
              .getRange("B5")
              .getValue(),
          ),
        )
        .toBe(10);
      const formula = await page.evaluate(
        () =>
          window.spreadsheetSpike.current.workbook.save().sheets.main
            .cellData[4][1].f,
      );
      assert.equal(formula, "=SUM(B3:B4)");
      await page.evaluate(() =>
        window.spreadsheetSpike.current.workbook.undo(),
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.spreadsheetSpike.current.workbook
              .getActiveSheet()
              .getRange("B4")
              .getValue(),
          ),
        )
        .toBe(10);
      return formula;
    });
    await record("Snapshot durable reload with offline editing", async () => {
      await page.evaluate(() => window.spreadsheetSpike.save());
      await page.reload();
      await page.waitForFunction(() => window.spreadsheetSpike);
      await page.context().setOffline(true);
      try {
        await page.evaluate(() => window.spreadsheetSpike.restore());
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.spreadsheetSpike.current.workbook
                .getActiveSheet()
                .getRange("B4")
                .getValue(),
            ),
          )
          .toBe(10);
        await page.evaluate(() =>
          window.spreadsheetSpike.current.workbook
            .getActiveSheet()
            .getRange("A2")
            .setValue("Offline edit"),
        );
        await page.evaluate(() => window.spreadsheetSpike.save());
        await page.evaluate(() => window.spreadsheetSpike.restore());
        assert.equal(
          await page.evaluate(() =>
            window.spreadsheetSpike.current.workbook
              .getActiveSheet()
              .getRange("A2")
              .getValue(),
          ),
          "Offline edit",
        );
        return "Snapshot reload and offline edit/save/remount work; cold offline website startup is not tested.";
      } finally {
        await page.context().setOffline(false);
      }
    });
    await record(
      "Two editor instances preserve separate workbooks",
      async () => {
        assert.equal(
          await page.evaluate(() => window.spreadsheetSpike.mountSecond()),
          "Independent workbook",
        );
        assert.equal(
          await page.evaluate(() =>
            window.spreadsheetSpike.current.workbook
              .getActiveSheet()
              .getRange("A1")
              .getValue(),
          ),
          "Topic",
        );
        return "Two isolated engine instances coexist; focus/shortcut cross-talk requires further testing.";
      },
    );
    const aria = await page.locator("#sheet").ariaSnapshot();
    fs.writeFileSync(path.join(output, "accessibility-tree.txt"), aria);
    await record(
      "Spreadsheet cells exposed for assistive technology",
      async () => {
        const count = await page
          .locator('#sheet [role="gridcell"], #sheet td')
          .count();
        assert.ok(
          count > 0,
          `No semantic cell nodes found (${count}); rendered cell values are absent from the accessibility tree.`,
        );
        return count;
      },
    );
    await record("Controls have accessible names", async () => {
      const audit = await new AxeBuilder({ page })
        .include("#sheet")
        .withRules(["button-name", "label", "aria-input-field-name"])
        .analyze();
      const violations = audit.violations.map((v) => ({
        id: v.id,
        count: v.nodes.length,
        examples: v.nodes.slice(0, 3).map((n) => n.html),
      }));
      fs.writeFileSync(
        path.join(output, "accessibility-controls.json"),
        JSON.stringify(violations, null, 2),
      );
      assert.deepEqual(
        violations,
        [],
        JSON.stringify(violations.map(({ id, count }) => ({ id, count }))),
      );
      return "Named controls";
    });
    await page.screenshot({
      path: path.join(output, "engine.png"),
      fullPage: true,
    });
    const bundle = fs.readFileSync(path.join(output, "fixture.js"));
    const report = {
      testedAt: new Date().toISOString(),
      browser: await browser.version(),
      packages: require("./package.json").dependencies,
      initialReadyMs: Math.round(initialReadyMs),
      fixtureBundleBytes: bundle.length,
      fixtureBundleGzipBytes: zlib.gzipSync(bundle).length,
      runtimeErrors: errors,
      results,
      productionGate: results.every((r) => r.status === "pass")
        ? "INCOMPLETE: remaining gates not tested"
        : "FAILED: do not integrate as a production module",
    };
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          ...report,
          results: results.map(({ name, status }) => ({ name, status })),
        },
        null,
        2,
      ),
    );
    if (results.some((r) => r.status === "fail") || errors.length)
      process.exitCode = 1;
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
