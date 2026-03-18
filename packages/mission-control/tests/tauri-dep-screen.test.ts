/**
 * Phase 15 — Dependency screen and dep check validation tests.
 *
 * Covers: TAURI-03
 *
 * Verifies that:
 * - dep_screen.html exists and contains the required install instructions
 * - The Retry button uses window.__TAURI__.invoke (no CDN import)
 * - dep_check.rs uses platform-aware which/where for CLI detection
 * - dep_screen.html is listed as a bundle resource in tauri.conf.json
 * - dep_check.rs navigates to dep_screen.html when deps are missing
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SRC_TAURI = join(import.meta.dir, "..", "src-tauri");

// ---------------------------------------------------------------------------
// TAURI-03: dep_screen.html content
// ---------------------------------------------------------------------------

describe("TAURI-03: dep_screen.html install instructions and retry UX", () => {
  const depScreenPath = join(SRC_TAURI, "dep_screen.html");

  it("dep_screen.html file exists in src-tauri/", () => {
    expect(existsSync(depScreenPath)).toBe(true);
  });

  it("dep_screen.html contains Bun install link (bun.sh)", () => {
    const content = readFileSync(depScreenPath, "utf-8");
    // Must have an install link for Bun
    expect(content).toContain("bun.sh");
  });

  it("dep_screen.html contains GSD CLI install link", () => {
    const content = readFileSync(depScreenPath, "utf-8");
    // Must reference gsd (or GSD) install instructions
    expect(content.toLowerCase()).toContain("gsd");
  });

  it("dep_screen.html has a Retry / Check Again button", () => {
    const content = readFileSync(depScreenPath, "utf-8");
    // Any form of retry/check-again UI element
    const hasRetry =
      content.includes("retry") ||
      content.includes("Retry") ||
      content.includes("Check Again") ||
      content.includes("check again");
    expect(hasRetry).toBe(true);
  });

  it("dep_screen.html uses window.__TAURI__.invoke (no CDN import needed)", () => {
    const content = readFileSync(depScreenPath, "utf-8");
    // Must use the Tauri-injected global, not a CDN import
    expect(content).toContain("__TAURI__");
    // Must NOT import from tauri CDN
    expect(content).not.toContain("cdn.jsdelivr.net/npm/@tauri-apps");
  });

  it("dep_screen.html renders missing/present status per dep via query params", () => {
    const content = readFileSync(depScreenPath, "utf-8");
    // URL param parsing for 'missing' param
    expect(content).toContain("missing");
  });
});

// ---------------------------------------------------------------------------
// TAURI-03: dep_check.rs logic — platform-aware and asset URL navigation
// ---------------------------------------------------------------------------

describe("TAURI-03: dep_check.rs platform-aware dependency detection", () => {
  const depCheckPath = join(SRC_TAURI, "src", "dep_check.rs");

  it("dep_check.rs exists", () => {
    expect(existsSync(depCheckPath)).toBe(true);
  });

  it("dep_check.rs uses 'where' on Windows for CLI detection", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain('"where"');
  });

  it("dep_check.rs uses 'which' on non-Windows for CLI detection", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain('"which"');
  });

  it("dep_check.rs checks for bun dependency", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain('"bun"');
  });

  it("dep_check.rs checks for gsd dependency", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain('"gsd"');
  });

  it("dep_check.rs navigates to dep_screen.html when dependencies are missing", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain("dep_screen.html");
  });

  it("dep_check.rs emits dep-check-passed event when all deps are present", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain("dep-check-passed");
  });

  it("dep_check.rs emits dep-check-failed event when deps are missing", () => {
    const content = readFileSync(depCheckPath, "utf-8");
    expect(content).toContain("dep-check-failed");
  });
});

// ---------------------------------------------------------------------------
// TAURI-03: tauri.conf.json bundles dep_screen.html as a resource
// ---------------------------------------------------------------------------

describe("TAURI-03: dep_screen.html bundled as Tauri resource", () => {
  it("tauri.conf.json lists dep_screen.html in bundle.resources", () => {
    const confPath = join(SRC_TAURI, "tauri.conf.json");
    const conf = JSON.parse(readFileSync(confPath, "utf-8"));
    const resources: string[] = conf.bundle?.resources ?? [];
    const hasDepScreen = resources.some((r) => r.includes("dep_screen.html"));
    expect(hasDepScreen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TAURI-03: retry_dep_check IPC command wired
// ---------------------------------------------------------------------------

describe("TAURI-03: retry_dep_check IPC command registered", () => {
  it("commands.rs has retry_dep_check function", () => {
    const commandsPath = join(SRC_TAURI, "src", "commands.rs");
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("retry_dep_check");
  });

  it("lib.rs invoke_handler includes retry_dep_check", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    const content = readFileSync(libPath, "utf-8");
    expect(content).toContain("retry_dep_check");
  });
});
