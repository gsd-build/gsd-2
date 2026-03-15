/**
 * auth.ts — Playwright test fixtures for Mission Control E2E tests.
 *
 * Provides two fixtures:
 *
 * `authenticatedPage` — page with Tauri IPC mocked so that:
 *   - isTauri() → true (window.__TAURI__ is set)
 *   - get_active_provider → "claude"
 *   - check_and_refresh_token → { needs_reauth: false, ... }
 *   - check_for_updates / install_update → null
 *   - get_provider_status → mock provider status
 *   /api/trust-status → { trusted: true, gsdDir: "/tmp/gsd-e2e" }
 *
 * `providerPickerPage` — page WITHOUT Tauri mock, landing on ProviderPickerScreen.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/auth";
 *   test("my test", async ({ authenticatedPage }) => { ... });
 */

import { test as base, expect, type Page } from "playwright/test";

// ---------------------------------------------------------------------------
// Tauri IPC mock init script
// ---------------------------------------------------------------------------

/**
 * Injected into page before any scripts run. Sets up window.__TAURI__ so that
 * isTauri() returns true, then provides a minimal __TAURI_INTERNALS__ stub that
 * handles the Tauri IPC commands used by Mission Control.
 */
const TAURI_MOCK_SCRIPT = `
  // Make isTauri() return true
  window.__TAURI__ = {};

  const MOCK_RESPONSES = {
    get_active_provider: "claude",
    check_and_refresh_token: { needs_reauth: false, refreshed: false, provider: "claude" },
    check_for_updates: null,
    install_update: null,
    get_provider_status: {
      active_provider: "claude",
      last_refreshed: new Date().toISOString(),
      expires_at: null,
      is_expired: false,
      expires_soon: false,
    },
    save_api_key: true,
    get_api_key: "sk-ant-test-key",
    store_credential: true,
    start_oauth: { auth_url: "https://auth.example.com/oauth", state: "test-state" },
    complete_oauth: true,
    reveal_path: null,
  };

  // Simple callback registry (mirrors what Tauri does internally)
  const _callbacks = {};
  let _cbId = 1;

  window.__TAURI_INTERNALS__ = {
    callbacks: _callbacks,

    transformCallback(fn, once = false) {
      const id = _cbId++;
      _callbacks[id] = once
        ? (...args) => { fn(...args); delete _callbacks[id]; }
        : fn;
      return id;
    },

    async invoke(cmd, args, _options) {
      const response = MOCK_RESPONSES[cmd];
      if (response !== undefined) return response;
      console.warn("[tauri-mock] Unhandled invoke:", cmd, args);
      return null;
    },

    metadata: {},
  };
`;

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/** Stubs the trust-status endpoint so the app skips TrustDialog. */
async function stubTrustStatus(page: Page) {
  await page.route("**/api/trust-status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trusted: true, gsdDir: "/tmp/gsd-e2e" }),
    })
  );
}

/** Stubs the settings endpoint with a minimal valid response. */
async function stubSettings(page: Page) {
  await page.route("**/api/settings", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          merged: {
            interface_mode: "developer",
            budget_ceiling: 20,
            model_profile: "balanced",
          },
          global: {},
          project: {},
        }),
      });
    }
    return route.continue();
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Fixtures = {
  /** Fully authenticated page — Tauri mocked, trust skipped, lands on dashboard. */
  authenticatedPage: Page;
  /** Provider picker page — no Tauri mock, shows ProviderPickerScreen. */
  providerPickerPage: Page;
  /** Builder mode page — same as authenticatedPage but settings return interface_mode="builder". */
  builderPage: Page;
};

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Inject Tauri mock before page loads
    await page.addInitScript(TAURI_MOCK_SCRIPT);

    // Stub HTTP routes
    await stubTrustStatus(page);
    await stubSettings(page);

    await page.goto("/");

    // Wait for auth+trust to resolve — app lands on onboarding, home, or dashboard
    await page.waitForSelector(
      "aside, [data-testid='project-home'], button:text('New Project'), button:text('Open Project')",
      { timeout: 20_000 }
    );

    // If app is on OnboardingScreen, click "New Project" to reach the dashboard
    const newProjectBtn = page.getByRole("button", { name: "New Project" });
    if (await newProjectBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // Stub workspace create so no real folder is created
      await page.route("**/api/workspace/create", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ projectPath: "/tmp/mc-test-project" }),
        })
      );
      await page.route("**/api/project/switch", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      );
      await newProjectBtn.click();
      // Fill project name input and create
      const nameInput = page.getByPlaceholder("Project name");
      await nameInput.waitFor({ timeout: 3_000 });
      await nameInput.fill("test-project");
      await page.getByRole("button", { name: "Create" }).click();
      await page.waitForSelector("aside", { timeout: 10_000 });
    }

    await use(page);
  },

  providerPickerPage: async ({ page }, use) => {
    // No Tauri mock → getActiveProvider() returns null → ProviderPickerScreen shown
    await page.goto("/");

    // Wait for the provider picker to render
    await page.waitForSelector("text=Claude Max", { timeout: 15_000 });

    await use(page);
  },

  builderPage: async ({ page }, use) => {
    await page.addInitScript(TAURI_MOCK_SCRIPT);
    await stubTrustStatus(page);

    // Return builder mode from settings
    await page.route("**/api/settings", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            merged: {
              interface_mode: "builder",
              budget_ceiling: 20,
              model_profile: "balanced",
            },
            global: {},
            project: {},
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/");
    await page.waitForSelector(
      "aside, button:text('New Project'), button:text('Open Project')",
      { timeout: 20_000 }
    );

    const newProjectBtn2 = page.getByRole("button", { name: "New Project" });
    if (await newProjectBtn2.isVisible({ timeout: 1_000 }).catch(() => false)) {
      // Stub workspace create so no real folder is created
      await page.route("**/api/workspace/create", (r) =>
        r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ projectPath: "/tmp/mc-test-project" }),
        })
      );
      await page.route("**/api/project/switch", (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      );
      await newProjectBtn2.click();
      // Fill project name input and create
      const nameInput2 = page.getByPlaceholder("Project name");
      await nameInput2.waitFor({ timeout: 3_000 });
      await nameInput2.fill("test-project");
      await page.getByRole("button", { name: "Create" }).click();
      await page.waitForSelector("aside", { timeout: 10_000 });
    }

    await use(page);
  },
});

export { expect };
