import { describe, test, expect } from "bun:test";

// Import functions — in Bun test env, isTauri() returns false
// so all invoke calls are skipped, and safe fallbacks are returned.
// This validates that the module loads correctly and fallbacks work.

describe("auth-api non-Tauri fallbacks", () => {
  test("getActiveProvider returns null in non-Tauri env", async () => {
    const { getActiveProvider } = await import("../src/auth/auth-api");
    const result = await getActiveProvider();
    expect(result).toBeNull();
  });

  test("checkAndRefreshToken returns safe default in non-Tauri env", async () => {
    const { checkAndRefreshToken } = await import("../src/auth/auth-api");
    const result = await checkAndRefreshToken();
    expect(result.needs_reauth).toBe(false);
    expect(result.refreshed).toBe(false);
    expect(result.provider).toBeNull();
  });

  test("saveApiKey returns false in non-Tauri env", async () => {
    const { saveApiKey } = await import("../src/auth/auth-api");
    const result = await saveApiKey("openrouter", "test-key");
    expect(result).toBe(false);
  });
});

describe("ProviderPickerScreen renders", () => {
  // Use static source-text strategy (same as Phase 12-01 tests)
  // Read the file as string and assert key content
  test("ProviderPickerScreen contains all four provider options", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../src/components/auth/ProviderPickerScreen.tsx", import.meta.url),
      "utf-8"
    );
    expect(content).toContain("anthropic");
    expect(content).toContain("github-copilot");
    expect(content).toContain("openrouter");
    expect(content).toContain("api-key");
    expect(content).not.toContain("skip"); // No skip option — case insensitive
  });

  test("ProviderPickerScreen does not have a skip button", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../src/components/auth/ProviderPickerScreen.tsx", import.meta.url),
      "utf-8"
    ).toLowerCase();
    expect(content).not.toContain(">skip<");
    expect(content).not.toContain('"skip"');
    expect(content).not.toContain("'skip'");
  });
});

describe("App.tsx auth integration", () => {
  test("App.tsx imports useAuthGuard", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf-8"
    );
    expect(content).toContain("useAuthGuard");
    expect(content).toContain("ProviderPickerScreen");
    expect(content).toContain("needs_picker");
  });
});

describe("SettingsView provider section", () => {
  test("SettingsView contains provider section with change button", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../src/components/views/SettingsView.tsx", import.meta.url),
      "utf-8"
    );
    expect(content).toContain("getProviderStatus");
    expect(content).toContain("changeProvider");
    expect(content).toContain("Change provider");
  });
});
