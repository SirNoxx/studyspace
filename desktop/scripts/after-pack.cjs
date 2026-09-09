const fs = require("node:fs/promises");
const path = require("node:path");
module.exports = async (context) => {
  // electron-builder's generic resource walker skips node_modules directories.
  // Preserve Next's traced dependency tree, including nested package versions.
  const source = path.resolve(__dirname, "../.stage/web");
  const destination = path.join(context.appOutDir, "resources", "web");
  await fs.access(path.join(source, "node_modules/next/package.json"));
  await fs.cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (file) =>
      !path.basename(file).startsWith(".env") &&
      path.basename(file) !== "cache",
  });
  await fs.access(path.join(destination, "node_modules/next/package.json"));
};
