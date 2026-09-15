const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const profile = path.join(root, "desktop/.smoke", "unified-" + Date.now());
let app;
(async () => {
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, "desktop-settings.json"), JSON.stringify({ cloudOrigin: "https://studyspace.example.test", automaticUpdates: false, lastWorkspace: "cloud" }));
  const env = { ...process.env, STUDYSPACE_SMOKE_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: path.join(root, "desktop/release/win-unpacked/Studyspace.exe"), args: ["--smoke-test"], env, timeout: 60000 });
  const page = await app.firstWindow();
  await page.waitForURL("http://127.0.0.1:47832/**", { timeout: 60000 });
  await page.waitForFunction(() => !!window.studyspaceDevice);
  // Mock only the remote cloud in this isolated Electron process. Requests still
  // traverse the packaged Next proxy and private native bridge over real HTTP.
  await app.evaluate(({ shell }) => {
    global.__smokeRequests = [];
    shell.openExternal = async url => { global.__smokeAuthUrl = url; };
    global.fetch = async (url, init = {}) => {
      const pathname = new URL(String(url)).pathname;
      global.__smokeRequests.push({ pathname, authorization: init.headers?.Authorization });
      if (pathname === "/api/desktop/handoff") return Response.json({ access_token: "smoke-device-token", refresh_token: "smoke-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600 });
      if (pathname === "/api/session") return Response.json({ user: { id: "fb781af1-8079-43df-b132-c64161e51cba", email: "desktop-test@example.invalid" } });
      if (pathname === "/api/ai") return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode("data: first\n\n"));
        setTimeout(() => { controller.enqueue(new TextEncoder().encode("data: second\n\n")); controller.close(); }, 1500);
      } }), { headers: { "Content-Type": "text/event-stream" } });
      return Response.json({ error: "No fixture for this cloud endpoint" }, { status: 404 });
    };
  });
  await page.evaluate(() => window.studyspaceDevice.signIn());
  const authorization = await app.evaluate(() => global.__smokeAuthUrl);
  const next = new URL(new URL(authorization).searchParams.get("next"), "https://studyspace.example.test");
  const callback = new URL(next.searchParams.get("redirect"));
  callback.searchParams.set("state", next.searchParams.get("state"));
  callback.searchParams.set("code", "smoke-code");
  assert.equal((await fetch(callback)).status, 200);
  const result = await page.evaluate(async () => {
    const session = await fetch("/api/session").then(r => r.json());
    const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const reader = response.body.getReader();
    const first = await reader.read();
    const second = await reader.read();
    return { session, status: response.status, type: response.headers.get("content-type"), first: new TextDecoder().decode(first.value), second: new TextDecoder().decode(second.value), node: typeof window.require, process: typeof window.process, exposed: Object.keys(window.studyspaceDevice).sort() };
  });
  assert.equal(result.session.user.id, "fb781af1-8079-43df-b132-c64161e51cba");
  assert.equal(result.status, 200);
  assert.match(result.type, /event-stream/);
  assert.match(result.first, /first/);
  assert.match(result.second, /second/);
  assert.deepEqual(result.exposed, ["signIn", "signOut"]);
  assert.equal(result.node, "undefined"); assert.equal(result.process, "undefined");
  assert.equal(await app.evaluate(() => global.__smokeRequests.find(r => r.pathname === "/api/ai").authorization), "Bearer smoke-device-token");
  await page.evaluate(() => window.studyspaceDevice.signOut());
  const signedOut = await page.evaluate(() => fetch("/api/session").then(r => r.json()));
  assert.equal(signedOut.user, null);
  await assert.rejects(fs.readFile(path.join(profile, "cloud-session.enc")));
  assert.ok(page.url().startsWith("http://127.0.0.1:47832/demo"));
  await app.close(); app = null;
  console.log("PASS: packaged local startup, native sign-in, authenticated Next proxy, incremental AI streaming, renderer isolation, sign-out and credential removal.");
})().catch(async error => { console.error(error); if (app) await app.close().catch(() => {}); process.exitCode = 1; });
