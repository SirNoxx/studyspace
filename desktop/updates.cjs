class Updates {
  constructor(
    updater,
    {
      enabled = true,
      packaged = true,
      changed = () => {},
      ready = () => {},
      prepareInstall = async () => true,
    } = {},
  ) {
    this.updater = updater;
    this.enabled = enabled;
    this.packaged = packaged;
    this.changed = changed;
    this.prepareInstall = prepareInstall;
    this.busy = false;
    this.state = {
      phase: "idle",
      message: "Automatic update checks are enabled.",
      progress: 0,
      version: null,
      lastChecked: null,
    };
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on("checking-for-update", () =>
      this.set({ phase: "checking", message: "Checking GitHub for updates…" }),
    );
    updater.on("update-available", (info) =>
      this.set({
        phase: "downloading",
        message: `Downloading Studyspace ${info.version}…`,
        version: info.version,
        progress: 0,
      }),
    );
    updater.on("download-progress", (info) =>
      this.set({
        phase: "downloading",
        progress: Math.max(0, Math.min(100, info.percent)),
        message: "Downloading the update in the background…",
      }),
    );
    updater.on("update-not-available", () =>
      this.set({
        phase: "current",
        message: "You have the latest version.",
        lastChecked: new Date().toISOString(),
      }),
    );
    updater.on("update-downloaded", (info) => {
      this.set({
        phase: "ready",
        version: info.version,
        progress: 100,
        message: `Version ${info.version} is ready. Restart when you are ready to install.`,
      });
      ready(info.version);
    });
    updater.on("error", () =>
      this.set({
        phase: "error",
        message:
          "The update could not be completed. Check your connection and try again.",
      }),
    );
  }
  set(patch) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  async check(manual = false) {
    if (this.busy || ["downloading", "ready"].includes(this.state.phase))
      return this.state;
    if (!this.packaged) {
      this.set({
        phase: "development",
        message: "Install the Windows release to receive updates.",
      });
      return this.state;
    }
    if (!manual && !this.enabled) return this.state;
    this.busy = true;
    try {
      const result = await this.updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
    } catch {
      this.set({
        phase: "error",
        message:
          "Unable to complete the update. Check your connection and retry.",
      });
    } finally {
      this.busy = false;
    }
    return this.state;
  }
  async install() {
    if (this.state.phase !== "ready")
      throw new Error("No downloaded update is ready to install.");
    if (!(await this.prepareInstall())) return false;
    this.updater.quitAndInstall(false, true);
    return true;
  }
  start() {
    this.startup = setTimeout(() => void this.check(), 15000);
    this.interval = setInterval(() => void this.check(), 6 * 60 * 60 * 1000);
  }
  stop() {
    clearTimeout(this.startup);
    clearInterval(this.interval);
  }
}
module.exports = { Updates };
