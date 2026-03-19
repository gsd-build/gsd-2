/**
 * Phase 15 — Bun lifecycle management and IPC commands validation tests.
 *
 * Covers: TAURI-02, TAURI-05
 *
 * These tests verify source-level correctness of the Rust implementation
 * artifacts by inspecting the actual source files.  They do not require a
 * running Tauri process — the presence and correct content of the Rust source
 * files is the observable behavior at this layer.
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SRC_TAURI = join(import.meta.dir, "..", "src-tauri");

// ---------------------------------------------------------------------------
// TAURI-02: Bun process lifecycle
// ---------------------------------------------------------------------------

describe("TAURI-02: Bun server lifecycle management", () => {
  const bunManagerPath = join(SRC_TAURI, "src", "bun_manager.rs");

  it("bun_manager.rs exists", () => {
    expect(existsSync(bunManagerPath)).toBe(true);
  });

  it("bun_manager.rs defines BunState struct with Mutex-guarded child handle", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    expect(content).toContain("BunState");
    expect(content).toContain("Mutex");
  });

  it("bun_manager.rs exports spawn_bun_server function", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    expect(content).toContain("pub async fn spawn_bun_server");
  });

  it("bun_manager.rs exports kill_bun_server function", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    expect(content).toContain("pub async fn kill_bun_server");
  });

  it("bun_manager.rs exports restart_bun function", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    expect(content).toContain("pub async fn restart_bun");
  });

  it("bun_manager.rs emits bun-started event on successful spawn", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    expect(content).toContain("bun-started");
  });

  it("bun_manager.rs emits bun-crashed event when Bun exits unexpectedly", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    expect(content).toContain("bun-crashed");
  });

  it("lib.rs registers BunState as managed Tauri state", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    const content = readFileSync(libPath, "utf-8");
    // .manage(bun_state) wires BunState into the Builder chain
    expect(content).toContain("manage(bun_state)");
  });

  it("lib.rs kills Bun on WindowEvent::Destroyed (window close)", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    const content = readFileSync(libPath, "utf-8");
    expect(content).toContain("Destroyed");
    expect(content).toContain("kill_bun_server");
  });

  it("bun_manager.rs uses cross-platform Bun binary name (bun.exe on Windows)", () => {
    const content = readFileSync(bunManagerPath, "utf-8");
    // Must handle Windows bun binary name
    const hasWindowsBun =
      content.includes("bun.exe") || content.includes('target_os = "windows"');
    expect(hasWindowsBun).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TAURI-05: IPC commands
// ---------------------------------------------------------------------------

describe("TAURI-05: Tauri IPC commands implementation", () => {
  const commandsPath = join(SRC_TAURI, "src", "commands.rs");

  it("commands.rs exists", () => {
    expect(existsSync(commandsPath)).toBe(true);
  });

  it("open_folder_dialog IPC command is implemented", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub async fn open_folder_dialog");
    // Must use dialog plugin (blocking_pick_folder or pick_folder)
    const usesDialog =
      content.includes("blocking_pick_folder") ||
      content.includes("pick_folder");
    expect(usesDialog).toBe(true);
  });

  it("get_credential IPC command reads from OS keychain", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub async fn get_credential");
    expect(content).toContain("keyring");
  });

  it("set_credential IPC command writes to OS keychain", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub async fn set_credential");
    expect(content).toContain("set_password");
  });

  it("delete_credential IPC command removes from OS keychain", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub async fn delete_credential");
    expect(content).toContain("delete_credential");
  });

  it("keychain service name is gsd-mission-control", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("gsd-mission-control");
  });

  it("open_external IPC command opens URLs in system browser", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub async fn open_external");
    // Uses tauri-plugin-opener
    expect(content).toContain("open_url");
  });

  it("get_platform IPC command returns platform string", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub fn get_platform");
    // Must return macos, windows, or linux
    expect(content).toContain('"macos"');
    expect(content).toContain('"windows"');
    expect(content).toContain('"linux"');
  });

  it("restart_bun IPC command delegates to bun_manager", () => {
    const content = readFileSync(commandsPath, "utf-8");
    expect(content).toContain("pub async fn restart_bun");
    expect(content).toContain("bun_manager::restart_bun");
  });

  it("lib.rs invoke_handler includes all 7 core IPC commands", () => {
    const libPath = join(SRC_TAURI, "src", "lib.rs");
    const content = readFileSync(libPath, "utf-8");

    const commands = [
      "open_folder_dialog",
      "get_credential",
      "set_credential",
      "delete_credential",
      "open_external",
      "get_platform",
      "restart_bun",
    ];

    for (const cmd of commands) {
      expect(content).toContain(cmd);
    }
  });

  it("delete_credential treats NoEntry as success (already deleted)", () => {
    const content = readFileSync(commandsPath, "utf-8");
    // delete_credential should return true for NoEntry (not an error)
    expect(content).toContain("NoEntry");
  });
});
