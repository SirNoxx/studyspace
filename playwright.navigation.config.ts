import { defineConfig } from "@playwright/test";
import base from "./playwright.weekly-checkups.config";

export default defineConfig({
  ...base,
  testMatch: [
    "navigation-organization.spec.ts",
    "contextual-sidebar.spec.ts",
    "shared-explorer.spec.ts",
  ],
});
