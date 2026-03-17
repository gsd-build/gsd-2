/**
 * Test: Auto-bootstrap handoff — path cache staleness fix (#921)
 *
 * Verifies that checkAutoStartAfterDiscuss() clears the path cache before
 * checking gates, so newly created milestone artifacts are found even when
 * the cache was populated before the discussion wrote them.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveMilestoneFile, clearPathCache } from "../paths.js";

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

// ─── Scenario: Stale path cache prevents milestone file resolution ──────

console.log("=== Stale path cache: milestone file resolution ===");

const tmpBase = mkdtempSync(join(tmpdir(), "gsd-bootstrap-handoff-"));
const gsd = join(tmpBase, ".gsd");

// Step 1: Create empty milestones directory (bootstrap creates this before discuss)
mkdirSync(join(gsd, "milestones"), { recursive: true });

// Step 2: Populate path cache — M001 directory does NOT exist yet
const before = resolveMilestoneFile(tmpBase, "M001", "CONTEXT");
assert(
  before === null,
  `before discussion: resolveMilestoneFile should return null, got: "${before}"`,
);

// Step 3: Simulate discussion output — LLM creates milestone directory and writes CONTEXT.md
mkdirSync(join(gsd, "milestones", "M001"), { recursive: true });
writeFileSync(
  join(gsd, "milestones", "M001", "M001-CONTEXT.md"),
  "# M001: Bootstrap Test\n\nContext from discussion.\n",
);

// Step 4: WITHOUT clearing cache, the stale cache still returns null
const stale = resolveMilestoneFile(tmpBase, "M001", "CONTEXT");
assert(
  stale === null,
  `stale cache: resolveMilestoneFile should return null (stale), got: "${stale}"`,
);

// Step 5: After clearing path cache, the file is found
clearPathCache();
const fresh = resolveMilestoneFile(tmpBase, "M001", "CONTEXT");
assert(
  fresh !== null,
  "after clearPathCache: resolveMilestoneFile should find the CONTEXT file",
);
assert(
  fresh !== null && fresh.endsWith("M001-CONTEXT.md"),
  `after clearPathCache: path should end with M001-CONTEXT.md, got: "${fresh}"`,
);

// ─── Scenario: ROADMAP.md also found after cache clear ──────────────────

console.log("=== ROADMAP.md resolution after cache clear ===");

// Populate cache first (M001 was just cached without ROADMAP)
const noRoadmap = resolveMilestoneFile(tmpBase, "M001", "ROADMAP");
assert(
  noRoadmap === null,
  "ROADMAP should not exist yet",
);

// Write ROADMAP.md
writeFileSync(
  join(gsd, "milestones", "M001", "M001-ROADMAP.md"),
  "# Roadmap: M001\n\n- [ ] S01: Bootstrap\n",
);

// Stale cache still misses it
const staleRoadmap = resolveMilestoneFile(tmpBase, "M001", "ROADMAP");
assert(
  staleRoadmap === null,
  "stale cache: ROADMAP should not be found",
);

// Clear and find
clearPathCache();
const freshRoadmap = resolveMilestoneFile(tmpBase, "M001", "ROADMAP");
assert(
  freshRoadmap !== null && freshRoadmap.endsWith("M001-ROADMAP.md"),
  `after clearPathCache: should find ROADMAP, got: "${freshRoadmap}"`,
);

// ─── Static: checkAutoStartAfterDiscuss clears path cache ───────────────

console.log("=== Static: checkAutoStartAfterDiscuss clears path cache ===");

const guidedFlowSource = readFileSync(
  join(import.meta.dirname, "..", "guided-flow.ts"),
  "utf-8",
);

const checkFnIdx = guidedFlowSource.indexOf("export function checkAutoStartAfterDiscuss");
const checkFnEnd = guidedFlowSource.indexOf("\nexport ", checkFnIdx + 1);
const checkFnChunk = guidedFlowSource.slice(
  checkFnIdx,
  checkFnEnd > checkFnIdx ? checkFnEnd : checkFnIdx + 5000,
);

assert(
  checkFnChunk.includes("clearPathCache"),
  "checkAutoStartAfterDiscuss should call clearPathCache() before gate checks",
);

// Verify clearPathCache is called BEFORE the gate checks (before resolveMilestoneFile)
const clearIdx = checkFnChunk.indexOf("clearPathCache");
const gate1Idx = checkFnChunk.indexOf("resolveMilestoneFile");
assert(
  clearIdx < gate1Idx,
  "clearPathCache should be called before resolveMilestoneFile (Gate 1)",
);

// ─── Cleanup ──────────────────────────────────────────────────────────

rmSync(tmpBase, { recursive: true, force: true });

// ─── Results ──────────────────────────────────────────────────────────

console.log(`\nauto-bootstrap-handoff: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
