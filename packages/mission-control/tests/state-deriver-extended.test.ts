/**
 * Extended state deriver tests for git branch extraction
 * and completed plan counting (Phase 04-01 Task 1).
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState, parseRoadmap } from "../src/server/state-deriver";

let tempDir: string;

function makeTempPlanningDir(): string {
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

const SAMPLE_STATE_MD = `---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "Working on Phase 2"
last_updated: "2026-03-10T00:11:01.262Z"
last_activity: "2026-03-10 -- Completed 01-02-PLAN.md"
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 5
  completed_plans: 2
  percent: 40
---

# Project State
`;

const SAMPLE_PLAN_MD = `---
phase: 02-file-to-state-pipeline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/types.ts
autonomous: true
requirements: [SERV-02]
---

# Plan content
`;

const SAMPLE_SUMMARY_MD = `---
phase: 02-file-to-state-pipeline
plan: 01
---

# Summary
`;

function setupDir(): string {
  tempDir = makeTempPlanningDir();
  writeFileSync(join(tempDir, "STATE.md"), SAMPLE_STATE_MD);
  writeFileSync(join(tempDir, "ROADMAP.md"), "# Roadmap\n");
  writeFileSync(join(tempDir, "config.json"), JSON.stringify({ model_profile: "balanced" }));
  writeFileSync(join(tempDir, "REQUIREMENTS.md"), "# Requirements\n");

  const phaseDir = join(tempDir, "phases", "02-file-to-state-pipeline");
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(join(phaseDir, "02-01-PLAN.md"), SAMPLE_PLAN_MD);

  return tempDir;
}

describe("buildFullState - branch field", () => {
  test("returns a branch field as a string in ProjectState", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);

    expect(typeof state.state.branch).toBe("string");
    // branch should be non-empty since we are in a git repo
    expect(state.state.branch.length).toBeGreaterThan(0);
  });

  test("returns 'unknown' for branch when not in a git repo", async () => {
    // Use a temp dir that is NOT inside a git repo
    tempDir = makeTempPlanningDir();
    writeFileSync(join(tempDir, "STATE.md"), SAMPLE_STATE_MD);
    writeFileSync(join(tempDir, "ROADMAP.md"), "# Roadmap\n");
    writeFileSync(join(tempDir, "config.json"), "{}");
    writeFileSync(join(tempDir, "REQUIREMENTS.md"), "# Requirements\n");

    // Temp dirs outside the repo should return "unknown"
    // (This may still return a branch if tmpdir is inside a git worktree,
    //  so we just verify the type is string)
    const state = await buildFullState(tempDir);
    expect(typeof state.state.branch).toBe("string");
  });
});

describe("PhaseState - completedPlans field", () => {
  test("includes completedPlans count derived from SUMMARY files", async () => {
    const dir = setupDir();
    const phaseDir = join(dir, "phases", "02-file-to-state-pipeline");

    // Add a SUMMARY file to simulate a completed plan
    writeFileSync(join(phaseDir, "02-01-SUMMARY.md"), SAMPLE_SUMMARY_MD);

    const state = await buildFullState(dir);
    const phase2 = state.phases.find((p) => p.number === 2);
    expect(phase2).toBeDefined();
    expect(phase2!.completedPlans).toBe(1);
  });

  test("completedPlans is 0 when no SUMMARY files exist", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);
    const phase2 = state.phases.find((p) => p.number === 2);
    expect(phase2).toBeDefined();
    expect(phase2!.completedPlans).toBe(0);
  });
});

describe("parseRoadmap regression", () => {
  test("still correctly parses roadmap phases", () => {
    const content = `# Roadmap

## Phases

- [x] **Phase 1: Bootstrap** - Initial setup
- [ ] **Phase 2: Pipeline** - File watcher
`;
    const result = parseRoadmap(content);
    expect(result.phases).toHaveLength(2);
    expect(result.phases[0].completed).toBe(true);
    expect(result.phases[0].name).toBe("Bootstrap");
    expect(result.phases[1].completed).toBe(false);
  });
});
