// Project/App: GSD-2
// File Purpose: ADR-017 contract tests for drift-driven State Reconciliation.
// Covers sketch-flag (#5700), merge-state (#5701), stale-render (#5702),
// stale-worker (#5703), unregistered-milestone (#5704), roadmap-divergence
// (#5705), and missing-completion-timestamp (#5706) drift end-to-end, plus
// the repair-throw and persistent-drift error paths and Recovery
// Classification mapping for ReconciliationFailedError.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  getMilestone,
  getSlice,
  getSliceTasks,
  setSliceSummaryMd,
  updateSliceStatus,
  updateTaskStatus,
} from "../gsd-db.ts";
import { clearParseCache } from "../files.ts";
import { clearPathCache } from "../paths.ts";
import { detectStaleRenders } from "../markdown-renderer.ts";
import { invalidateStateCache } from "../state.ts";
import {
  reconcileBeforeDispatch,
  reconcileBeforeSpawn,
  ReconciliationFailedError,
  type DriftHandler,
  type DriftRecord,
} from "../state-reconciliation.ts";
import { classifyFailure } from "../recovery-classification.ts";
import type { GSDState } from "../types.ts";

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "Plan milestone",
    registry: [],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: { milestones: { done: 0, total: 1 } },
    ...overrides,
  };
}

function makeFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-drift-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S02"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

test("ADR-017 (#5700): sketch-flag drift detected and repaired end-to-end", async (t) => {
  const base = makeFixtureBase();
  t.after(() => cleanup(base));

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({
    id: "S02",
    milestoneId: "M001",
    title: "Feature",
    status: "pending",
    risk: "medium",
    depends: [],
    demo: "S02 demo.",
    sequence: 1,
    isSketch: true,
    sketchScope: "limited",
  });

  // Simulate the post-crash scenario: PLAN.md exists on disk but the
  // is_sketch flag is still 1.
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S02", "S02-PLAN.md"),
    "# S02 Plan\n",
  );
  assert.equal(getSlice("M001", "S02")?.is_sketch, 1, "pre: flagged as sketch");

  const state = makeState({ activeMilestone: { id: "M001", title: "Test" } });
  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => state,
  });

  assert.equal(result.ok, true);
  assert.equal(getSlice("M001", "S02")?.is_sketch, 0, "post: flag cleared");
  assert.equal(result.repaired.length, 1);
  assert.equal(result.repaired[0]?.kind, "stale-sketch-flag");
  if (result.repaired[0]?.kind === "stale-sketch-flag") {
    assert.equal(result.repaired[0].mid, "M001");
    assert.equal(result.repaired[0].sid, "S02");
  }
});

test("ADR-017 (#5700): repair failure throws ReconciliationFailedError with shape", async () => {
  const seenDrift: DriftRecord = { kind: "stale-sketch-flag", mid: "M001", sid: "S02" };
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => [seenDrift],
    repair: () => {
      throw new Error("simulated repair failure");
    },
  };

  await assert.rejects(
    () =>
      reconcileBeforeDispatch("/project", {
        invalidateStateCache: () => {},
        deriveState: async () => makeState(),
        registry: [handler],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ReconciliationFailedError, "must be ReconciliationFailedError");
      assert.equal(err.failures.length, 1);
      assert.equal(err.failures[0]?.drift.kind, "stale-sketch-flag");
      assert.ok(err.failures[0]?.cause instanceof Error);
      assert.equal((err.failures[0]?.cause as Error).message, "simulated repair failure");
      assert.equal(err.pass, 0);
      assert.equal(err.persistentDrift.length, 0);
      return true;
    },
  );
});

test("ADR-017 (#5700): detector failure throws ReconciliationFailedError with shape", async () => {
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => {
      throw new Error("simulated detect failure");
    },
    repair: () => {
      /* detect fails before repair */
    },
  };

  await assert.rejects(
    () =>
      reconcileBeforeDispatch("/project", {
        invalidateStateCache: () => {},
        deriveState: async () => makeState(),
        registry: [handler],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ReconciliationFailedError, "must be ReconciliationFailedError");
      assert.equal(err.failures.length, 1);
      assert.equal(err.failures[0]?.drift.kind, "stale-sketch-flag");
      assert.ok(err.failures[0]?.cause instanceof Error);
      assert.equal((err.failures[0]?.cause as Error).message, "simulated detect failure");
      assert.equal(err.pass, 0);
      assert.equal(err.detectionFailures.length, 0);
      assert.equal(err.persistentDrift.length, 0);
      return true;
    },
  );
});

