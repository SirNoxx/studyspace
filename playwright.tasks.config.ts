import { defineConfig } from "@playwright/test";
import base from "./playwright.list-pictures.config";
export default defineConfig({ ...base, testMatch: "task-lists.spec.ts", outputDir: "test-results/tasks" });
