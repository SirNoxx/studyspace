const { _electron: electron, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const profile = path.join(root, "desktop/.smoke", `profile-${Date.now()}`);
const executablePath = path.join(
  root,
  "desktop/release/win-unpacked/Studyspace.exe",
);
const env = { ...process.env, STUDYSPACE_SMOKE_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch() {
  app = await electron.launch({
    executablePath,
    args: ["--smoke-test"],
    env,
    timeout: 60000,
  });
  app.process().stderr.on("data", (chunk) => process.stderr.write(chunk));
  const workspace = await app.firstWindow({ timeout: 60000 });
  await workspace.waitForURL("http://127.0.0.1:47832/**", { timeout: 60000 });
  let settings = app.windows().find((page) => page !== workspace);
  if (!settings)
    settings = await app.waitForEvent("window", { timeout: 15000 });
  await settings.waitForURL("file:///**");
  await settings.waitForFunction(() => !!window.studyspaceDesktop);
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.showInactive();
  });
  return { workspace, settings };
}
async function closeMain() {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith("http:"))
      .close(),
  );
  await closed;
}
(async () => {
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(
    path.join(profile, "desktop-settings.json"),
    JSON.stringify({ lastWorkspace: "local", automaticUpdates: false }),
  );
  let { workspace, settings } = await launch();
  const errors = [];
  workspace.on("pageerror", (error) => errors.push(error.message));
  await expect(workspace.getByText("Make room for your ideas.")).toBeVisible();
  assert.deepEqual(
    await workspace.evaluate(() => ({
      node: typeof window.require,
      process: typeof window.process,
      bridge: typeof window.studyspaceDesktop,
    })),
    { node: "undefined", process: "undefined", bridge: "undefined" },
  );
  const state = await settings.evaluate(() => window.studyspaceDesktop.state());
  assert.equal(state.version, require("../package.json").version);
  assert.equal(state.packaged, true);
  await settings
    .getByLabel("Studyspace app address")
    .fill("http://unsafe.example");
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(settings.locator("#feedback")).toContainText("HTTPS");
  await settings
    .getByLabel("Studyspace app address")
    .fill("https://studyspace.example.com");
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(settings.locator("#feedback")).toHaveText("Settings saved.");
  await settings.screenshot({
    path: path.join(root, "docs/screenshots/windows-desktop-settings.png"),
    fullPage: true,
  });
  await workspace
    .getByRole("button", { name: "Quick note", exact: true })
    .first()
    .click();
  await workspace
    .getByRole("textbox", { name: "Quick note title" })
    .fill("Windows desktop persistence");
  await workspace
    .getByRole("textbox", { name: "Quick note body" })
    .fill("Saved from the bundled Windows app.");
  await workspace.getByRole("button", { name: "Save & open" }).click();
  const title = workspace.getByRole("textbox", { name: "Note title" });
  await expect(title).toHaveValue("Windows desktop persistence");
  await expect(workspace.locator(".cm-content")).toContainText(
    "Saved from the bundled Windows app.",
  );
  await workspace.screenshot({
    path: path.join(root, "docs/screenshots/windows-desktop-workspace.png"),
  });
  await title.fill("Saved immediately before closing");
  await closeMain();
  ({ workspace, settings } = await launch());
  await expect(
    workspace.getByRole("textbox", { name: "Note title" }),
  ).toHaveValue("Saved immediately before closing");
  await expect(workspace.locator(".cm-content")).toContainText(
    "Saved from the bundled Windows app.",
  );
  assert.equal(
    (await settings.evaluate(() => window.studyspaceDesktop.state())).settings
      .cloudOrigin,
    "https://studyspace.example.com",
  );
  assert.equal(
    await app.evaluate(({ app }) => app.getPath("userData")),
    profile,
  );
  assert.deepEqual(errors, []);
  const updateConfig = await fs.readFile(
    path.join(root, "desktop/release/win-unpacked/resources/app-update.yml"),
    "utf8",
  );
  assert.match(updateConfig, /owner: SirNoxx/);
  assert.match(updateConfig, /repo: studyspace/);
  await workspace.goto("http://127.0.0.1:47832/demo/review");
  await workspace
    .getByRole("button", { name: "Dismiss this tab’s introduction" })
    .click();
  await closeMain();
  ({ workspace, settings } = await launch());
  await workspace.goto("http://127.0.0.1:47832/demo/review");
  await expect(
    workspace.getByRole("button", { name: "Dismiss this tab’s introduction" }),
  ).toHaveCount(0);
  await expect(workspace.locator(".view-header-compact h1")).toHaveText(
    "Review",
  );
  await closeMain();
  app = null;
  console.log(
    "PASS: packaged startup, renderer isolation, settings validation, immediate-close save, restart persistence, persistent introduction dismissal, and GitHub update configuration.",
  );
  console.log(`Isolated test profile: ${profile}`);
})().catch(async (error) => {
  console.error(error);
  if (app) await app.close().catch(() => {});
  process.exitCode = 1;
});
