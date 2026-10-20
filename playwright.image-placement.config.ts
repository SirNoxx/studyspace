import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({
  ...base,
  testMatch: "image-placement.spec.ts",
  outputDir: "test-results/image-placement",
});
