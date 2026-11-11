import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app with seeded demo data:
 *
 *   npm run db:seed
 *   npm run dev            (or: npm run build && npm run start)
 *   npm run test:e2e
 *
 * Set E2E_BASE_URL when the app is not on http://localhost:3000.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
