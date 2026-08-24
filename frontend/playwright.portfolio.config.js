import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-portfolio",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.STAGING_FRONTEND_URL || "https://logistics.local",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
