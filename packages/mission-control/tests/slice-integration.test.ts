/**
 * Slice integration test — end-to-end pipeline validation.
 *
 * Creates a realistic .gsd/ fixture with all four slice statuses
 * and verifies that buildFullState produces a correct GSD2State.
 *
 * Phase 14-05: Integration test covering the full state derivation pipeline.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState } from "../src/server/state-deriver";

let tempDir: string;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "slice-integration-test-"));
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

// -- Fixture content --

const STATE_MD = `---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: User Auth Milestone
status: in_progress
active_milestone: M001
active_slice: S02
active_task: T01
auto_mode: true
cost: 0.18
tokens: 1200
last_updated: "2026-03-13T08:00:00Z"
---
`;

const ROADMAP_MD = `# M001 — User Auth Milestone

## S01 — Data Model [COMPLETE]
2 tasks · ~$0.12 · branch: gsd/M001/S01
Depends on: none

## S02 — API Layer [IN PROGRESS]
4 tasks · ~$0.35 · branch: gsd/M001/S02
Depends on: S01 Data Model ✓

## S03 — Auth UI [PLANNED]
3 tasks · ~$0.40 · branch: gsd/M001/S03
Depends on: S01 Data Model ✓, S02 API Layer

## S04 — E2E Tests [PLANNED]
2 tasks · ~$0.20 · branch: gsd/M001/S04
Depends on: S03 Auth UI
`;

const PLAN_MD = `---
slice: S02
name: API Layer
cost_estimate: ~$0.35
---

# S02 Plan

## Tasks

- T01: Add POST /auth/login endpoint [complete]
- T02: Add token refresh endpoint [complete]
- T03: Add GET /auth/me endpoint [pending]
- T04: Add DELETE /auth/logout endpoint [pending]

## Must-Haves

- POST /auth/login returns signed JWT
- Token refresh extends session
`;

const UAT_MD = `# S02 UAT Checklist

- [ ] UAT-01: POST /auth/login returns JWT
- [ ] UAT-02: Token expires after 15 minutes
- [x] UAT-03: Invalid credentials return 401
`;

const PREFERENCES_MD = `---
research_model: claude-sonnet-4-6
planning_model: claude-sonnet-4-6
execution_model: claude-sonnet-4-6
completion_model: claude-sonnet-4-6
budget_ceiling: 2.00
skill_discovery: auto
---

# Preferences
`;

// -- Fixture helpers --

function createFullFixture(gsdDir: string): void {
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, "STATE.md"), STATE_MD);
  writeFileSync(join(gsdDir, "M001-ROADMAP.md"), ROADMAP_MD);
  writeFileSync(join(gsdDir, "S02-PLAN.md"), PLAN_MD);
  writeFileSync(join(gsdDir, "S02-UAT.md"), UAT_MD);
  writeFileSync(join(gsdDir, "preferences.md"), PREFERENCES_MD);
}

// -- Integration tests --

describe("slice-integration — buildFullState with full .gsd/ fixture", () => {
  test("buildFullState with full .gsd/ produces correct GSD2State", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    createFullFixture(gsdDir);

    const state = await buildFullState(gsdDir);

    // Slice list — four slices parsed from roadmap
    expect(state.slices).toHaveLength(4);
    expect(state.slices[0].status).toBe("complete");
    expect(state.slices[1].status).toBe("in_progress");
    expect(state.slices[2].status).toBe("planned");
    expect(state.slices[3].status).toBe("planned");

    // Slice IDs are correct
    expect(state.slices[0].id).toBe("S01");
    expect(state.slices[1].id).toBe("S02");
    expect(state.slices[2].id).toBe("S03");
    expect(state.slices[3].id).toBe("S04");

    // Active slice pointers
    expect(state.projectState.active_slice).toBe("S02");
    expect(state.projectState.active_milestone).toBe("M001");
    expect(state.projectState.auto_mode).toBe(true);
    expect(state.projectState.cost).toBe(0.18);

    // UAT file parsed from S02-UAT.md
    expect(state.uatFile).not.toBeNull();
    expect(state.uatFile!.sliceId).toBe("S02");
    expect(state.uatFile!.items).toHaveLength(3);
    expect(state.uatFile!.items[0].id).toBe("UAT-01");
    expect(state.uatFile!.items[0].checked).toBe(false);
    expect(state.uatFile!.items[1].id).toBe("UAT-02");
    expect(state.uatFile!.items[1].checked).toBe(false);
    expect(state.uatFile!.items[2].id).toBe("UAT-03");
    expect(state.uatFile!.items[2].checked).toBe(true); // [x]

    // Preferences parsed from preferences.md
    expect(state.preferences).not.toBeNull();
    expect(state.preferences!.budget_ceiling).toBe(2.0);
    expect(state.preferences!.skill_discovery).toBe("auto");

    // Active plan parsed from S02-PLAN.md
    expect(state.activePlan).not.toBeNull();
    expect(state.activePlan!.sliceId).toBe("S02");
    expect(state.activePlan!.tasks).toHaveLength(4);
    const completedTasks = state.activePlan!.tasks.filter((t) => t.status === "complete");
    const pendingTasks = state.activePlan!.tasks.filter((t) => t.status === "pending");
    expect(completedTasks).toHaveLength(2);
    expect(pendingTasks).toHaveLength(2);
  });

  test("slice dependency resolution — S01 complete marks deps complete in dependants", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    createFullFixture(gsdDir);

    const state = await buildFullState(gsdDir);

    // S02 depends on S01 (complete) — dep should be marked complete
    const s02 = state.slices.find((s) => s.id === "S02");
    expect(s02).toBeDefined();
    expect(s02!.dependencies).toHaveLength(1);
    expect(s02!.dependencies[0].id).toBe("S01");
    expect(s02!.dependencies[0].complete).toBe(true);

    // S04 depends on S03 (planned / not complete) — dep should be incomplete
    const s04 = state.slices.find((s) => s.id === "S04");
    expect(s04).toBeDefined();
    expect(s04!.dependencies).toHaveLength(1);
    expect(s04!.dependencies[0].id).toBe("S03");
    expect(s04!.dependencies[0].complete).toBe(false);
  });

  test("buildFullState with missing roadmap returns empty slices", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    // Write only STATE.md — no roadmap
    writeFileSync(join(gsdDir, "STATE.md"), STATE_MD);

    const state = await buildFullState(gsdDir);
    expect(state.slices).toEqual([]);
    expect(state.uatFile).toBeNull();
    expect(state.roadmap).toBeNull();
  });

  test("buildFullState with missing UAT file returns null uatFile", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    // Write STATE.md + ROADMAP.md but no UAT file
    writeFileSync(join(gsdDir, "STATE.md"), STATE_MD);
    writeFileSync(join(gsdDir, "M001-ROADMAP.md"), ROADMAP_MD);

    const state = await buildFullState(gsdDir);
    expect(state.slices).toHaveLength(4);
    expect(state.uatFile).toBeNull();
  });

  test("slice task counts and cost estimates are parsed correctly", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    createFullFixture(gsdDir);

    const state = await buildFullState(gsdDir);

    expect(state.slices[0].taskCount).toBe(2);   // S01: "2 tasks"
    expect(state.slices[0].costEstimate).toBe(0.12); // "~$0.12"
    expect(state.slices[1].taskCount).toBe(4);   // S02: "4 tasks"
    expect(state.slices[1].costEstimate).toBe(0.35); // "~$0.35"
    expect(state.slices[2].taskCount).toBe(3);   // S03: "3 tasks"
    expect(state.slices[2].costEstimate).toBe(0.40); // "~$0.40"
    expect(state.slices[3].taskCount).toBe(2);   // S04: "2 tasks"
    expect(state.slices[3].costEstimate).toBe(0.20); // "~$0.20"
  });

  test("slice branch values are parsed from roadmap", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    createFullFixture(gsdDir);

    const state = await buildFullState(gsdDir);

    expect(state.slices[0].branch).toBe("gsd/M001/S01");
    expect(state.slices[1].branch).toBe("gsd/M001/S02");
    expect(state.slices[2].branch).toBe("gsd/M001/S03");
    expect(state.slices[3].branch).toBe("gsd/M001/S04");
  });
});