test("ADR-017 (#5700): persistent drift after cap=2 throws ReconciliationFailedError", async () => {
  // Detect always returns one drift; repair is a no-op (drift never goes away).
  const persistent: DriftRecord = { kind: "stale-sketch-flag", mid: "M001", sid: "S02" };
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => [persistent],
    repair: () => {
      /* no-op: drift cannot be cleared */
    },
  };

  await assert.rejects(
    () =>
      reconcileBeforeDispatch("/project", {
        invalidateStateCache: () => {},
        deriveState: async () => makeState(),
        registry: [handler],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ReconciliationFailedError);
      assert.equal(err.failures.length, 0);
      assert.equal(err.persistentDrift.length, 1);
      assert.equal(err.persistentDrift[0]?.kind, "stale-sketch-flag");
      return true;
    },
  );
});

test("ADR-017 (#5700): classifyFailure recognizes ReconciliationFailedError", () => {
  const err = new ReconciliationFailedError({
    failures: [
      {
        drift: { kind: "stale-sketch-flag", mid: "M001", sid: "S02" },
        cause: new Error("boom"),
      },
    ],
    pass: 0,
  });

  const result = classifyFailure({ error: err });

  assert.equal(result.failureKind, "reconciliation-drift");
  assert.equal(result.action, "escalate");
  assert.equal(result.exitReason, "reconciliation-drift");
  assert.match(result.remediation, /persistent or repair-failed drift kinds/);
});

// ─── #5701: merge-state drift ────────────────────────────────────────────────

function makeGitBase(): string {
  const base = join(tmpdir(), `gsd-adr017-merge-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, ".gitkeep"), "");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: base, stdio: "ignore" });
  return base;
}

function rmTreeQuiet(base: string): void {
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

test("ADR-017 (#5701): merge-state drift detected and repaired end-to-end", async (t) => {
  const base = makeGitBase();
  t.after(() => rmTreeQuiet(base));

  // Build a clean fast-forward-resolvable merge: feature branch with one file,
  // then start merge --no-commit on main so MERGE_HEAD exists with no conflicts.
  execFileSync("git", ["checkout", "-b", "feature"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, "feature.txt"), "feature content");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "add feature"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["merge", "--no-ff", "--no-commit", "feature"], { cwd: base, stdio: "ignore" });

  assert.ok(existsSync(join(base, ".git", "MERGE_HEAD")), "pre: MERGE_HEAD exists");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    existsSync(join(base, ".git", "MERGE_HEAD")),
    false,
    "post: MERGE_HEAD cleared after reconciliation",
  );
  const mergeRepaired = result.repaired.find((d) => d.kind === "unmerged-merge-state");
  assert.ok(mergeRepaired, "repaired list should include the merge-state drift record");
  if (mergeRepaired?.kind === "unmerged-merge-state") {
    assert.equal(mergeRepaired.basePath, base);
  }
});

test("ADR-017 (#5701): merge-state drift is detected in linked worktrees", async (t) => {
  const base = makeGitBase();
  const worktree = join(tmpdir(), `gsd-adr017-worktree-${randomUUID()}`);
  t.after(() => {
    rmTreeQuiet(worktree);
    rmTreeQuiet(base);
  });

  execFileSync("git", ["checkout", "-b", "feature"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, "feature.txt"), "feature content");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "add feature"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["worktree", "add", "-b", "wt-main", worktree, "main"], {
    cwd: base,
    stdio: "ignore",
  });
  execFileSync("git", ["merge", "--no-ff", "--no-commit", "feature"], {
    cwd: worktree,
    stdio: "ignore",
  });

  const mergeHeadPath = execFileSync("git", ["rev-parse", "--git-path", "MERGE_HEAD"], {
    cwd: worktree,
    encoding: "utf-8",
  }).trim();
  assert.ok(existsSync(mergeHeadPath), "pre: MERGE_HEAD exists in resolved worktree gitdir");
  assert.equal(existsSync(join(worktree, ".git", "MERGE_HEAD")), false);

  const result = await reconcileBeforeDispatch(worktree, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(existsSync(mergeHeadPath), false, "post: MERGE_HEAD cleared after reconciliation");
  assert.ok(
    result.repaired.some((d) => d.kind === "unmerged-merge-state"),
    "repaired list should include the worktree merge-state drift record",
  );
});

test("ADR-017 (#5701): no merge state → detector returns no drift", async (t) => {
  const base = makeGitBase();
  t.after(() => rmTreeQuiet(base));

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.repaired.some((d) => d.kind === "unmerged-merge-state"),
    false,
    "no merge drift should be reported when the repo is clean",
  );
});

// ─── #5702: stale-render drift ───────────────────────────────────────────────

function clearRendererCaches(): void {
  clearParseCache();
  clearPathCache();
  invalidateStateCache();
}

function makeStalePlanContent(sliceId: string, tasks: Array<{ id: string; title: string; done: boolean }>): string {
  const lines: string[] = [];
  lines.push(`# ${sliceId}: Test Slice`);
  lines.push("");
  lines.push("**Goal:** Test slice goal");
  lines.push("**Demo:** Test demo");
  lines.push("");
  lines.push("## Must-Haves");
  lines.push("");
  lines.push("- Everything works");
  lines.push("");
  lines.push("## Tasks");
  lines.push("");
  for (const t of tasks) {
    const checkbox = t.done ? "[x]" : "[ ]";
    lines.push(`- ${checkbox} **${t.id}: ${t.title}** \`est:1h\``);
  }
  lines.push("");
  return lines.join("\n");
}

function makeStaleRoadmapContent(slices: Array<{ id: string; title: string; done: boolean }>): string {
  const lines: string[] = [];
  lines.push("# M001 Roadmap");
  lines.push("");
  lines.push("**Vision:** Test milestone");
  lines.push("");
  lines.push("## Slices");
  lines.push("");
  for (const s of slices) {
    const checkbox = s.done ? "[x]" : "[ ]";
    lines.push(`- ${checkbox} **${s.id}: ${s.title}** \`risk:medium\` \`depends:[]\``);
  }
  lines.push("");
  return lines.join("\n");
}

test("ADR-017 (#5702): stale-render drift detected and repaired end-to-end", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-render-"));
  const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(join(sliceDir, "tasks"), { recursive: true });
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmTreeQuiet(base);
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  clearRendererCaches();
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "pending" });
  insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "First task", status: "done" });
  insertTask({ id: "T02", sliceId: "S01", milestoneId: "M001", title: "Second task", status: "done" });

  // Plan with both tasks unchecked — DB says done, file disagrees.
  const planPath = join(sliceDir, "S01-PLAN.md");
  writeFileSync(planPath, makeStalePlanContent("S01", [
    { id: "T01", title: "First task", done: false },
    { id: "T02", title: "Second task", done: false },
  ]));
  clearRendererCaches();

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  const renderRepaired = result.repaired.find((d) => d.kind === "stale-render");
  assert.ok(renderRepaired, "repaired list should include the stale-render drift");

  const repairedContent = readFileSync(planPath, "utf-8");
  assert.match(repairedContent, /\[x\][^\n]*T01:/, "T01 checkbox should be checked after repair");
  assert.match(repairedContent, /\[x\][^\n]*T02:/, "T02 checkbox should be checked after repair");
});

