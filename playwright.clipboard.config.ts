import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: "clipboard-formatting.spec.ts",
  outputDir: "test-results/clipboard",
});
