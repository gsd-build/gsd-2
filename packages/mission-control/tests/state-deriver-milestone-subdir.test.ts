/**
 * State deriver tests — milestone subdirectory scanning behaviors.
 *
 * Tests for:
 * 1. scanSlicesDirectory reading tasks/ subdir for T{NN}-SUMMARY.md when no PLAN.md
 * 2. milestoneName fallback to "(no roadmap)" when no ROADMAP.md and no parseable heading
 *
 * Uses temp filesystem fixtures (same pattern as state-deriver.test.ts).
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState } from "../src/server/state-deriver";

let tempDir: string;

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "state-deriver-subdir-"));
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

describe("scanSlicesDirectory — tasks/ subdir scanning when no PLAN.md", () => {
  test("reads T{NN}-SUMMARY.md files from tasks/ subdir and marks tasks as status: complete", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    // STATE.md pointing to M001
    const stateContent = `---
gsd_state_version: "1.0"
milestone: v1.0
milestone_name: Test Milestone
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-18T00:00:00Z"
---
`;
    writeFileSync(join(gsdDir, "STATE.md"), stateContent);

    // Create milestones/M001/slices/S01/ directory WITHOUT an S01-PLAN.md
    const sliceDir = join(gsdDir, "milestones", "M001", "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });

    // Create tasks/ subdir with T01-SUMMARY.md and T02-SUMMARY.md
    const tasksDir = join(sliceDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# T01 Summary\nTask 1 completed.");
    writeFileSync(join(tasksDir, "T02-SUMMARY.md"), "# T02 Summary\nTask 2 completed.");

    const state = await buildFullState(gsdDir);

    // allMilestones should include M001 with scanned slices
    expect(state.allMilestones).toBeDefined();
    expect(state.allMilestones.length).toBeGreaterThanOrEqual(1);

    const m001 = state.allMilestones.find((m) => m.milestoneId === "M001");
    expect(m001).toBeDefined();

    const s01 = m001!.slices.find((s) => s.id === "S01");
    expect(s01).toBeDefined();

    // Tasks should be discovered from tasks/ subdir
    expect(s01!.tasks).toBeDefined();
    expect(s01!.tasks!.length).toBe(2);

    // All tasks found via T{NN}-SUMMARY.md should be marked complete
    for (const task of s01!.tasks!) {
      expect(task.status).toBe("complete");
    }

    // Task IDs should be extracted from filenames
    const taskIds = s01!.tasks!.map((t) => t.id).sort();
    expect(taskIds).toEqual(["T01", "T02"]);

    // Slice status should be "complete" since all discovered tasks are complete
    expect(s01!.status).toBe("complete");
  });

  test("slice with no PLAN.md and empty tasks/ subdir gets no tasks", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    const stateContent = `---
gsd_state_version: "1.0"
milestone: v1.0
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-18T00:00:00Z"
---
`;
    writeFileSync(join(gsdDir, "STATE.md"), stateContent);

    // Create slice directory without PLAN.md and with empty tasks/ dir
    const sliceDir = join(gsdDir, "milestones", "M001", "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    mkdirSync(join(sliceDir, "tasks"), { recursive: true });

    const state = await buildFullState(gsdDir);

    const m001 = state.allMilestones.find((m) => m.milestoneId === "M001");
    expect(m001).toBeDefined();

    const s01 = m001!.slices.find((s) => s.id === "S01");
    expect(s01).toBeDefined();

    // No T{NN}-SUMMARY.md files, so tasks array should be empty
    expect(s01!.tasks).toBeDefined();
    expect(s01!.tasks!.length).toBe(0);

    // Status remains "planned" when no tasks are found
    expect(s01!.status).toBe("planned");
  });
});

describe("milestoneName fallback — '(no roadmap)' when no ROADMAP.md", () => {
  test("when no ROADMAP.md and no parseable heading in SUMMARY.md, milestoneName falls back to '(no roadmap)'", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    const stateContent = `---
gsd_state_version: "1.0"
milestone: v1.0
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-18T00:00:00Z"
---
`;
    writeFileSync(join(gsdDir, "STATE.md"), stateContent);

    // Create milestone directory with NO ROADMAP.md
    const milestoneDir = join(gsdDir, "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });

    // Create a slice subdir so the milestone shows up in allMilestones
    const sliceDir = join(milestoneDir, "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(join(sliceDir, "S01-PLAN.md"), "# S01: Test Slice\n\n## Tasks\n\n- T01: Do stuff [pending]\n");

    // Write an M001-SUMMARY.md without parseable heading (no "# M001 — Name" pattern)
    writeFileSync(join(milestoneDir, "M001-SUMMARY.md"), "Just some text without a proper heading.\n");

    const state = await buildFullState(gsdDir);

    const m001 = state.allMilestones.find((m) => m.milestoneId === "M001");
    expect(m001).toBeDefined();
    expect(m001!.milestoneName).toBe("(no roadmap)");
  });

  test("when no ROADMAP.md but SUMMARY.md has parseable heading, milestoneName is extracted", async () => {
    tempDir = makeTempDir();
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    const stateContent = `---
gsd_state_version: "1.0"
milestone: v1.0
status: in_progress
active_milestone: M002
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-18T00:00:00Z"
---
`;
    writeFileSync(join(gsdDir, "STATE.md"), stateContent);

    // Create milestone directory with no ROADMAP.md but a properly headed SUMMARY
    const milestoneDir = join(gsdDir, "milestones", "M002");
    mkdirSync(milestoneDir, { recursive: true });

    const sliceDir = join(milestoneDir, "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(join(sliceDir, "S01-PLAN.md"), "# S01: Foundation\n\n## Tasks\n\n- T01: Init [pending]\n");

    // SUMMARY.md with parseable "# M002 — Dashboard" heading
    writeFileSync(join(milestoneDir, "M002-SUMMARY.md"), "# M002 — Dashboard\n\nSummary content.\n");

    const state = await buildFullState(gsdDir);

    const m002 = state.allMilestones.find((m) => m.milestoneId === "M002");
    expect(m002).toBeDefined();
    expect(m002!.milestoneName).toBe("Dashboard");
  });
});
