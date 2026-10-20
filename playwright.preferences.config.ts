import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: "settings-and-tabs.spec.ts",
  outputDir: "test-results/preferences",
  use: { ...base.use, actionTimeout: 15000 },
});
