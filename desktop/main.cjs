const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  dialog,
  utilityProcess,
  Notification,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { autoUpdater } = require("electron-updater");
const {
  cloudOrigin,
  externalUrl,
  settingsSender,
  serverEnvironment,
} = require("./policy.cjs");
const { Updates } = require("./updates.cjs");
app.setPath("userData", path.join(app.getPath("appData"), "Studyspace"));
const smoke = process.argv.includes("--smoke-test");
if (smoke) {
  if (!process.env.STUDYSPACE_SMOKE_DATA)
    throw new Error("An isolated smoke-test data directory is required.");
  app.setPath("userData", path.resolve(process.env.STUDYSPACE_SMOKE_DATA));
}
app.setAppUserModelId("com.sirnoxx.studyspace");
const port = smoke ? 47832 : 47831,
  localOrigin = `http://127.0.0.1:${port}`;
const settingsPath = path.join(__dirname, "ui", "settings.html");
const guide =
  "https://github.com/SirNoxx/studyspace/blob/main/docs/windows-supabase-setup.md";
let mainWindow,
  settingsWindow,
  server,
  updater,
  closing = false,
  closePending = false,
  quitting = false;
let settings = {
  cloudOrigin: "",
  automaticUpdates: true,
  lastWorkspace: "local",
};
const settingsFile = () =>
  path.join(app.getPath("userData"), "desktop-settings.json");
