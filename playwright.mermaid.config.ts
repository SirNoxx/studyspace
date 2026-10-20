import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: "mermaid-paste.spec.ts",
  outputDir: "test-results/mermaid",
});
