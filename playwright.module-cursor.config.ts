import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({ ...base, testMatch: "module-cursor.spec.ts", outputDir: "test-results/module-cursor" });
