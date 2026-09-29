import { createRequire } from "node:module";
import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const require = createRequire(import.meta.url),
  source = dirname(require.resolve("pdfjs-dist/package.json")),
  root = process.cwd();
await mkdir(resolve(root, "public/pdf-assets"), { recursive: true });
await cp(
  resolve(source, "build/pdf.worker.min.mjs"),
  resolve(root, "public/pdf.worker.min.mjs"),
);
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"])
  await cp(resolve(source, name), resolve(root, "public/pdf-assets", name), {
    recursive: true,
  });
await mkdir(resolve(root, "public/licenses/pdf"), { recursive: true });
await cp(
  resolve(source, "LICENSE"),
  resolve(root, "public/licenses/pdf/PDFJS-LICENSE.txt"),
);
await cp(
  resolve(dirname(require.resolve("pdf-lib/package.json")), "LICENSE.md"),
  resolve(root, "public/licenses/pdf/PDF-LIB-LICENSE.txt"),
);