test("ADR-017 (#5702): stale-render detector reason strings match repair contract", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-render-reasons-"));
  const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(join(sliceDir, "tasks"), { recursive: true });
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmTreeQuiet(base);
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  clearRendererCaches();
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "complete" });
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: "M001",
    title: "First task",
    status: "done",
    fullSummaryMd: "# T01 Summary\n",
  });
  setSliceSummaryMd("M001", "S01", "# S01 Summary\n", "# S01 UAT\n");

  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    makeStaleRoadmapContent([{ id: "S01", title: "Slice", done: false }]),
  );
  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    makeStalePlanContent("S01", [{ id: "T01", title: "First task", done: false }]),
  );
  clearRendererCaches();

  const reasons = detectStaleRenders(base).map((entry) => entry.reason).sort();

  assert.deepEqual(reasons, [
    "S01 is closed in DB but unchecked in roadmap",
    "S01 is complete with UAT in DB but UAT.md missing on disk",
    "S01 is complete with summary in DB but SUMMARY.md missing on disk",
    "T01 is complete with summary in DB but SUMMARY.md missing on disk",
    "T01 is done in DB but unchecked in plan",
  ].sort());
});

// ─── #5703: stale-worker drift ───────────────────────────────────────────────

const DEAD_PID = 999_999_999; // far above any realistic system PID; process.kill(pid, 0) → ESRCH

