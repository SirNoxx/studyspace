import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: [
    "nested-definitions.spec.ts",
    "definition-collections.spec.ts",
    "definition-links.spec.ts",
    "module-text-tools.spec.ts",
  ],
  outputDir: "test-results/definitions",
  use: { ...base.use, actionTimeout: 15000 },
});
