const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { serverEnvironment } = require("../policy.cjs");
(async () => {
  const root = path.resolve(__dirname, "../.."),
    stage = path.resolve(root, "desktop/.stage"),
    web = path.join(stage, "web");
  for (const name of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]) {
    try {
      await fs.access(path.join(root, name));
    } catch {
      continue;
    }
    throw new Error(
      `Desktop releases must be built from a clean checkout without ${name}. Keep cloud credentials in your deployment, and build desktop from a separate checkout.`,
    );
  }
  const built = spawnSync(process.execPath, ["scripts/next.mjs", "build"], {
    cwd: root,
    stdio: "inherit",
    env: serverEnvironment(47831),
  });
  if (built.status !== 0) throw new Error("Web production build failed.");
  if (
    web !== path.resolve(root, "desktop", ".stage", "web") ||
    !web.startsWith(stage + path.sep)
  )
    throw new Error("Invalid staging directory.");
  await fs.rm(web, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });
  await fs.cp(path.join(root, ".next/standalone"), web, {
    recursive: true,
    dereference: true,
    filter: (source) =>
      !path.basename(source).startsWith(".env") &&
      path.basename(source) !== "cache",
  });
  console.log("Bundled local workspace staged without cloud credentials.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