function writeFakeSessionLock(base: string, pid: number): string {
  const gsdDir = join(base, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  const lockFile = join(gsdDir, "auto.lock");
  // Mirror SessionLockData minimum shape
  writeFileSync(
    lockFile,
    JSON.stringify({
      pid,
      startedAt: new Date().toISOString(),
      unitType: "starting",
      unitId: "bootstrap",
    }),
  );
  // Also create the proper-lockfile directory artifact at <gsdDir>.lock
  mkdirSync(`${gsdDir}.lock`, { recursive: true });
  return lockFile;
}

test("ADR-017 (#5703): stale-worker drift detected and orphaned lock cleared", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-worker-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const lockFile = writeFakeSessionLock(base, DEAD_PID);
  assert.ok(existsSync(lockFile), "pre: lock file written");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(existsSync(lockFile), false, "post: orphaned lock file removed");
  const workerRepaired = result.repaired.find((d) => d.kind === "stale-worker");
  assert.ok(workerRepaired, "repaired list should include the stale-worker drift");
  if (workerRepaired?.kind === "stale-worker") {
    assert.equal(workerRepaired.pid, DEAD_PID);
  }
});

test("ADR-017 (#5703): live worker lock is not cleared", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-worker-live-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  // PID 1 (init/launchd): process.kill(1, 0) returns EPERM as non-root, which
  // isPidAlive correctly treats as alive. process.pid would be rejected by the
  // self-PID guard in isPidAlive (treated as not alive).
  const ALIVE_PID = 1;
  const lockFile = writeFakeSessionLock(base, ALIVE_PID);
  assert.ok(existsSync(lockFile), "pre: lock file written");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    existsSync(lockFile),
    true,
    "live lock must NOT be cleared (would steal the lock from a running session)",
  );
  assert.equal(
    result.repaired.some((d) => d.kind === "stale-worker"),
    false,
    "no stale-worker drift should be reported when the lock owner is alive",
  );
});

// ─── #5704: unregistered-milestone drift ────────────────────────────────────

test("ADR-017 (#5704): unregistered-milestone drift detected and DB row inserted", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-projmd-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M042");
  mkdirSync(milestoneDir, { recursive: true });
  // Roadmap with one slice — meaningful content, will be picked up by importer
  writeFileSync(
    join(milestoneDir, "M042-ROADMAP.md"),
    [
      "# M042: Test Milestone",
      "",
      "**Vision:** Verify unregistered-milestone drift",
      "",
      "## Slices",
      "",
      "- [ ] **S01: Foundation** `risk:medium` `depends:[]`",
      "",
    ].join("\n"),
  );
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  // Pre-condition: filesystem has the milestone, DB does NOT.
  assert.equal(getMilestone("M042"), null, "pre: DB has no row for M042");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.ok(getMilestone("M042"), "post: DB row inserted for M042");
  const milestoneRepaired = result.repaired.find(
    (d) => d.kind === "unregistered-milestone",
  );
  assert.ok(milestoneRepaired, "repaired list should include the unregistered-milestone drift");
  if (milestoneRepaired?.kind === "unregistered-milestone") {
    assert.equal(milestoneRepaired.milestoneId, "M042");
  }
});

test("ADR-017 (#5704): registered milestone (DB row present) → no drift", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-projmd-clean-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test",
      "",
      "**Vision:** Already-registered milestone",
      "",
      "## Slices",
      "",
      "- [ ] **S01: Slice** `risk:low` `depends:[]`",
      "",
    ].join("\n"),
  );
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.repaired.some((d) => d.kind === "unregistered-milestone"),
    false,
    "no drift should be reported when the milestone is already in the DB",
  );
});

// ─── #5705: roadmap-divergence drift ─────────────────────────────────────────

test("ADR-017 (#5705): roadmap-divergence drift detected and DB depends synced", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-roadmap-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  // ROADMAP.md declares S02 depends on [S01]
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test",
      "",
      "**Vision:** Verify roadmap-divergence drift",
      "",
      "## Slices",
      "",
      "- [ ] **S01: Foundation** `risk:medium` `depends:[]`",
      "- [ ] **S02: Feature** `risk:medium` `depends:[S01]`",
      "",
    ].join("\n"),
  );
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  // Seed DB with S02 depending on []  — diverges from ROADMAP.md
  insertSlice({ id: "S01", milestoneId: "M001", title: "Foundation", status: "pending", risk: "medium", depends: [], demo: "", sequence: 1 });
  insertSlice({ id: "S02", milestoneId: "M001", title: "Feature", status: "pending", risk: "medium", depends: [], demo: "", sequence: 2 });

  assert.deepEqual(getSlice("M001", "S02")?.depends, [], "pre: DB has S02.depends = []");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(getSlice("M001", "S02")?.depends, ["S01"], "post: DB depends matches ROADMAP.md");
  const roadmapRepaired = result.repaired.find((d) => d.kind === "roadmap-divergence");
  assert.ok(roadmapRepaired, "repaired list should include the roadmap-divergence drift");
  if (roadmapRepaired?.kind === "roadmap-divergence") {
    assert.equal(roadmapRepaired.milestoneId, "M001");
  }
});

