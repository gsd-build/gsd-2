/**
 * Unit tests for GSD Directory Validation — safeguards against dangerous directories.
 *
 * Exercises validateDirectory() and assertSafeDirectory() with:
 * - Blocked system paths (/, /usr, /etc, $HOME)
 * - Temp directory root
 * - Normal project directories (should pass)
 * - Directories with many entries (warning heuristic)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { validateDirectory, assertSafeDirectory } from "../validate-directory.ts";

function makeTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `gsd-validate-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Blocked system paths ────────────────────────────────────────────────────────

test("validateDirectory: root filesystem is blocked", () => {
  const result = validateDirectory("/");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
  assert.ok(result.reason?.includes("system directory"));
});

test("validateDirectory: /usr is blocked", () => {
  const result = validateDirectory("/usr");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});

test("validateDirectory: /etc is blocked", () => {
  const result = validateDirectory("/etc");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});

test("validateDirectory: /var is blocked", () => {
  const result = validateDirectory("/var");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});

test("validateDirectory: /usr/local/bin is blocked", () => {
  const result = validateDirectory("/usr/local/bin");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});

// ─── Home directory ──────────────────────────────────────────────────────────────

test("validateDirectory: home directory itself is blocked", () => {
  const result = validateDirectory(homedir());
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
  assert.ok(result.reason?.includes("home directory"));
});

test("validateDirectory: home directory with trailing slash is blocked", () => {
  const result = validateDirectory(homedir() + "/");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});

test("validateDirectory: subdirectory of home is NOT blocked", () => {
  const dir = makeTempDir("home-subdir");
  try {
    // Simulate a subdirectory of home (use temp dir which IS a subdir)
    const result = validateDirectory(dir);
    // Should be ok (not blocked, and too few entries for warning)
    assert.equal(result.severity, "ok");
    assert.equal(result.safe, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Temp directory root ─────────────────────────────────────────────────────────

test("validateDirectory: temp directory root is blocked", () => {
  const result = validateDirectory(tmpdir());
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
  assert.ok(result.reason?.includes("temp directory"));
});

// ─── Normal project directories ──────────────────────────────────────────────────

test("validateDirectory: normal project directory is safe", () => {
  const dir = makeTempDir("normal-project");
  try {
    writeFileSync(join(dir, "package.json"), "{}");
    mkdirSync(join(dir, "src"));
    const result = validateDirectory(dir);
    assert.equal(result.safe, true);
    assert.equal(result.severity, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateDirectory: empty directory is safe", () => {
  const dir = makeTempDir("empty");
  try {
    const result = validateDirectory(dir);
    assert.equal(result.safe, true);
    assert.equal(result.severity, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── High entry count heuristic ──────────────────────────────────────────────────

test("validateDirectory: directory with >200 entries triggers warning", () => {
  const dir = makeTempDir("many-entries");
  try {
    for (let i = 0; i < 210; i++) {
      writeFileSync(join(dir, `file-${i.toString().padStart(4, "0")}.txt`), "");
    }
    const result = validateDirectory(dir);
    assert.equal(result.safe, false);
    assert.equal(result.severity, "warning");
    assert.ok(result.reason?.includes("210 entries"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateDirectory: directory with exactly 200 entries is safe", () => {
  const dir = makeTempDir("boundary-entries");
  try {
    for (let i = 0; i < 200; i++) {
      writeFileSync(join(dir, `file-${i.toString().padStart(4, "0")}.txt`), "");
    }
    const result = validateDirectory(dir);
    assert.equal(result.safe, true);
    assert.equal(result.severity, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── assertSafeDirectory ─────────────────────────────────────────────────────────

test("assertSafeDirectory: throws for blocked directories", () => {
  assert.throws(
    () => assertSafeDirectory("/"),
    (err: Error) => err.message.includes("system directory"),
  );
});

test("assertSafeDirectory: throws for home directory", () => {
  assert.throws(
    () => assertSafeDirectory(homedir()),
    (err: Error) => err.message.includes("home directory"),
  );
});

test("assertSafeDirectory: returns result for warnings (does not throw)", () => {
  const dir = makeTempDir("assert-warning");
  try {
    for (let i = 0; i < 210; i++) {
      writeFileSync(join(dir, `file-${i.toString().padStart(4, "0")}.txt`), "");
    }
    const result = assertSafeDirectory(dir);
    assert.equal(result.severity, "warning");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertSafeDirectory: returns ok for safe directories", () => {
  const dir = makeTempDir("assert-safe");
  try {
    const result = assertSafeDirectory(dir);
    assert.equal(result.severity, "ok");
    assert.equal(result.safe, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Trailing slash normalization ────────────────────────────────────────────────

test("validateDirectory: handles paths with trailing slashes", () => {
  const result = validateDirectory("/usr/");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});

test("validateDirectory: handles paths with multiple trailing slashes", () => {
  const result = validateDirectory("/etc///");
  assert.equal(result.safe, false);
  assert.equal(result.severity, "blocked");
});
