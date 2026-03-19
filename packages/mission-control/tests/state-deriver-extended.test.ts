/**
 * Extended state deriver tests — updated for GSD 2 schema.
 *
 * v1 tests for branch detection and completedPlans have been migrated
 * to state-deriver.test.ts GSD2 fixture suite.
 * The v1 .planning/phases/ directory traversal is removed from buildFullState()
 * as part of Phase 12 GSD 2 compatibility pass.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState } from "../src/server/state-deriver";

let tempDir: string;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "state-deriver-ext-"));
}

afterEach(() => {
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

const GSD2_STATE_MD = `---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-12T10:00:00Z"
last_activity: "2026-03-12 — completed S01-T01"
---

# Project State
`;

describe("buildFullState — GSD2State shape", () => {
  test("returns a GSD2State with projectState field (replaces v1 state.state)", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);

    const state = await buildFullState(gsdDir);

    expect(typeof state.projectState).toBe("object");
    expect(typeof state.projectState.status).toBe("string");
    expect(state.projectState.status).toBe("in_progress");
  });

  test("returns a GSD2State without v1 phases array (v1 phases are removed in GSD 2)", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);

    const state = await buildFullState(gsdDir);

    // GSD2State does not have phases[] — that was v1 schema
    expect((state as any).phases).toBeUndefined();
    expect((state as any).state).toBeUndefined();
    expect((state as any).config).toBeUndefined();
    expect((state as any).requirements).toBeUndefined();
  });

  test("needsMigration is false for a fresh .gsd/ dir with no .planning/ sibling", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    writeFileSync(join(gsdDir, "STATE.md"), GSD2_STATE_MD);

    const state = await buildFullState(gsdDir);
    expect(state.needsMigration).toBe(false);
  });
});