test("ADR-017 (#5705): ROADMAP declares slice missing from DB → slice inserted and drift reported", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-roadmap-newslice-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  // ROADMAP.md declares S01 and S02; DB will only have S01.
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test",
      "",
      "**Vision:** Verify new-slice insertion via roadmap-divergence repair",
      "",
      "## Slices",
      "",
      "- [ ] **S01: Foundation** `risk:medium` `depends:[]`",
      "- [ ] **S02: Feature** `risk:medium` `depends:[S01]`",
      "",
    ].join("\n"),
  );
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  // Only insert S01 — S02 is intentionally absent from the DB.
  insertSlice({ id: "S01", milestoneId: "M001", title: "Foundation", status: "pending", risk: "medium", depends: [], demo: "", sequence: 1 });

  assert.equal(getSlice("M001", "S02"), null, "pre: S02 has no DB row");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  const s02 = getSlice("M001", "S02");
  assert.ok(s02, "post: S02 inserted into DB after repair");
  assert.equal(s02?.sequence, 2, "post: S02 sequence matches ROADMAP order");
  assert.deepEqual(s02?.depends, ["S01"], "post: S02 depends matches ROADMAP");
  const roadmapRepaired = result.repaired.find((d) => d.kind === "roadmap-divergence");
  assert.ok(roadmapRepaired, "repaired list should include the roadmap-divergence drift");
  if (roadmapRepaired?.kind === "roadmap-divergence") {
    assert.equal(roadmapRepaired.milestoneId, "M001");
  }
});

test("ADR-017 (#5705): in-sync ROADMAP and DB → no roadmap-divergence drift", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-roadmap-clean-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test",
      "",
      "**Vision:** Already in sync",
      "",
      "## Slices",
      "",
      "- [ ] **S01: Foundation** `risk:low` `depends:[]`",
      "",
    ].join("\n"),
  );
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Foundation", status: "pending", risk: "low", depends: [], demo: "", sequence: 1 });

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.repaired.some((d) => d.kind === "roadmap-divergence"),
    false,
    "no roadmap-divergence drift should be reported when DB matches markdown",
  );
});

// ─── #5706: missing-completion-timestamp drift ──────────────────────────────

test("ADR-017 (#5706): task with SUMMARY but null completed_at → backfilled", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-completion-task-"));
  const tasksDir = join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks");
  mkdirSync(tasksDir, { recursive: true });
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "pending", risk: "low", depends: [], demo: "", sequence: 1 });
  insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "Task", status: "pending" });

  // Move T01 to complete WITHOUT setting completed_at (simulating drift after
  // an external recovery path or a partial state migration).
  updateTaskStatus("M001", "S01", "T01", "complete", undefined);
  // SUMMARY.md attests to completion on disk.
  const summaryPath = join(tasksDir, "T01-SUMMARY.md");
  writeFileSync(summaryPath, "# T01 Summary\n");
  const summaryMtimeMs = statSync(summaryPath).mtime.getTime();

  const taskBefore = getSliceTasks("M001", "S01").find((t) => t.id === "T01");
  assert.equal(taskBefore?.status, "complete");
  assert.equal(taskBefore?.completed_at, null, "pre: completed_at is null");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState({ activeMilestone: { id: "M001", title: "Test" } }),
  });

  assert.equal(result.ok, true);
  const taskAfter = getSliceTasks("M001", "S01").find((t) => t.id === "T01");
  assert.ok(taskAfter?.completed_at, "post: completed_at populated");
  const completedAtMs = Date.parse(taskAfter?.completed_at ?? "");
  assert.ok(Number.isFinite(completedAtMs), "post: completed_at is parseable ISO string");
  assert.equal(completedAtMs, summaryMtimeMs, "post: completed_at derived from SUMMARY mtime");
  const drift = result.repaired.find((d) => d.kind === "missing-completion-timestamp");
  assert.ok(drift, "drift recorded");
  if (drift?.kind === "missing-completion-timestamp") {
    assert.equal(drift.entity, "task");
    assert.deepEqual(drift.ids, ["M001/S01/T01"]);
  }
});

