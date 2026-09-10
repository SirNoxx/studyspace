import { mkdir, cp, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const output = resolve("public/code-runtime");
await mkdir(output, { recursive: true });
await cp(dirname(require.resolve("@yowasp/clang")), resolve(output, "clang"), {
  recursive: true,
});
const python = dirname(require.resolve("pyodide/package.json"));
await mkdir(resolve(output, "python"), { recursive: true });
for (const name of [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
])
  await copyFile(resolve(python, name), resolve(output, "python", name));
await copyFile(
  require.resolve("sql.js/dist/sql-wasm.wasm"),
  resolve(output, "sql-wasm.wasm"),
);
const options = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "eof",
};
await build({
  ...options,
  entryPoints: ["src/lib/code-runtime-worker.ts"],
  outfile: resolve(output, "worker.mjs"),
});
for (const [module, filename] of [
  ["typescript-runtime", "typescript.mjs"],
  ["sql.js", "sql.mjs"],
])
  await build({
    ...options,
    stdin: {
      contents: `import runtime from ${JSON.stringify(module)}; export default runtime;`,
      resolveDir: process.cwd(),
    },
    outfile: resolve(output, filename),
  });
console.log(
  "Prepared local code runtimes for JavaScript, TypeScript, Python, C, C++ and SQLite.",
);
