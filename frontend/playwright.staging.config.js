import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-staging",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.STAGING_FRONTEND_URL || "https://logistics.local",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