test("ADR-017 (#5706): repair is idempotent — re-running preserves the timestamp", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-completion-idempotent-"));
  const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(sliceDir, { recursive: true });
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(base, { recursive: true, force: true });
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "pending", risk: "low", depends: [], demo: "", sequence: 1 });
  updateSliceStatus("M001", "S01", "complete", undefined);
  const summaryPath = join(sliceDir, "S01-SUMMARY.md");
  writeFileSync(summaryPath, "# S01 Summary\n");
  const summaryMtimeMs = statSync(summaryPath).mtime.getTime();

  const firstResult = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState({ activeMilestone: { id: "M001", title: "Test" } }),
  });
  assert.equal(firstResult.ok, true);
  const tsAfterFirst = getSlice("M001", "S01")?.completed_at;
  assert.ok(tsAfterFirst, "first pass: completed_at populated");
  const completedAtMs = Date.parse(tsAfterFirst ?? "");
  assert.ok(Number.isFinite(completedAtMs), "first pass: completed_at is parseable ISO string");
  assert.equal(completedAtMs, summaryMtimeMs, "first pass: completed_at derived from SUMMARY mtime");

  // Second pass — drift is already cleared, no record should appear, and
  // the existing timestamp is untouched.
  const secondResult = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState({ activeMilestone: { id: "M001", title: "Test" } }),
  });
  assert.equal(secondResult.ok, true);
  assert.equal(
    secondResult.repaired.some((d) => d.kind === "missing-completion-timestamp"),
    false,
    "second pass: no drift detected after first repair",
  );
  assert.equal(getSlice("M001", "S01")?.completed_at, tsAfterFirst, "timestamp unchanged");
});

// ─── #5707: caller closure (reconcileBeforeSpawn) ────────────────────────────

test("ADR-017 (#5707): reconcileBeforeSpawn returns ok=true on clean reconciliation", async () => {
  const result = await reconcileBeforeSpawn("/project", {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
    registry: [],
  });
  assert.equal(result.ok, true);
});

test("ADR-017 (#5707): reconcileBeforeSpawn surfaces blockers as ok=false", async () => {
  const result = await reconcileBeforeSpawn("/project", {
    invalidateStateCache: () => {},
    deriveState: async () => makeState({ phase: "blocked", blockers: ["lock missing"] }),
    registry: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /lock missing/);
  }
});

test("ADR-017 (#5707): reconcileBeforeSpawn catches ReconciliationFailedError → ok=false", async () => {
  const persistent: DriftRecord = { kind: "stale-sketch-flag", mid: "M001", sid: "S02" };
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => [persistent],
    repair: () => { /* no-op: drift cannot be cleared, persists past cap=2 */ },
  };

  const result = await reconcileBeforeSpawn("/project", {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
    registry: [handler],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.reason, /stale-sketch-flag/);
  }
});

test("ADR-017 (#5707): reconcileBeforeSpawn reports repaired drift in ok=true reason", async () => {
  let detectCalls = 0;
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => {
      detectCalls++;
      return detectCalls === 1
        ? [{ kind: "stale-sketch-flag", mid: "M001", sid: "S02" }]
        : [];
    },
    repair: () => { /* repair "succeeds" — second detect returns empty */ },
  };

  const result = await reconcileBeforeSpawn("/project", {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
    registry: [handler],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.reason ?? "", /stale-sketch-flag/);
  }
});

// ─── Lifecycle and classification ────────────────────────────────────────────

test("ADR-017 (#5700): cascading drift triggers second pass within cap", async () => {
  // First pass detects drift A; repair "fixes" it. Second pass detects drift B
  // (cascading); repair fixes it. Third call would see no drift. Cap=2 means
  // we have exactly two repair passes available.
  const detectedSequence: DriftRecord[][] = [
    [{ kind: "stale-sketch-flag", mid: "M001", sid: "S02" }],
    [{ kind: "stale-sketch-flag", mid: "M001", sid: "S03" }],
    [],
  ];
  let detectCallIdx = 0;
  const repaired: DriftRecord[] = [];

  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => detectedSequence[detectCallIdx++] ?? [],
    repair: (record) => {
      repaired.push(record);
    },
  };

  const result = await reconcileBeforeDispatch("/project", {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
    registry: [handler],
  });

  assert.equal(result.ok, true);
  assert.equal(result.repaired.length, 2, "both passes' repairs collected");
  assert.equal(repaired.length, 2);
});
