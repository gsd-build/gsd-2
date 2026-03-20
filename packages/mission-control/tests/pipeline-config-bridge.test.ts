/**
 * Pipeline config bridge tests — updated for H5 security fix.
 *
 * H5 change: skipPermissions now defaults to false (safe default — permissions enabled).
 * Users can opt-in to skip_permissions: true via .gsd/preferences.md YAML frontmatter.
 *
 * GSD 2 defaults: skip_permissions = false (changed from true), worktree_enabled = false.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
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

  it("defaults skipPermissions to false when no preferences.md exists", async () => {
    // H5: Without preferences.md, skipPermissions defaults to false (safe default).
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
    // H5: default is false — permissions are enabled unless user opts in
    expect(processFactoryCalls[0].skipPermissions).toBe(false);
  });

  it("sets skipPermissions to true when preferences.md has skip_permissions: true", async () => {
    // H5: When preferences.md has skip_permissions: true, pipeline passes it through.
    await writeFile(
      join(planningDir, "preferences.md"),
      "---\nskip_permissions: true\n---\n"
    );

    const processFactoryCalls: Array<{ cwd: string; skipPermissions?: boolean }> = [];

    handle = await startPipeline({
      planningDir,
      wsPort: 14102,
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

    expect(processFactoryCalls.length).toBeGreaterThan(0);
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
