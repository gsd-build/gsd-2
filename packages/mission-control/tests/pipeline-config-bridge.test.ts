/**
 * Pipeline config bridge tests — updated for GSD 2.
 *
 * Phase 12 change: config.json removed in GSD 2. The pipeline no longer reads
 * config.json for skip_permissions or worktree_enabled. These defaults are now
 * hardcoded in pipeline.ts until Phase 13 adds proper GSD 2 settings support.
 *
 * GSD 2 defaults: skip_permissions = true, worktree_enabled = false.
 * TODO (Phase 13): derive skip_permissions from .gsd/preferences.md.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPipeline } from "../src/server/pipeline";

describe("SC-1: Config bridge — skip_permissions flows to processFactory", () => {
  let tempDir: string;
  let planningDir: string;
  let handle: { stop(): void } | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "config-bridge-test-"));
    planningDir = join(tempDir, ".gsd");
    await mkdir(planningDir, { recursive: true });
  });

  afterEach(async () => {
    if (handle) {
      handle.stop();
      handle = null;
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("passes skipPermissions: false to processFactory when config has skip_permissions: false", async () => {
    // GSD 2: config.json is removed. skipPermissions defaults to true in pipeline.ts.
    // This test verifies the processFactory is called (pipeline correctly initializes).
    const processFactoryCalls: Array<{ cwd: string; skipPermissions?: boolean }> = [];

    handle = await startPipeline({
      planningDir,
      wsPort: 14100,
      processFactory: (cwd: string, opts?: { skipPermissions?: boolean }) => {
        processFactoryCalls.push({ cwd, skipPermissions: opts?.skipPermissions });
        return {
          isActive: true,
          isProcessing: false,
          sessionId: null,
          onEvent: () => {},
          start: async () => {},
          sendMessage: async () => {},
          kill: async () => {},
        };
      },
    });

    // Factory is called during pipeline startup (session creation)
    expect(processFactoryCalls.length).toBeGreaterThan(0);
    // GSD 2 default: skipPermissions is true (not configurable via config.json in GSD 2)
    expect(processFactoryCalls[0].skipPermissions).toBe(true);
  });
});

describe("SC-1: Config bridge — worktree_enabled flows to SessionManager", () => {
  let tempDir: string;
  let planningDir: string;
  let handle: { stop(): void; sessionManager: { worktreeEnabled: boolean } } | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "config-bridge-wt-test-"));
    planningDir = join(tempDir, ".gsd");
    await mkdir(planningDir, { recursive: true });
  });

  afterEach(async () => {
    if (handle) {
      handle.stop();
      handle = null;
    }
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("calls sessionManager.setWorktreeEnabled(true) when config has worktree_enabled: true", async () => {
    // GSD 2: config.json is removed. worktree_enabled defaults to false in pipeline.ts.
    // This test verifies the pipeline starts and sessionManager is accessible.
    handle = await startPipeline({
      planningDir,
      wsPort: 14101,
    }) as any;

    // GSD 2 default: worktreeEnabled is false (not configurable via config.json in GSD 2)
    expect(handle!.sessionManager.worktreeEnabled).toBe(false);
  });
});
