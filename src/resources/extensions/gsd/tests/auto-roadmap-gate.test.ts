/**
 * Tests for the checkAutoStartAfterDiscuss() "waitFor: roadmap" gate logic.
 *
 * Exercises the two safety gates that guard auto-start after the plan-milestone
 * workflow (the "Create roadmap" wizard path):
 *   Gate 1 — ROADMAP.md must exist (written by the plan-milestone workflow)
 *   Gate 2 — STATE.md must exist (signals successful session completion)
 *
 * Gates 3-4 (multi-milestone completeness + discussion manifest) are intentionally
 * not tested here because the plan-milestone workflow is single-milestone and never
 * produces PROJECT.md sequences or DISCUSSION-MANIFEST.json.
 *
 * Uses real filesystem state + static source analysis, following the same
 * pattern as draft-promotion.test.ts and smart-entry-draft.test.ts.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveMilestoneFile, resolveGsdRootFile, clearPathCache } from "../paths.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

// ─── Static analysis chunk sizes ─────────────────────────────────────────────

// Generous upper bound for the waitFor === "roadmap" branch (measured ~1100 chars).
const ROADMAP_BRANCH_CHUNK = 2000;
// Upper bound for the pendingAutoStart type declaration (typically < 200 chars).
const PENDING_TYPE_CHUNK = 600;
// Upper bound for the choice === "plan" branch up to dispatchWorkflow (measured ~500 chars).
const PLAN_BRANCH_CHUNK = 1200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpBase(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `gsd-roadmap-gate-${prefix}-`));
}

function writeRoadmap(basePath: string, milestoneId: string): void {
  const dir = join(basePath, ".gsd", "milestones", milestoneId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${milestoneId}-ROADMAP.md`),
    `# ${milestoneId}: Roadmap\n\n## Slice S01\n\n- Task T01\n`,
  );
}

function writeStateFile(basePath: string): void {
  mkdirSync(join(basePath, ".gsd"), { recursive: true });
  writeFileSync(join(basePath, ".gsd", "STATE.md"), `# State\n\nActive milestone: M001\n`);
}

// ─── Gate 1: ROADMAP.md must exist ───────────────────────────────────────────

console.log("=== Gate 1: ROADMAP.md must exist ===");

{
  const tmpBase = makeTmpBase("no-roadmap");
  mkdirSync(join(tmpBase, ".gsd", "milestones", "M001"), { recursive: true });

  clearPathCache();
  const roadmapFile = resolveMilestoneFile(tmpBase, "M001", "ROADMAP");
  assert(
    roadmapFile === null || roadmapFile === undefined,
    `resolveMilestoneFile("ROADMAP") should return null when no ROADMAP.md exists, got: "${roadmapFile}"`,
  );

  rmSync(tmpBase, { recursive: true, force: true });
}

{
  const tmpBase = makeTmpBase("with-roadmap");
  writeRoadmap(tmpBase, "M001");

  clearPathCache();
  const roadmapFile = resolveMilestoneFile(tmpBase, "M001", "ROADMAP");
  assert(
    roadmapFile !== null && roadmapFile !== undefined,
    `resolveMilestoneFile("ROADMAP") should return a path when ROADMAP.md exists, got: "${roadmapFile}"`,
  );
  assert(
    roadmapFile!.endsWith("M001-ROADMAP.md"),
    `resolved path should end with M001-ROADMAP.md, got: "${roadmapFile}"`,
  );

  rmSync(tmpBase, { recursive: true, force: true });
}

// ─── Gate 2: STATE.md must exist ─────────────────────────────────────────────

console.log("=== Gate 2: STATE.md must exist ===");

{
  const tmpBase = makeTmpBase("no-state");
  writeRoadmap(tmpBase, "M001");
  // No STATE.md written

  const stateFile = resolveGsdRootFile(tmpBase, "STATE");
  assert(
    !existsSync(stateFile),
    `STATE.md should not exist before the planning session finalizes, got: "${stateFile}"`,
  );

  rmSync(tmpBase, { recursive: true, force: true });
}

{
  const tmpBase = makeTmpBase("with-state");
  writeRoadmap(tmpBase, "M001");
  writeStateFile(tmpBase);

  const stateFile = resolveGsdRootFile(tmpBase, "STATE");
  assert(
    existsSync(stateFile),
    `STATE.md should exist after the planning session finalizes, got: "${stateFile}"`,
  );
  assert(
    stateFile.endsWith("STATE.md"),
    `STATE.md path should end with STATE.md, got: "${stateFile}"`,
  );

  rmSync(tmpBase, { recursive: true, force: true });
}

// ─── Static: guided-flow.ts roadmap branch has both gates ────────────────────

console.log("=== Static: checkAutoStartAfterDiscuss roadmap branch ===");

const guidedFlowSource = readFileSync(
  join(import.meta.dirname, "..", "guided-flow.ts"),
  "utf-8",
);

// Isolate the waitFor === "roadmap" branch (between the if-check and the closing })
const roadmapBranchIdx = guidedFlowSource.indexOf('waitFor === "roadmap"');
assert(
  roadmapBranchIdx !== -1,
  'guided-flow.ts should have a waitFor === "roadmap" branch in checkAutoStartAfterDiscuss',
);

const roadmapBranchChunk = guidedFlowSource.slice(roadmapBranchIdx, roadmapBranchIdx + ROADMAP_BRANCH_CHUNK);

// Gate 1 is present
assert(
  roadmapBranchChunk.includes('resolveMilestoneFile') && roadmapBranchChunk.includes('"ROADMAP"'),
  'roadmap branch should call resolveMilestoneFile(..., "ROADMAP") as Gate 1',
);

// Gate 2 is present — STATE.md existence check
assert(
  roadmapBranchChunk.includes('resolveGsdRootFile') && roadmapBranchChunk.includes('"STATE"'),
  'roadmap branch should call resolveGsdRootFile(basePath, "STATE") as Gate 2',
);
assert(
  roadmapBranchChunk.includes('existsSync'),
  'roadmap branch should use existsSync to check STATE.md exists on disk',
);

// Gates 3-4 skipped with explanation comment
assert(
  roadmapBranchChunk.includes('Gates 3-4') || roadmapBranchChunk.includes('intentionally skipped'),
  'roadmap branch should have a comment explaining why Gates 3-4 are intentionally skipped',
);

// The branch still calls startAuto
assert(
  roadmapBranchChunk.includes('startAuto'),
  'roadmap branch should call startAuto() after all gates pass',
);

// ─── Static: pendingAutoStart type has waitFor field ─────────────────────────

console.log("=== Static: pendingAutoStart type has waitFor field ===");

const typeIdx = guidedFlowSource.indexOf("let pendingAutoStart:");
const typeChunk = guidedFlowSource.slice(typeIdx, typeIdx + PENDING_TYPE_CHUNK);

assert(
  typeChunk.includes('waitFor'),
  'pendingAutoStart type should include waitFor field',
);
assert(
  typeChunk.includes('"roadmap"'),
  'pendingAutoStart waitFor field should include "roadmap" literal type',
);

// ─── Static: showSmartEntry plan branch sets pendingAutoStart ────────────────

console.log('=== Static: showSmartEntry "plan" branch sets pendingAutoStart ===');

const planBranchIdx = guidedFlowSource.indexOf('choice === "plan"');
assert(
  planBranchIdx !== -1,
  'showSmartEntry should have a choice === "plan" branch',
);

const planBranchChunk = guidedFlowSource.slice(planBranchIdx, planBranchIdx + PLAN_BRANCH_CHUNK);

assert(
  planBranchChunk.includes('pendingAutoStart ='),
  'plan branch should set pendingAutoStart before dispatchWorkflow',
);
assert(
  planBranchChunk.includes('waitFor: "roadmap"'),
  'plan branch should set waitFor: "roadmap" in pendingAutoStart',
);

// pendingAutoStart must be set BEFORE dispatchWorkflow to avoid a race
const pendingIdx = planBranchChunk.indexOf('pendingAutoStart =');
const dispatchIdx = planBranchChunk.indexOf('dispatchWorkflow');
assert(
  pendingIdx !== -1 && dispatchIdx !== -1 && pendingIdx < dispatchIdx,
  'pendingAutoStart must be assigned before dispatchWorkflow is called in the plan branch',
);

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\nauto-roadmap-gate: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
