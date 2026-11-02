import { defineConfig } from "@playwright/test";
import base from "./playwright.weekly-checkups.config";

export default defineConfig({ ...base, testMatch: "scratchpad.spec.ts" });
