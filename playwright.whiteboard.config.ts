import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: "whiteboard-framing.spec.ts",
  outputDir: "test-results/whiteboard-framing",
});
