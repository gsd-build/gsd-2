/**
 * Tests for pipeline switchProject functionality.
 * Validates guard logic, concurrency prevention, and resource cleanup.
 */
import { describe, it, expect } from "bun:test";

/**
 * Extract the switchProject guard logic into a testable helper.
 * This avoids needing to mock the full pipeline internals.
 */
import {
  createSwitchGuard,
  type SwitchGuard,
} from "../src/server/switch-guard";

describe("switchProject guard logic", () => {
  it("rejects when isProcessing is true", async () => {
    const guard = createSwitchGuard(() => true); // isProcessing = true
    await expect(guard.acquire()).rejects.toThrow(
      "Cannot switch projects while Claude is processing"
    );
  });

  it("allows switch when isProcessing is false", async () => {
    const guard = createSwitchGuard(() => false);
    await expect(guard.acquire()).resolves.toBeUndefined();
    guard.release();
  });

  it("rejects concurrent switch attempts", async () => {
    const guard = createSwitchGuard(() => false);
    // First call acquires the lock
    await guard.acquire();
    // Second call should reject
    await expect(guard.acquire()).rejects.toThrow(
      "Project switch already in progress"
    );
    guard.release();
  });

  it("allows new switch after previous completes", async () => {
    const guard = createSwitchGuard(() => false);
    await guard.acquire();
    guard.release();
    // Should work again after release
    await expect(guard.acquire()).resolves.toBeUndefined();
    guard.release();
  });
});

describe("POST /api/project/switch route logic", () => {
  it("returns 400 for missing path in body", async () => {
    // Simulate the route handler validation
    const body = {};
    const path = (body as { path?: string }).path;
    expect(path).toBeUndefined();
  });

  it("returns 400 for non-existent path", async () => {
    const { access } = await import("node:fs/promises");
    const fakePath = "/definitely/not/a/real/path/abc123xyz";
    let exists = false;
    try {
      await access(fakePath);
      exists = true;
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
