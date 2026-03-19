/**
 * COMPAT-06: Migration banner — needsMigration flag in buildFullState
 *
 * RED state: These tests fail until Plan 12-04 adds needsMigration to buildFullState.
 * Currently buildFullState returns PlanningState which has no needsMigration field.
 * After COMPAT-06 it returns GSD2State with needsMigration: boolean.
 *
 * Logic:
 *   - needsMigration: true  when .planning/ exists but .gsd/ does NOT
 *   - needsMigration: false when .gsd/ exists (regardless of .planning/)
 *   - needsMigration: false when neither exists
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFullState } from "../src/server/state-deriver";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "migration-banner-test-"));
});

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("COMPAT-06: needsMigration flag", () => {
  it("returns needsMigration: true when .planning/ exists but .gsd/ does not", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true });
    // Do NOT create .gsd/

    // Currently fails: buildFullState does not accept a gsdDir parameter
    // and GSD2State type does not exist yet — the return value has no needsMigration field
    const gsdDir = join(tmpDir, ".gsd");
    const state = await buildFullState(gsdDir) as any;

    expect(state.needsMigration).toBe(true);
  });

  it("returns needsMigration: false when .gsd/ exists (regardless of .planning/)", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true });
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });

    const gsdDir = join(tmpDir, ".gsd");
    const state = await buildFullState(gsdDir) as any;

    expect(state.needsMigration).toBe(false);
  });

  it("returns needsMigration: false when neither directory exists", async () => {
    // tmpDir is empty — no .planning/, no .gsd/
    const gsdDir = join(tmpDir, ".gsd");
    const state = await buildFullState(gsdDir) as any;

    expect(state.needsMigration).toBe(false);
  });

  it("buildFullState accepts a .gsd/ path as its argument (COMPAT-01 regression guard)", async () => {
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });

    // The gsdDir argument to buildFullState must be the .gsd/ directory path.
    // This test documents the expected calling convention.
    const gsdDir = join(tmpDir, ".gsd");

    // Should not throw — current v1 code may silently return empty state
    // but must not crash on a non-.planning/ path
    await expect(buildFullState(gsdDir)).resolves.toBeDefined();
  });
});
