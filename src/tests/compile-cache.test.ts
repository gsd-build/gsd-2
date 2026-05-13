import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { computeCompileCacheDir, compileCacheRoot, clearCompileCache } = await import(
  "../../dist/compile-cache.js"
);
const { shouldBypassManagedResourceMismatchGate } = await import(
  "../../dist/cli-policy.js"
);

describe("compile-cache", () => {
  it("scopes the cache dir by gsd-pi version", () => {
    const dir = "/tmp/agent";
    assert.equal(
      computeCompileCacheDir(dir, "2.80.0"),
      join(dir, ".compile-cache", "gsd-2.80.0"),
    );
    assert.notEqual(
      computeCompileCacheDir(dir, "2.80.0"),
      computeCompileCacheDir(dir, "2.81.0"),
    );
  });

  it("falls back to 'unknown' when version is empty", () => {
    const dir = "/tmp/agent";
    assert.equal(
      computeCompileCacheDir(dir, ""),
      join(dir, ".compile-cache", "gsd-unknown"),
    );
  });

  it("sanitizes hostile version strings so they cannot escape the cache root", () => {
    const dir = "/tmp/agent";
    const cacheRoot = join(dir, ".compile-cache");
    // Path-separator characters in the version must be neutralised so the
    // result stays a direct child of the cache root.
    const path = computeCompileCacheDir(dir, "../../etc/passwd");
    assert.ok(path.startsWith(cacheRoot + "/"));
    assert.equal(path.split("/").length, cacheRoot.split("/").length + 1);
    assert.ok(!path.includes("/etc/"));
  });

  it("compileCacheRoot returns the parent of all version subdirs", () => {
    const dir = "/tmp/agent";
    assert.equal(compileCacheRoot(dir), join(dir, ".compile-cache"));
  });

  it("clearCompileCache removes the cache directory when present", () => {
    const agentDir = mkdtempSync(join(tmpdir(), "gsd-cache-test-"));
    try {
      const cacheRoot = join(agentDir, ".compile-cache");
      mkdirSync(join(cacheRoot, "gsd-2.80.0"), { recursive: true });
      writeFileSync(join(cacheRoot, "gsd-2.80.0", "stale.bin"), "stale");
      const result = clearCompileCache(agentDir);
      assert.equal(result.existed, true);
      assert.equal(result.path, cacheRoot);
      assert.equal(existsSync(cacheRoot), false);
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("clearCompileCache reports existed=false when the cache was never created", () => {
    const agentDir = mkdtempSync(join(tmpdir(), "gsd-cache-test-"));
    try {
      const result = clearCompileCache(agentDir);
      assert.equal(result.existed, false);
      assert.equal(result.path, join(agentDir, ".compile-cache"));
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});

describe("cli-policy: managed-resource-mismatch bypass", () => {
  it("bypasses for `update`", () => {
    assert.equal(shouldBypassManagedResourceMismatchGate("update"), true);
  });

  it("bypasses for `cache` so operators can recover from a stale compile cache", () => {
    assert.equal(shouldBypassManagedResourceMismatchGate("cache"), true);
  });

  it("does not bypass for other subcommands", () => {
    assert.equal(shouldBypassManagedResourceMismatchGate("auto"), false);
    assert.equal(shouldBypassManagedResourceMismatchGate(undefined), false);
  });
});
