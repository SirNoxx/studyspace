import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "weekly-checkups.spec.ts",
  timeout: 120000,
  workers: 1,
  use: { ...base.use, actionTimeout: 15000 },
  projects: [
    {
      name: "weekly-checkups",
      use: {
        browserName: "chromium",
        channel: process.env.BROWSER_CHANNEL ?? "msedge",
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
        launchOptions: { args: ["--disable-gpu"] },
      },
    },
  ],
});
