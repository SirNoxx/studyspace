// Run with the desktop Electron binary. Downloads the real installer into an
// isolated test cache, verifies it, and rejects a deliberately corrupt manifest.
// It never executes an installer or changes a user's Studyspace profile.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const yaml = require("js-yaml");
const { NsisUpdater } = require("electron-updater");
const {
  ElectronHttpExecutor,
} = require("electron-updater/out/electronHttpExecutor");
const root = path.resolve(__dirname, "../..");
const isolated = path.join(root, "desktop/.smoke", `update-${Date.now()}`);
app.setPath("userData", isolated);
let server;
app
  .whenReady()
  .then(async () => {
    const release = path.join(root, "desktop/release");
    const metadata = yaml.load(
      fs.readFileSync(path.join(release, "latest.yml"), "utf8"),
    );
    const installer = path.join(release, metadata.files[0].url);
    let corrupt = false;
    server = http.createServer((request, response) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/latest.yml") {
        const data = structuredClone(metadata);
        if (corrupt) {
          data.sha512 = Buffer.alloc(64).toString("base64");
          data.files[0].sha512 = data.sha512;
        }
        response.end(yaml.dump(data));
      } else if (pathname === "/" + metadata.files[0].url) {
        response.writeHead(200, {
          "Content-Length": fs.statSync(installer).size,
        });
        fs.createReadStream(installer).pipe(response);
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    async function check(cache) {
      const adapter = {
        version: "0.9.0",
        name: "Studyspace-update-verification",
        isPackaged: true,
        appUpdateConfigPath: path.join(
          release,
          "win-unpacked/resources/app-update.yml",
        ),
        userDataPath: path.join(isolated, cache, "data"),
        baseCachePath: path.join(isolated, cache),
        whenReady: () => Promise.resolve(),
        onQuit: () => {},
        quit: () => {
          throw new Error(
            "Test must never install or quit through the updater",
          );
        },
        relaunch: () => {
          throw new Error("Test must never relaunch");
        },
      };
      const updater = new NsisUpdater(null, adapter);
      updater.httpExecutor = new ElectronHttpExecutor();
      updater.autoInstallOnAppQuit = false;
      updater.disableDifferentialDownload = true;
      updater.logger = null;
      updater.setFeedURL({
        provider: "generic",
        url: `http://127.0.0.1:${server.address().port}`,
      });
      const result = await updater.checkForUpdates();
      assert.equal(result.updateInfo.version, metadata.version);
      return await result.downloadPromise;
    }
    const files = await check("valid");
    assert.equal(files.length, 1);
    const digest = crypto
      .createHash("sha512")
      .update(fs.readFileSync(files[0]))
      .digest("base64");
    assert.equal(digest, metadata.files[0].sha512);
    corrupt = true;
    await assert.rejects(() => check("corrupt"), /sha512 checksum mismatch/i);
    console.log(
      "PASS: actual NSIS updater downloads and verifies the release installer, and rejects a corrupt SHA512 manifest. No installer was executed.",
    );
    server.close();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    server?.close();
    app.exit(1);
  });
