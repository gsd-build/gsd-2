import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bunManagerRs = readFileSync(
  resolve(import.meta.dir, "../src-tauri/src/bun_manager.rs"),
  "utf-8"
);

const cargoToml = readFileSync(
  resolve(import.meta.dir, "../src-tauri/Cargo.toml"),
  "utf-8"
);

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../package.json"), "utf-8")
);

describe("B5: tokio::time::sleep replaces std::thread::sleep", () => {
  it("does NOT contain std::thread::sleep in bun_manager.rs", () => {
    expect(bunManagerRs).not.toContain("std::thread::sleep");
  });

  it("uses tokio::time::sleep in watch_bun_process (2 second interval)", () => {
    expect(bunManagerRs).toContain("tokio::time::sleep(std::time::Duration::from_secs(2)).await");
  });

  it("uses tokio::time::sleep in restart_bun (500ms delay)", () => {
    expect(bunManagerRs).toContain("tokio::time::sleep(std::time::Duration::from_millis(500)).await");
  });

  it("Cargo.toml includes tokio time feature", () => {
    expect(cargoToml).toContain('"time"');
    // Verify it's on the tokio line
    const tokioLine = cargoToml.split("\n").find((l: string) => l.includes("tokio"));
    expect(tokioLine).toContain('"time"');
    expect(tokioLine).toContain('"rt"');
  });
});

describe("S2: production start script", () => {
  it("package.json has a start script", () => {
    expect(packageJson.scripts.start).toBeDefined();
  });

  it("start script runs src/server.ts without --hot", () => {
    expect(packageJson.scripts.start).toContain("src/server.ts");
    expect(packageJson.scripts.start).not.toContain("--hot");
  });

  it("bun_manager.rs spawns start not dev", () => {
    // The .arg("start") should be present, .arg("dev") should NOT be present
    // Note: "dev" appears in beforeDevCommand context, so check specifically for .arg("dev")
    expect(bunManagerRs).toContain('.arg("start")');
    expect(bunManagerRs).not.toContain('.arg("dev")');
  });
});
