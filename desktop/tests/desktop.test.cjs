const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const {
  cloudOrigin,
  externalUrl,
  settingsSender,
  serverEnvironment,
} = require("../policy.cjs");
const { Updates } = require("../updates.cjs");
const {
  DEFAULT_CLOUD_ORIGIN,
  defaultSettings,
  restoreSettings,
} = require("../settings.cjs");
test("new installations connect while upgrades retain local work and custom servers", () => {
  assert.equal(defaultSettings().lastWorkspace, "cloud");
  assert.equal(defaultSettings().cloudOrigin, DEFAULT_CLOUD_ORIGIN);
  assert.equal(defaultSettings(true).lastWorkspace, "local");
  assert.deepEqual(
    restoreSettings({
      cloudOrigin: "",
      automaticUpdates: false,
      lastWorkspace: "local",
    }),
    {
      cloudOrigin: DEFAULT_CLOUD_ORIGIN,
      automaticUpdates: false,
      lastWorkspace: "local",
    },
  );
  assert.equal(
    restoreSettings({
      cloudOrigin: "https://custom.example.com",
      lastWorkspace: "cloud",
    }).cloudOrigin,
    "https://custom.example.com",
  );
  assert.throws(() =>
    restoreSettings({ cloudOrigin: "http://unsafe.example.com" }),
  );
});
test("cloud settings accept only HTTPS app origins", () => {
  assert.equal(
    cloudOrigin(" https://study.example.com/ "),
    "https://study.example.com",
  );
  assert.equal(cloudOrigin(""), "");
  for (const value of [
    "http://example.com",
    "javascript:alert(1)",
    "https://user:password@example.com",
    "https://example.com/w",
    "https://example.com?token=secret",
    "https://example.com/#key",
    "file:///C:/secret",
  ])
    assert.throws(() => cloudOrigin(value));
});
test("external navigation cannot open executable or filesystem protocols", () => {
  for (const value of [
    "file:///C:/Windows/system32/cmd.exe",
    "powershell:script",
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "bad",
  ])
    assert.equal(externalUrl(value), null);
  assert.equal(
    externalUrl("https://example.com/paper"),
    "https://example.com/paper",
  );
  assert.equal(
    externalUrl("mailto:author@example.com"),
    "mailto:author@example.com",
  );
});
test("workspace server receives no inherited cloud or deployment credentials", () => {
  const env = serverEnvironment(47831, {
    Path: "node",
    SystemRoot: "C:/Windows",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    NEXT_PUBLIC_SUPABASE_URL: "cloud",
    AI_API_KEY: "secret",
    GH_TOKEN: "secret",
    NODE_OPTIONS: "--require malicious.js",
  });
  assert.equal(env.Path, "node");
  assert.equal(env.PORT, "47831");
  assert.equal(env.HOSTNAME, "127.0.0.1");
  for (const key of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "AI_API_KEY",
    "GH_TOKEN",
    "NODE_OPTIONS",
  ])
    assert.equal(env[key], undefined);
});
test("desktop IPC requires the exact trusted settings main frame", () => {
  const file = path.resolve("settings.html"),
    frame = { url: pathToFileURL(file).href },
    contents = { mainFrame: frame },
    window = { webContents: contents, isDestroyed: () => false };
  assert.equal(
    settingsSender({ sender: contents, senderFrame: frame }, window, file),
    true,
  );
  assert.equal(
    settingsSender({ sender: {}, senderFrame: frame }, window, file),
    false,
  );
  assert.equal(
    settingsSender(
      { sender: contents, senderFrame: { url: frame.url } },
      window,
      file,
    ),
    false,
  );
  frame.url = "https://evil.example";
  assert.equal(
    settingsSender({ sender: contents, senderFrame: frame }, window, file),
    false,
  );
});
function fake() {
  const value = new EventEmitter();
  value.checks = 0;
  value.installs = 0;
  value.checkForUpdates = async () => {
    value.checks++;
    value.emit("update-not-available");
  };
  value.quitAndInstall = () => value.installs++;
  return value;
}
test("automatic checking can be disabled while manual checking remains available", async () => {
  const adapter = fake(),
    updates = new Updates(adapter, { enabled: false });
  await updates.check();
  assert.equal(adapter.checks, 0);
  await updates.check(true);
  assert.equal(adapter.checks, 1);
  assert.equal(updates.state.phase, "current");
  assert.equal(adapter.autoDownload, true);
  assert.equal(adapter.autoInstallOnAppQuit, false);
  assert.equal(adapter.allowDowngrade, false);
});
test("concurrent checks and ready downloads are not duplicated", async () => {
  const adapter = fake();
  let release;
  adapter.checkForUpdates = () => {
    adapter.checks++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const updates = new Updates(adapter);
  const first = updates.check();
  await updates.check(true);
  assert.equal(adapter.checks, 1);
  release();
  await first;
  adapter.emit("update-downloaded", { version: "1.0.1" });
  await updates.check(true);
  assert.equal(adapter.checks, 1);
  assert.equal(updates.state.progress, 100);
});
test("installation requires a verified download and successful workspace save", async () => {
  const adapter = fake();
  let saved = false;
  const updates = new Updates(adapter, { prepareInstall: async () => saved });
  await assert.rejects(() => updates.install(), /No downloaded update/);
  adapter.emit("update-available", { version: "1.0.1" });
  adapter.emit("download-progress", { percent: 37 });
  assert.equal(updates.state.progress, 37);
  adapter.emit("update-downloaded", { version: "1.0.1" });
  assert.equal(await updates.install(), false);
  assert.equal(adapter.installs, 0);
  saved = true;
  assert.equal(await updates.install(), true);
  assert.equal(adapter.installs, 1);
});
test("network errors recover on a later check without leaking URLs or credentials", async () => {
  const adapter = fake();
  adapter.checkForUpdates = async () => {
    throw new Error("https://secret:token@example.com");
  };
  const updates = new Updates(adapter);
  await updates.check();
  assert.equal(updates.state.phase, "error");
  assert.doesNotMatch(updates.state.message, /secret|token/);
  adapter.checkForUpdates = async () => adapter.emit("update-not-available");
  await updates.check();
  assert.equal(updates.state.phase, "current");
});
test("a failed automatic download is handled and can be retried", async () => {
  const adapter = fake();
  adapter.checkForUpdates = async () => ({
    downloadPromise: Promise.reject(new Error("download interrupted")),
  });
  const updates = new Updates(adapter);
  await updates.check();
  assert.equal(updates.state.phase, "error");
  assert.equal(updates.busy, false);
  adapter.checkForUpdates = async () => adapter.emit("update-not-available");
  await updates.check(true);
  assert.equal(updates.state.phase, "current");
});