const desktopState = () => ({
  version: app.getVersion(),
  settings,
  updates: updater?.state ?? { phase: "idle", message: "Starting…" },
  packaged: app.isPackaged,
});
function broadcast() {
  if (settingsWindow && !settingsWindow.isDestroyed())
    settingsWindow.webContents.send("desktop:state-changed", desktopState());
}
async function saveSettings() {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(
    settingsFile() + ".tmp",
    JSON.stringify(settings, null, 2),
  );
  await fs.rename(settingsFile() + ".tmp", settingsFile());
  broadcast();
}
async function launchLocalServer() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `Studyspace's local port ${port} is already in use. Close the other process and open Studyspace again. Your notes have not been moved.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
  const web = app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.join(__dirname, ".stage", "web");
  await fs.access(path.join(web, "server.js"));
  server = utilityProcess.fork(path.join(web, "server.js"), [], {
    cwd: web,
    env: serverEnvironment(port),
    stdio: "pipe",
    serviceName: "Studyspace local workspace",
  });
  let exited = false;
  server.on("exit", () => {
    exited = true;
    if (!quitting && mainWindow && !mainWindow.isDestroyed())
      dialog.showErrorBox(
        "Studyspace local workspace stopped",
        "Your saved notes remain on this computer. Close and reopen Studyspace to restart the local workspace.",
      );
  });
  // Drain pipes without logging note bodies, credentials, or URLs.
  server.stdout?.on("data", () => {});
  server.stderr?.on("data", (chunk) => {
    if (smoke) process.stderr.write(chunk);
  });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (exited) throw new Error("The bundled local workspace could not start.");
    try {
      const response = await fetch(`${localOrigin}/api/health`, {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) {
        const health = await response.json();
        if (health.status === "local-demo") return;
        throw new Error("Unexpected local server configuration.");
      }
    } catch (error) {
      if (error.message === "Unexpected local server configuration.")
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The local workspace took too long to start.");
}
async function flushWorkspace() {
  if (!mainWindow || mainWindow.isDestroyed()) return true;
  try {
    return await mainWindow.webContents.executeJavaScript(
      "window.__studyspaceFlushForClose ? window.__studyspaceFlushForClose() : true",
    );
  } catch {
    return false;
  }
}
async function prepareClose() {
  if (await flushWorkspace()) return true;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "Your latest changes are still saving",
    message: "Studyspace could not finish saving your latest changes.",
    detail:
      "Keep the app open to retry saving or export your work before closing.",
    buttons: ["Keep Studyspace open", "Close anyway"],
    defaultId: 0,
    cancelId: 0,
  });
  return response === 1;
}
function guard(window, origin) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const safe = externalUrl(url);
    if (safe) void shell.openExternal(safe);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === origin()) return;
    } catch {}
    event.preventDefault();
    const safe = externalUrl(url);
    if (safe) void shell.openExternal(safe);
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
}
async function openWorkspace(kind) {
  if (!["local", "cloud"].includes(kind))
    throw new Error("Choose a local or connected workspace.");
  if (kind === "cloud" && !settings.cloudOrigin) {
    showSettings();
    return;
  }
  if (!(await flushWorkspace()))
    throw new Error(
      "Finish saving or export your current work before switching workspaces.",
    );
  settings.lastWorkspace = kind;
  await saveSettings();
  await mainWindow.loadURL(
    kind === "cloud" ? `${settings.cloudOrigin}/w` : `${localOrigin}/demo`,
  );
  mainWindow.show();
}
function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 650,
    height: 730,
    minWidth: 490,
    minHeight: 520,
    parent: mainWindow,
    show: !smoke,
    title: "Studyspace desktop settings",
    backgroundColor: "#f7f7f0",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  settingsWindow.setMenu(null);
  guard(settingsWindow, () => "null");
  // The trusted settings page never navigates to content outside the bundled UI.
  settingsWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  void settingsWindow.loadFile(settingsPath);
}
function installMenu() {
  const action = (fn) => () =>
    Promise.resolve(fn()).catch((error) =>
      dialog.showErrorBox("Studyspace", error.message),
    );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Studyspace",
        submenu: [
          {
            label: "Local workspace",
            click: action(() => openWorkspace("local")),
          },
          {
            label: "Connected cloud workspace",
            click: action(() => openWorkspace("cloud")),
          },
          { label: "Desktop settings…", click: showSettings },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : []),
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Check for updates…",
            click: () => {
              showSettings();
              void updater.check(true);
            },
          },
          {
            label: "Supabase setup guide",
            click: () => shell.openExternal(guide),
          },
          {
            label: "GitHub releases",
            click: () =>
              shell.openExternal(
                "https://github.com/SirNoxx/studyspace/releases",
              ),
          },
          { type: "separator" },
          {
            label: `About Studyspace ${app.getVersion()}`,
            click: () =>
              dialog.showMessageBox({
                title: "Studyspace · Version 1",
                message: `Studyspace ${app.getVersion()}`,
                detail:
                  "A place for writing, research, and understanding.\nCreated by SirNoxx.\nLocal notes stay on this device.",
              }),
          },
        ],
      },
    ]),
  );
}
function registerIPC() {
  const handle = (name, fn) =>
    ipcMain.handle(name, async (event, ...args) => {
      if (!settingsSender(event, settingsWindow, settingsPath))
        throw new Error("Untrusted desktop request.");
      return fn(...args);
    });
  handle("desktop:state", () => desktopState());
  handle("desktop:save", async (value) => {
    if (
      !value ||
      typeof value.cloudOrigin !== "string" ||
      typeof value.automaticUpdates !== "boolean"
    )
      throw new Error("Invalid settings.");
    settings = {
      ...settings,
      cloudOrigin: cloudOrigin(value.cloudOrigin),
      automaticUpdates: value.automaticUpdates,
    };
    if (!settings.cloudOrigin) settings.lastWorkspace = "local";
    updater.enabled = settings.automaticUpdates;
    await saveSettings();
    return desktopState();
  });
  handle("desktop:check-updates", async () => {
    await updater.check(true);
    return desktopState();
  });
  handle("desktop:install-update", () => updater.install());
  handle("desktop:open-workspace", openWorkspace);
  handle("desktop:guide", () => shell.openExternal(guide));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      try {
        const saved = JSON.parse(await fs.readFile(settingsFile(), "utf8"));
        settings = {
          cloudOrigin: cloudOrigin(saved.cloudOrigin ?? ""),
          automaticUpdates: saved.automaticUpdates !== false,
          lastWorkspace: saved.lastWorkspace === "cloud" ? "cloud" : "local",
        };
      } catch {}
      await launchLocalServer();
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 850,
        minHeight: 600,
        title: "Studyspace",
        show: false,
        backgroundColor: "#f5f7f2",
        icon: path.join(__dirname, "build", "icon.png"),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          spellcheck: true,
        },
      });
      guard(mainWindow, () =>
        settings.lastWorkspace === "cloud" ? settings.cloudOrigin : localOrigin,
      );
      mainWindow.on("close", (event) => {
        if (closing) return;
        event.preventDefault();
        if (closePending) return;
        closePending = true;
        void prepareClose().then((ok) => {
          closePending = false;
          if (ok) {
            closing = true;
            mainWindow.close();
          }
        });
      });
      mainWindow.on("closed", () => {
        settingsWindow?.destroy();
        app.quit();
      });
      mainWindow.webContents.on("will-prevent-unload", (event) => {
        if (closing) event.preventDefault();
      });
      updater = new Updates(autoUpdater, {
        enabled: settings.automaticUpdates,
        packaged: app.isPackaged,
        changed: broadcast,
        ready: (version) => {
          if (!smoke && Notification.isSupported())
            new Notification({
              title: "Studyspace update ready",
              body: `Version ${version} is downloaded. Open Help → Check for updates to restart and install.`,
            }).show();
        },
        prepareInstall: async () => {
          if (!(await flushWorkspace())) {
            dialog.showErrorBox(
              "Save before updating",
              "Your latest changes have not finished saving. Please retry after saving or exporting your work.",
            );
            return false;
          }
          closing = true;
          return true;
        },
      });
      registerIPC();
      installMenu();
      await mainWindow.loadURL(
        settings.lastWorkspace === "cloud" && settings.cloudOrigin
          ? `${settings.cloudOrigin}/w`
          : `${localOrigin}/demo`,
      );
      if (!smoke) {
        mainWindow.show();
        updater.start();
      } else showSettings();
    })
    .catch((error) => {
      if (smoke) console.error(error);
      else dialog.showErrorBox("Unable to open Studyspace", error.message);
      quitting = true;
      server?.kill();
      app.exit(1);
    });
  app.on("before-quit", (event) => {
    if (mainWindow && !mainWindow.isDestroyed() && !closing) {
      event.preventDefault();
      mainWindow.close();
    }
  });
  app.on("window-all-closed", () => {
    closing = true;
    app.quit();
  });
  app.on("will-quit", () => {
    quitting = true;
    updater?.stop();
    server?.kill();
  });
}
