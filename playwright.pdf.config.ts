import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: "pdf-modules.spec.ts",
  outputDir: "test-results/pdf",
});
