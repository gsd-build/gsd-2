/**
 * State deriver tests for Phase 5 extensions:
 * must_haves parsing, task_count, and verification data.
 */
import { describe, expect, test, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFullState } from "../src/server/state-deriver";

let tempDir: string;

function makeTempPlanningDir(): string {
  return mkdtempSync(join(tmpdir(), "state-deriver-p5-"));
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

const PLAN_WITH_MUST_HAVES = `---
phase: 05-slice-detail-active-task
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/types.ts
  - src/server/state-deriver.ts
  - src/components/slice-detail/ContextBudgetChart.tsx
autonomous: true
requirements: [SLCD-01, SLCD-02]
must_haves:
  truths:
    - "Context usage bar chart renders one colored bar per task"
    - "Boundary map shows PRODUCES list with green borders"
  artifacts:
    - path: "src/server/types.ts"
      provides: "SliceDetailState types"
      contains: "VerificationState"
    - path: "src/components/slice-detail/ContextBudgetChart.tsx"
      provides: "Bar chart for context budget"
      exports: ["ContextBudgetChart"]
  key_links:
    - from: "TabLayout.tsx"
      to: "slice-detail components"
      via: "renderTabContent slice branch"
      pattern: "activeTab.*slice"
---

<objective>Test plan</objective>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Do something</name>
</task>
<task type="auto">
  <name>Task 2: Do another thing</name>
</task>
<task type="auto">
  <name>Task 3: Third task</name>
</task>
</tasks>
`;

const PLAN_WITHOUT_MUST_HAVES = `---
phase: 05-slice-detail-active-task
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/foo.ts
autonomous: true
requirements: []
---

<tasks>
<task type="auto">
  <name>Task 1: Only task</name>
</task>
</tasks>
`;

const VERIFICATION_MD = `---
phase: 05-slice-detail-active-task
plan: 01
score: 85
status: partial
---

# Verification

| Truth | Status |
|-------|--------|
| Context bar renders correctly | pass |
| Boundary map shows lists | pass |
| UAT status rows display | fail |
`;

function setupDir(): string {
  tempDir = makeTempPlanningDir();
  writeFileSync(join(tempDir, "STATE.md"), `---
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "Working on Phase 5"
last_updated: "2026-03-10"
last_activity: "2026-03-10"
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 12
  completed_plans: 7
  percent: 58
---
# State
`);
  writeFileSync(join(tempDir, "ROADMAP.md"), "# Roadmap\n");
  writeFileSync(join(tempDir, "config.json"), JSON.stringify({ model_profile: "balanced" }));
  writeFileSync(join(tempDir, "REQUIREMENTS.md"), "# Requirements\n");

  const phaseDir = join(tempDir, "phases", "05-slice-detail-active-task");
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(join(phaseDir, "05-01-PLAN.md"), PLAN_WITH_MUST_HAVES);
  writeFileSync(join(phaseDir, "05-02-PLAN.md"), PLAN_WITHOUT_MUST_HAVES);

  return tempDir;
}

describe("PlanState - must_haves parsing", () => {
  test("includes must_haves with truths, artifacts, key_links arrays when parsed from PLAN.md frontmatter", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    expect(phase5).toBeDefined();

    const plan1 = phase5!.plans.find((p) => p.plan === 1);
    expect(plan1).toBeDefined();
    expect(plan1!.must_haves).toBeDefined();
    expect(plan1!.must_haves!.truths).toHaveLength(2);
    expect(plan1!.must_haves!.truths[0]).toContain("Context usage bar chart");
    expect(plan1!.must_haves!.artifacts).toHaveLength(2);
    expect(plan1!.must_haves!.artifacts[0].path).toBe("src/server/types.ts");
    expect(plan1!.must_haves!.artifacts[0].provides).toBe("SliceDetailState types");
    expect(plan1!.must_haves!.artifacts[0].contains).toBe("VerificationState");
    expect(plan1!.must_haves!.artifacts[1].exports).toEqual(["ContextBudgetChart"]);
    expect(plan1!.must_haves!.key_links).toHaveLength(1);
    expect(plan1!.must_haves!.key_links[0].from).toBe("TabLayout.tsx");
    expect(plan1!.must_haves!.key_links[0].to).toBe("slice-detail components");
    expect(plan1!.must_haves!.key_links[0].via).toBe("renderTabContent slice branch");
    expect(plan1!.must_haves!.key_links[0].pattern).toBe("activeTab.*slice");
  });

  test("must_haves is undefined when not present in PLAN.md", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    const plan2 = phase5!.plans.find((p) => p.plan === 2);
    expect(plan2).toBeDefined();
    expect(plan2!.must_haves).toBeUndefined();
  });
});

describe("PlanState - task_count parsing", () => {
  test("task_count parsed from plan body counts task elements", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    const plan1 = phase5!.plans.find((p) => p.plan === 1);
    expect(plan1).toBeDefined();
    expect(plan1!.task_count).toBe(3);
  });

  test("task_count is correct for plan with single task", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    const plan2 = phase5!.plans.find((p) => p.plan === 2);
    expect(plan2).toBeDefined();
    expect(plan2!.task_count).toBe(1);
  });
});

describe("PhaseState - verifications parsing", () => {
  test("includes verifications array parsed from VERIFICATION.md files", async () => {
    const dir = setupDir();
    const phaseDir = join(dir, "phases", "05-slice-detail-active-task");
    writeFileSync(join(phaseDir, "05-01-VERIFICATION.md"), VERIFICATION_MD);

    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    expect(phase5).toBeDefined();
    expect(phase5!.verifications).toBeDefined();
    expect(phase5!.verifications).toHaveLength(1);
  });

  test("VerificationState has score, status, and truths fields", async () => {
    const dir = setupDir();
    const phaseDir = join(dir, "phases", "05-slice-detail-active-task");
    writeFileSync(join(phaseDir, "05-01-VERIFICATION.md"), VERIFICATION_MD);

    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    const verification = phase5!.verifications[0];

    expect(verification.score).toBe(85);
    expect(verification.status).toBe("partial");
    expect(verification.truths).toHaveLength(3);
    expect(verification.truths[0].truth).toContain("Context bar renders correctly");
    expect(verification.truths[0].status).toBe("pass");
    expect(verification.truths[2].status).toBe("fail");
  });

  test("verifications is empty array when no VERIFICATION.md files exist", async () => {
    const dir = setupDir();
    const state = await buildFullState(dir);
    const phase5 = state.phases.find((p) => p.number === 5);
    expect(phase5!.verifications).toEqual([]);
  });
});
