const { _electron: electron, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const { DEFAULT_CLOUD_ORIGIN } = require("../settings.cjs");
const root = path.resolve(__dirname, "../..");
const executablePath =
  process.env.STUDYSPACE_TEST_EXE ||
  path.join(root, "desktop/release/win-unpacked/Studyspace.exe");
let app;
async function launch(legacy) {
  const profile = path.join(
    root,
    "desktop/.smoke",
    `connection-${legacy ? "legacy" : "fresh"}-${Date.now()}`,
  );
  await fs.mkdir(profile, { recursive: true });
  // Older installations may have notes but no saved desktop settings file.
  if (legacy) await fs.mkdir(path.join(profile, "IndexedDB"));
  const env = { ...process.env, STUDYSPACE_SMOKE_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath,
    args: ["--smoke-test"],
    env,
    timeout: 60000,
  });
  return app.firstWindow();
}
(async () => {
  for (const legacy of [false, true]) {
    const page = await launch(legacy);
    await page.waitForURL("http://127.0.0.1:47832/demo**", { timeout: 60000 });
    await expect(page.getByText("Make room for your ideas.")).toBeVisible();
    assert.equal(typeof (await app.evaluate(() => global.__studyspaceStartupTimings)).localServerReadyMs, "number");
    await app.evaluate(({ shell }) => {
      shell.openExternal = async url => { global.__connectionSmokeUrl = url; };
    });
    await page.evaluate(() => window.studyspaceDevice.signIn());
    const external = new URL(await app.evaluate(() => global.__connectionSmokeUrl));
    assert.equal(external.origin, DEFAULT_CLOUD_ORIGIN);
    assert.equal(external.pathname, "/auth");
    assert.ok(external.searchParams.get("next").startsWith("/desktop/connect?"));
    assert.ok(page.url().startsWith("http://127.0.0.1:47832/demo"));
    await app.close(); app = null;
  }
  console.log(
    "PASS: fresh and legacy installations keep local notes open; sign-in opens the configured hosted authentication in the external browser without navigating away from notes.",
  );
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
  });
