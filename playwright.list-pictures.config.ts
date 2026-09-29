import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "list-pictures.spec.ts",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    channel: process.env.BROWSER_CHANNEL ?? "msedge",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
  },
  outputDir: "test-results/list-pictures",
});
