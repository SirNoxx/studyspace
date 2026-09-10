const { _electron: electron, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");
const net = require("node:net");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const executablePath =
  process.env.STUDYSPACE_TEST_EXE ||
  path.join(root, "desktop/release/win-unpacked/Studyspace.exe");
const evidence = {
  baselinePackagedMs: { firstWindow: 6037, workspaceReady: 6565 },
  scenarios: {},
};
let app, blocker, mainPage;
async function launch(name, delay = 0, settings) {
  const profile = path.join(
    root,
    "desktop/.smoke",
    `startup-${name}-${Date.now()}`,
  );
  await fs.mkdir(profile, { recursive: true });
  if (settings)
    await fs.writeFile(
      path.join(profile, "desktop-settings.json"),
      JSON.stringify(settings),
    );
  const env = {
    ...process.env,
    STUDYSPACE_SMOKE_DATA: profile,
    STUDYSPACE_SMOKE_STARTUP_DELAY_MS: String(delay),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath,
    args: ["--smoke-test"],
    env,
    timeout: 60000,
  });
  mainPage = await app.firstWindow();
  return mainPage;
}
async function close() {
  const local = app
    .windows()
    .find((page) => page.url().startsWith("http://127.0.0.1:47832"));
  if (local)
    await local.waitForFunction(
      () =>
        typeof window.__studyspaceFlushForClose === "function" &&
        window.__studyspaceFlushForClose(),
    );
  const closed = app.waitForEvent("close", { timeout: 15000 });
  const window = await app.browserWindow(mainPage);
  await window.evaluate((window) => window.close());
  await closed;
  app = null;
}
(async () => {
  let page = await launch("normal");
  await page.waitForURL("http://127.0.0.1:47832/**", { timeout: 60000 });
  await expect(page.getByText("Make room for your ideas.")).toBeVisible();
  evidence.scenarios.normal = await app.evaluate(
    () => global.__studyspaceStartupTimings,
  );
  assert(
    evidence.scenarios.normal.loadingPageMs <
      evidence.scenarios.normal.localServerReadyMs,
  );
  await close();

  page = await launch("slow", 5000);
  await expect(page.getByRole("status")).toContainText(
    "Opening your workspace",
  );
  await page.screenshot({
    path: path.join(root, "docs/screenshots/windows-desktop-startup.png"),
  });
  const early = await app.evaluate(() => global.__studyspaceStartupTimings);
  assert.equal(early.localServerReadyMs, undefined);
  await page.waitForURL("http://127.0.0.1:47832/**", { timeout: 60000 });
  evidence.scenarios.slow = await app.evaluate(
    () => global.__studyspaceStartupTimings,
  );
  await close();

  page = await launch("close-during-startup", 10000);
  await expect(page.getByRole("status")).toContainText(
    "Opening your workspace",
  );
  await close();
  evidence.scenarios.closeDuringStartup =
    "Closed cleanly before starting the server";

  blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(47832, "127.0.0.1", resolve);
  });
  page = await launch("port-conflict");
  await page.waitForURL(/error=1/, { timeout: 60000 });
  await expect(page.locator("#help")).toBeVisible();
  evidence.scenarios.portConflict = "Visible, closable error screen";
  await close();

  page = await launch("cloud", 2000, {
    lastWorkspace: "cloud",
    cloudOrigin: "https://studyspace.example.com",
    automaticUpdates: false,
  });
  await page.route("https://studyspace.example.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Cloud workspace fixture</h1><script>window.__studyspaceFlushForClose=async()=>true</script>",
    }),
  );
  await page.waitForURL("https://studyspace.example.com/w", { timeout: 60000 });
  await expect(page.getByRole("heading")).toHaveText("Cloud workspace fixture");
  const cloud = await app.evaluate(() => global.__studyspaceStartupTimings);
  assert.equal(cloud.localServerReadyMs, undefined);
  evidence.scenarios.cloud =
    "Opened cloud with local port occupied; no local server startup";
  await close();
  await new Promise((resolve) => blocker.close(resolve));
  blocker = null;
  await fs.writeFile(
    path.join(root, "docs/evidence/desktop-startup.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    if (blocker) blocker.close();
  });
