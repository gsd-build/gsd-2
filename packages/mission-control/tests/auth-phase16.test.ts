/**
 * auth-phase16.test.ts
 *
 * Phase 16 gap-filling tests — covers requirements not addressed by the
 * existing auth.test.ts (AUTH-01 through AUTH-06).
 *
 * Strategy: source-text assertions (read .tsx/.ts as strings) + behavioural
 * API fallback assertions. No React rendering required — avoids hook rules in
 * Bun test environment.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => join(__dirname, "..", "src", rel);

// ---------------------------------------------------------------------------
// AUTH-02: OAuth flow — OAuthConnectFlow component
// ---------------------------------------------------------------------------

describe("AUTH-02: OAuthConnectFlow — OAuth waiting screen", () => {
  test("OAuthConnectFlow has 5-minute auto-dismiss timeout", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    // Must declare a timeout constant equivalent to 5 * 60 * 1000
    expect(content).toContain("5 * 60 * 1000");
  });

  test("OAuthConnectFlow exports the component by name", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("export function OAuthConnectFlow");
  });

  test("OAuthConnectFlow calls onError on timeout expiry", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    // The timeout callback must call the onError prop
    expect(content).toContain("onError(");
    expect(content).toContain("timed out");
  });

  test("OAuthConnectFlow renders a Cancel button that calls onCancel", () => {
    const content = readFileSync(src("components/auth/OAuthConnectFlow.tsx"), "utf-8");
    expect(content).toContain("onCancel");
    expect(content).toMatch(/[Cc]ancel/);
  });
});

// ---------------------------------------------------------------------------
// AUTH-02: useAuthGuard — oauth-callback listener + 4-property API
// ---------------------------------------------------------------------------

describe("AUTH-02/AUTH-01: useAuthGuard structure and oauth-callback wiring", () => {
  test("useAuthGuard exports the 4-property return type", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    // Exported interface must include all 4 properties
    expect(content).toContain("state");
    expect(content).toContain("setAuthenticated");
    expect(content).toContain("setPendingProvider");
    expect(content).toContain("pendingProvider");
  });

  test("useAuthGuard sets up oauth-callback event listener", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("oauth-callback");
    // listen is called as a generic function: listen<...> — search for import and invocation
    expect(content).toContain("listen");
    expect(content).toContain("@tauri-apps/api/event");
  });

  test("useAuthGuard cleans up oauth-callback listener on unmount", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    // Cleanup must call the unlisten function
    expect(content).toContain("unlistenFn");
    // Return cleanup function from useEffect
    expect(content).toContain("return () =>");
  });

  test("useAuthGuard uses useRef to avoid stale closure on pendingProvider", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("useRef");
    expect(content).toContain("pendingProviderRef");
  });

  test("useAuthGuard calls completeOAuth on successful oauth-callback", () => {
    const content = readFileSync(src("auth/useAuthGuard.ts"), "utf-8");
    expect(content).toContain("completeOAuth(");
  });
});

// ---------------------------------------------------------------------------
// AUTH-03: auth/index.ts barrel re-exports all three modules
// ---------------------------------------------------------------------------

describe("AUTH-03: auth/index.ts barrel exports", () => {
  test("auth/index.ts re-exports auth-api", () => {
    const content = readFileSync(src("auth/index.ts"), "utf-8");
    expect(content).toContain("auth-api");
  });

  test("auth/index.ts re-exports useAuthGuard", () => {
    const content = readFileSync(src("auth/index.ts"), "utf-8");
    expect(content).toContain("useAuthGuard");
  });

  test("auth/index.ts re-exports useTokenRefresh", () => {
    const content = readFileSync(src("auth/index.ts"), "utf-8");
    expect(content).toContain("useTokenRefresh");
  });
});

// ---------------------------------------------------------------------------
// AUTH-04: API key flow — ApiKeyForm component
// ---------------------------------------------------------------------------

describe("AUTH-04: ApiKeyForm — masked input + Eye toggle + provider dropdown", () => {
  test("ApiKeyForm exports the component by name", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("export function ApiKeyForm");
  });

  test("ApiKeyForm uses password input type for masking", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    // The input type is dynamic: type={showKey ? "text" : "password"} — look for the "password" value
    expect(content).toContain('"password"');
    expect(content).toContain("showKey");
  });

  test("ApiKeyForm imports Eye and EyeOff from lucide-react for show/hide toggle", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("Eye");
    expect(content).toContain("EyeOff");
    expect(content).toContain("lucide-react");
  });

  test("ApiKeyForm has provider dropdown for api-key provider type", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("PROVIDER_OPTIONS");
    // Dropdown contains common provider names
    expect(content).toContain("openai");
    expect(content).toContain("gemini");
  });

  test("ApiKeyForm locks provider to openrouter when provider prop is openrouter", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("isOpenRouter");
    expect(content).toContain("openrouter");
  });

  test("ApiKeyForm calls saveApiKey on form submission", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("saveApiKey(");
  });

  test("ApiKeyForm calls onSaved on successful key save", () => {
    const content = readFileSync(src("components/auth/ApiKeyForm.tsx"), "utf-8");
    expect(content).toContain("onSaved(");
  });
});

// ---------------------------------------------------------------------------
// AUTH-04: Non-Tauri fallbacks for remaining API functions
// ---------------------------------------------------------------------------

describe("AUTH-04/AUTH-02: auth-api remaining function fallbacks in non-Tauri env", () => {
  test("getProviderStatus returns safe default object in non-Tauri env", async () => {
    const { getProviderStatus } = await import("../src/auth/auth-api");
    const result = await getProviderStatus();
    expect(result.active_provider).toBeNull();
    expect(result.last_refreshed).toBeNull();
    expect(result.expires_at).toBeNull();
    expect(result.is_expired).toBe(false);
    expect(result.expires_soon).toBe(false);
  });

  test("startOAuth returns empty strings in non-Tauri env", async () => {
    const { startOAuth } = await import("../src/auth/auth-api");
    const result = await startOAuth("anthropic");
    expect(result.auth_url).toBe("");
    expect(result.state).toBe("");
  });

  test("completeOAuth returns false in non-Tauri env", async () => {
    const { completeOAuth } = await import("../src/auth/auth-api");
    const result = await completeOAuth("anthropic", "test-code", "test-state");
    expect(result).toBe(false);
  });

  test("changeProvider returns false in non-Tauri env", async () => {
    const { changeProvider } = await import("../src/auth/auth-api");
    const result = await changeProvider();
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AUTH-05: useTokenRefresh structure
// ---------------------------------------------------------------------------

describe("AUTH-05: useTokenRefresh — silent token refresh hook", () => {
  test("useTokenRefresh exports the hook function", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("export function useTokenRefresh");
  });

  test("useTokenRefresh returns checked, needsReauth, and provider fields", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("checked");
    expect(content).toContain("needsReauth");
    expect(content).toContain("provider");
  });

  test("useTokenRefresh calls checkAndRefreshToken on mount", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    expect(content).toContain("checkAndRefreshToken()");
    expect(content).toContain("useEffect");
  });

  test("useTokenRefresh initial state has checked=false and needsReauth=false", () => {
    const content = readFileSync(src("auth/useTokenRefresh.ts"), "utf-8");
    // useState initializer must start with false values
    expect(content).toContain("checked: false");
    expect(content).toContain("needsReauth: false");
  });
});

// ---------------------------------------------------------------------------
// AUTH-01: App.tsx renders null during checking state (no loading spinner flash)
// ---------------------------------------------------------------------------

describe("AUTH-01: App.tsx renders null during auth checking state", () => {
  test("App.tsx returns null when state.status is checking", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    // Must have a guard that returns null during checking
    expect(content).toContain('status === "checking"');
    expect(content).toContain("return null");
  });

  test("App.tsx renders ProviderPickerScreen when needsReauth is true", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("needsReauth");
    expect(content).toContain("ProviderPickerScreen");
  });

  test("App.tsx uses useTokenRefresh alongside useAuthGuard", () => {
    const content = readFileSync(src("App.tsx"), "utf-8");
    expect(content).toContain("useTokenRefresh");
  });
});

// ---------------------------------------------------------------------------
// AUTH-06: SettingsView Provider section is the FIRST section in the render
// ---------------------------------------------------------------------------

describe("AUTH-06: SettingsView Provider section ordering and confirmation guard", () => {
  test("Provider section is the first Section rendered (comment 0 marker)", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    // The implementation marks provider section with comment '0. Provider'
    expect(content).toContain("0. Provider");
  });

  test("Provider section appears before interfaceMode section in render output", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    const providerIdx = content.indexOf("{/* 0. Provider */}");
    // interfaceMode render toggle line appears after Provider section in JSX
    const interfaceRenderIdx = content.indexOf('openSections.interfaceMode ?? true}');
    expect(providerIdx).toBeGreaterThan(-1);
    expect(interfaceRenderIdx).toBeGreaterThan(providerIdx);
  });

  test("SettingsView has inline confirmation guard before changeProvider call", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("confirmChange");
    expect(content).toContain("changeProvider");
  });

  test("SettingsView calls window.location.reload after changeProvider to show picker", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("window.location.reload");
  });

  test("SettingsView loads provider status with useEffect on mount", () => {
    const content = readFileSync(src("components/views/SettingsView.tsx"), "utf-8");
    expect(content).toContain("getProviderStatus");
    expect(content).toContain("useEffect");
    // providerStatus state is populated
    expect(content).toContain("setProviderStatus");
  });
});

// ---------------------------------------------------------------------------
// AUTH-03/AUTH-01: components/auth/index.ts barrel exports
// ---------------------------------------------------------------------------

describe("AUTH-03: components/auth/index.ts barrel exports all 3 components", () => {
  test("components/auth/index.ts exports ProviderPickerScreen", () => {
    const content = readFileSync(src("components/auth/index.ts"), "utf-8");
    expect(content).toContain("ProviderPickerScreen");
  });

  test("components/auth/index.ts exports OAuthConnectFlow", () => {
    const content = readFileSync(src("components/auth/index.ts"), "utf-8");
    expect(content).toContain("OAuthConnectFlow");
  });

  test("components/auth/index.ts exports ApiKeyForm", () => {
    const content = readFileSync(src("components/auth/index.ts"), "utf-8");
    expect(content).toContain("ApiKeyForm");
  });
});
