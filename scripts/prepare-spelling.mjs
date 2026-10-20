import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
const require = createRequire(import.meta.url);
const output = resolve("public/spelling"),
  dictionary = dirname(require.resolve("dictionary-en"));
await mkdir(output, { recursive: true });
for (const file of ["index.aff", "index.dic", "license"])
  await copyFile(resolve(dictionary, file), resolve(output, file));
for (const [pkg, filename] of [
  ["nspell", "license"],
  ["fuzzball", "LICENSE.md"],
]) {
  const root = dirname(require.resolve(pkg + "/package.json"));
  await copyFile(
    resolve(root, filename),
    resolve(output, pkg + "-license.txt"),
  );
}
for (const pkg of ["retext-english","retext-contractions","retext-indefinite-article","retext-repeated-words","retext-stringify"]) {
  await copyFile(["retext-english","retext-stringify"].includes(pkg) ? resolve("scripts/licenses/retext.txt") : resolve(dirname(require.resolve(pkg)),"license"),resolve(output,pkg+"-license.txt"));
}
await build({
  entryPoints: ["src/lib/spelling-worker.ts"],
  outfile: resolve(output, "worker.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
