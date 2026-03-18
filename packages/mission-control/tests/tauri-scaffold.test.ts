/**
 * Phase 15 — Tauri Shell scaffold validation tests.
 *
 * Covers: TAURI-01, TAURI-04, TAURI-06
 *
 * These tests verify the presence and correct content of key Tauri
 * configuration artifacts without requiring a running Rust binary or Tauri
 * process.  All assertions read static files on disk.
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// REPO_ROOT = monorepo root; SRC_TAURI = packages/mission-control/src-tauri
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SRC_TAURI = join(import.meta.dir, "..", "src-tauri");

// ---------------------------------------------------------------------------
// TAURI-01: Scaffold existence and config correctness
// ---------------------------------------------------------------------------

describe("TAURI-01: src-tauri scaffold exists", () => {
  it("src-tauri/ directory is present at repo root", () => {
    expect(existsSync(SRC_TAURI)).toBe(true);
  });

  it("Cargo.toml exists with tauri-plugin-window-state dependency", () => {
    const cargoPath = join(SRC_TAURI, "Cargo.toml");
    expect(existsSync(cargoPath)).toBe(true);
    const content = readFileSync(cargoPath, "utf-8");
    expect(content).toContain("tauri-plugin-window-state");
  });

  it("tauri.conf.json has correct product name", () => {
    const confPath = join(SRC_TAURI, "tauri.conf.json");
    expect(existsSync(confPath)).toBe(true);
    const conf = JSON.parse(readFileSync(confPath, "utf-8"));
    expect(conf.productName).toBe("GSD Mission Control");
  });

  it("tauri.conf.json has correct identifier", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    expect(conf.identifier).toBe("com.mzansiagentive.gsd-mission-control");
  });

  it("tauri.conf.json has devUrl pointing to localhost:4000", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    expect(conf.build?.devUrl).toBe("http://localhost:4000");
  });

  it("tauri.conf.json CSP allows WebSocket on ws://localhost:*", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const csp: string = conf.app?.security?.csp ?? "";
    expect(csp).toContain("ws://localhost:*");
  });

  it("main.rs exists and delegates to app_lib::run()", () => {
    const mainPath = join(SRC_TAURI, "src", "main.rs");
    expect(existsSync(mainPath)).toBe(true);
    const content = readFileSync(mainPath, "utf-8");
    expect(content).toContain("app_lib::run()");
  });

  it("lib.rs handles gsd:// deep-link protocol via tauri-plugin-deep-link", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    expect(existsSync(libPath)).toBe(true);
    const content = readFileSync(libPath, "utf-8");
    // tauri-plugin-deep-link registers the scheme; lib.rs handles callback URLs
    expect(content).toContain("gsd://");
  });
});

// ---------------------------------------------------------------------------
// TAURI-04: Window state — dimensions and plugin wiring
// ---------------------------------------------------------------------------

describe("TAURI-04: window dimensions and window-state plugin", () => {
  it("tauri.conf.json window width is 1280", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const win = conf.app?.windows?.[0];
    expect(win?.width).toBe(1280);
  });

  it("tauri.conf.json window height is 800", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const win = conf.app?.windows?.[0];
    expect(win?.height).toBe(800);
  });

  it("tauri.conf.json minimum window width is 1024", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const win = conf.app?.windows?.[0];
    expect(win?.minWidth).toBe(1024);
  });

  it("tauri.conf.json minimum window height is 640", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const win = conf.app?.windows?.[0];
    expect(win?.minHeight).toBe(640);
  });

  it("tauri.conf.json window has decorations (native title bar)", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const win = conf.app?.windows?.[0];
    // decorations: true means native OS title bar (frameless: false equivalent)
    expect(win?.decorations).not.toBe(false);
  });

  it("lib.rs registers WindowStateBuilder plugin for window state restore", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    const content = readFileSync(libPath, "utf-8");
    expect(content).toContain("WindowStateBuilder");
  });

  it("lib.rs uses StateFlags::all() for full window state persistence", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    const content = readFileSync(libPath, "utf-8");
    expect(content).toContain("StateFlags::all()");
  });
});

// ---------------------------------------------------------------------------
// TAURI-06: Build pipeline scripts
// ---------------------------------------------------------------------------

describe("TAURI-06: tauri:dev and tauri:build scripts in package.json", () => {
  it("root package.json has tauri:dev script", () => {
    const pkgPath = join(REPO_ROOT, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.scripts?.["tauri:dev"]).toBeDefined();
    expect(pkg.scripts?.["tauri:dev"]).toContain("tauri");
  });

  it("root package.json has tauri:build script", () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf-8")
    );
    expect(pkg.scripts?.["tauri:build"]).toBeDefined();
    expect(pkg.scripts?.["tauri:build"]).toContain("tauri");
  });

  it("tauri.conf.json has beforeDevCommand that starts Bun", () => {
    const conf = JSON.parse(
      readFileSync(join(SRC_TAURI, "tauri.conf.json"), "utf-8")
    );
    const beforeDev: string = conf.build?.beforeDevCommand ?? "";
    expect(beforeDev).toContain("bun");
    // beforeDevCommand runs relative to tauri.conf.json location (packages/mission-control)
  });

  it("packages/mission-control/package.json has build script for Bun bundle", () => {
    const mcPkgPath = join(REPO_ROOT, "packages", "mission-control", "package.json");
    expect(existsSync(mcPkgPath)).toBe(true);
    const mcPkg = JSON.parse(readFileSync(mcPkgPath, "utf-8"));
    expect(mcPkg.scripts?.["build"]).toBeDefined();
  });
});
