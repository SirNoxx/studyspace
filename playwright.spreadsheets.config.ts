import { defineConfig } from "@playwright/test";
export default defineConfig({
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/spreadsheets/report.json" }],
  ],
  testDir: "./e2e",
  testMatch: ["spreadsheets.spec.ts"],
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    channel: process.env.BROWSER_CHANNEL,
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
  },
  outputDir: "test-results/spreadsheets",
});
