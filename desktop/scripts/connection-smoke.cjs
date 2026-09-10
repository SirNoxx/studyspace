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
  let page = await launch(false);
  await page.waitForURL(DEFAULT_CLOUD_ORIGIN + "/auth**", { timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Create an account", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  assert.equal(
    (await app.evaluate(() => global.__studyspaceStartupTimings))
      .localServerReadyMs,
    undefined,
  );
  await app.close();
  app = null;
  page = await launch(true);
  await page.waitForURL("http://127.0.0.1:47832/demo**", { timeout: 60000 });
  await page.goto("http://127.0.0.1:47832/auth");
  await expect(
    page.getByRole("link", { name: "Open connected workspace" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveCount(0);
  await page.getByRole("link", { name: "Open connected workspace" }).click();
  await page.waitForURL(DEFAULT_CLOUD_ORIGIN + "/auth**", { timeout: 60000 });
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: fresh installation opens hosted signup; legacy local data stays local; local sign-in switches to the hosted app inside the same desktop window.",
  );
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
  });
