import { defineConfig, devices } from "playwright/test";

/**
 * Mission Control E2E Test Suite
 *
 * Prerequisites: `bun run dev` must be running on :4000 (from this package dir)
 * or Playwright will start it automatically via the webServer config below.
 *
 * Run all:       npx playwright test --config packages/mission-control/playwright.config.ts
 * Run one file:  npx playwright test --config packages/mission-control/playwright.config.ts e2e/specs/phase-11-stabilization.spec.ts
 * Run with UI:   npx playwright test --config packages/mission-control/playwright.config.ts --ui
 * Debug:         npx playwright test --config packages/mission-control/playwright.config.ts --debug
 *
 * Or cd into packages/mission-control and run:
 *   npx playwright test
 */
export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false, // specs depend on server state — run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "e2e/reports/html" }], ["list"]],

  use: {
    baseURL: "http://localhost:4000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Longer timeout — the dev server cold-starts Bun + React
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /**
   * Start the Mission Control dev server automatically if it is not already
   * running. Set MC_NO_WEBSERVER=1 to skip (e.g. when you started the server
   * manually or want to test against a production build).
   */
  webServer: process.env.MC_NO_WEBSERVER
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:4000",
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
