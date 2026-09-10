import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, access } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(import.meta.url),
  args = process.argv.slice(2),
  command = args[0];
const root = process.cwd(),
  standalone = resolve(root, ".next/standalone");
if (command === "dev" || command === "build") await import("./prepare-code-runtimes.mjs");
async function copyAssets() {
  await cp(resolve(root, "public"), resolve(standalone, "public"), {
    recursive: true,
  });
  await cp(resolve(root, ".next/static"), resolve(standalone, ".next/static"), {
    recursive: true,
  });
}
let executable = require.resolve("next/dist/bin/next"),
  childArgs = args,
  env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  cwd = root;
if (command === "start") {
  try {
    await access(resolve(standalone, "server.js"));
  } catch {
    throw new Error("Production build missing. Run npm run build first.");
  }
  require("@next/env").loadEnvConfig(root, false);
  await copyAssets();
  const value = (flag, fallback) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    PORT: value("-p", value("--port", process.env.PORT ?? "3000")),
    HOSTNAME: value("--hostname", "127.0.0.1"),
  };
  executable = resolve(standalone, "server.js");
  childArgs = [];
  cwd = standalone;
}
const child = spawn(process.execPath, [executable, ...childArgs], {
  stdio: "inherit",
  env,
  cwd,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  if (command === "build" && code === 0) {
    try {
      await copyAssets();
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  }
  process.exit(code ?? 1);
});
