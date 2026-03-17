import test from "node:test";
import assert from "node:assert/strict";
import {
  collectDiagnosticSignals,
  classifyStuckVsActive,
  buildDiagnosticSteeringContent,
  formatDiagnosticReport,
  type DiagnosticSignals,
  type BgShellHealthEntry,
  type CollectDiagnosticSignalsOptions,
  type StuckClassification,
} from "../auto-supervisor.js";
import type { AutoUnitRuntimeRecord } from "../unit-runtime.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRuntime(overrides: Partial<AutoUnitRuntimeRecord> = {}): AutoUnitRuntimeRecord {
  return {
    version: 1,
    unitType: "execute-task",
    unitId: "T01",
    startedAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    phase: "dispatched",
    wrapupWarningSent: false,
    continueHereFired: false,
    timeoutAt: null,
    lastProgressAt: Date.now() - 5_000,
    progressCount: 12,
    lastProgressKind: "tool-call",
    recoveryAttempts: 0,
    ...overrides,
  };
}

function makeProcessMap(
  entries: Array<{
    id: string;
    label?: string;
    status?: string;
    alive?: boolean;
    exitCode?: number | null;
    signal?: string | null;
    recentErrors?: string[];
  }>,
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const e of entries) {
    map.set(e.id, e);
  }
  return map;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("collectDiagnosticSignals returns complete structure when all sources provide data", async () => {
  const runtime = makeRuntime({ progressCount: 15, lastProgressKind: "tool-call", recoveryAttempts: 1 });

  const processMap = makeProcessMap([
    { id: "p1", label: "dev-server", status: "running", alive: true },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => "Tool calls completed: 42\nFiles written: `foo.ts`",
    getGitStatusFn: () => " M src/foo.ts\n?? src/bar.ts",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base",
    "execute-task",
    "T01",
    runtime,
    2,
    3500,
    options,
  );

  // Structure completeness
  assert.equal(typeof signals.traceSummary, "string");
  assert.ok(signals.traceSummary!.includes("Tool calls completed: 42"));
  assert.ok(Array.isArray(signals.bgShellHealth));
  assert.equal(signals.bgShellHealth!.length, 0); // healthy processes not included
  assert.equal(typeof signals.gitStatus, "string");
  assert.ok(signals.gitStatus!.includes("M src/foo.ts"));
  assert.equal(typeof signals.msSinceLastProgress, "number");
  assert.equal(signals.progressCount, 15);
  assert.equal(signals.lastProgressKind, "tool-call");
  assert.equal(signals.recoveryAttempts, 1);
  assert.equal(signals.inFlightToolCount, 2);
  assert.equal(signals.oldestInFlightToolAgeMs, 3500);
});

test("deep diagnostic source failure → traceSummary is null, rest still populated", async () => {
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => new Map(),
    getDeepDiagnosticFn: () => { throw new Error("session file corrupted"); },
    getGitStatusFn: () => " M file.ts",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.equal(signals.traceSummary, null);
  assert.equal(typeof signals.gitStatus, "string");
  assert.ok(Array.isArray(signals.bgShellHealth));
});

test("bg-shell source failure → bgShellHealth is null, rest still populated", async () => {
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => { throw new Error("process-manager not available"); },
    getDeepDiagnosticFn: () => "trace data",
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.equal(signals.bgShellHealth, null);
  assert.equal(signals.traceSummary, "trace data");
});

test("git status source failure → gitStatus is null, rest still populated", async () => {
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => new Map(),
    getDeepDiagnosticFn: () => "trace data",
    getGitStatusFn: () => { throw new Error("not a git repo"); },
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.equal(signals.gitStatus, null);
  assert.equal(signals.traceSummary, "trace data");
});

test("all sources fail → returns valid DiagnosticSignals with null fields", async () => {
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => { throw new Error("fail"); },
    getDeepDiagnosticFn: () => { throw new Error("fail"); },
    getGitStatusFn: () => { throw new Error("fail"); },
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", null, 0, null, options,
  );

  assert.equal(signals.traceSummary, null);
  assert.equal(signals.bgShellHealth, null);
  assert.equal(signals.gitStatus, null);
  assert.equal(signals.msSinceLastProgress, null);
  assert.equal(signals.progressCount, null);
  assert.equal(signals.lastProgressKind, null);
  assert.equal(signals.recoveryAttempts, null);
  assert.equal(signals.inFlightToolCount, 0);
  assert.equal(signals.oldestInFlightToolAgeMs, null);
});

test("null runtime produces valid signals with null temporal fields", async () => {
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => new Map(),
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", null, 1, 500, options,
  );

  assert.equal(signals.msSinceLastProgress, null);
  assert.equal(signals.progressCount, null);
  assert.equal(signals.lastProgressKind, null);
  assert.equal(signals.recoveryAttempts, null);
  // In-flight data still passed through
  assert.equal(signals.inFlightToolCount, 1);
  assert.equal(signals.oldestInFlightToolAgeMs, 500);
});

test("bg-shell scanning finds crashed process (fatal signal)", async () => {
  const processMap = makeProcessMap([
    { id: "srv", label: "build-server", status: "running", alive: false, signal: "SIGSEGV", exitCode: null },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.ok(signals.bgShellHealth);
  assert.equal(signals.bgShellHealth!.length, 1);
  assert.equal(signals.bgShellHealth![0]!.status, "crashed");
  assert.equal(signals.bgShellHealth![0]!.name, "build-server");
  assert.equal(signals.bgShellHealth![0]!.signal, "SIGSEGV");
});

test("bg-shell scanning finds crashed process (crashed status)", async () => {
  const processMap = makeProcessMap([
    { id: "watcher", label: "file-watcher", status: "crashed", alive: false, exitCode: 1 },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.ok(signals.bgShellHealth);
  assert.equal(signals.bgShellHealth!.length, 1);
  assert.equal(signals.bgShellHealth![0]!.status, "crashed");
  assert.equal(signals.bgShellHealth![0]!.exitCode, 1);
});

test("bg-shell scanning finds crashed process (non-zero exit, dead)", async () => {
  const processMap = makeProcessMap([
    { id: "build", label: "build-cmd", status: "exited", alive: false, exitCode: 127 },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.ok(signals.bgShellHealth);
  assert.equal(signals.bgShellHealth!.length, 1);
  assert.equal(signals.bgShellHealth![0]!.status, "crashed");
  assert.equal(signals.bgShellHealth![0]!.exitCode, 127);
});

test("bg-shell scanning finds errored process (alive with recent errors)", async () => {
  const processMap = makeProcessMap([
    { id: "dev", label: "dev-server", status: "running", alive: true, recentErrors: ["ECONNREFUSED", "timeout"] },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.ok(signals.bgShellHealth);
  assert.equal(signals.bgShellHealth!.length, 1);
  assert.equal(signals.bgShellHealth![0]!.status, "errored");
  assert.deepEqual(signals.bgShellHealth![0]!.recentErrors, ["ECONNREFUSED", "timeout"]);
});

test("bg-shell scanning skips healthy processes", async () => {
  const processMap = makeProcessMap([
    { id: "ok1", label: "healthy-server", status: "running", alive: true },
    { id: "ok2", label: "healthy-watcher", status: "running", alive: true, exitCode: null },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.ok(signals.bgShellHealth);
  assert.equal(signals.bgShellHealth!.length, 0);
});

test("empty git status string → gitStatus is null", async () => {
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => new Map(),
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.equal(signals.gitStatus, null);
});

test("runtime with lastProgressAt=0 → msSinceLastProgress is null", async () => {
  const runtime = makeRuntime({ lastProgressAt: 0 });
  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => new Map(),
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", runtime, 0, null, options,
  );

  // lastProgressAt is 0 (falsy), so msSinceLastProgress should be null
  assert.equal(signals.msSinceLastProgress, null);
});

test("mixed bg-shell processes: one crashed, one healthy, one errored", async () => {
  const processMap = makeProcessMap([
    { id: "crashed", label: "build", status: "crashed", alive: false, exitCode: 1 },
    { id: "healthy", label: "server", status: "running", alive: true },
    { id: "errored", label: "watcher", status: "running", alive: true, recentErrors: ["timeout"] },
  ]);

  const options: CollectDiagnosticSignalsOptions = {
    getProcesses: () => processMap,
    getDeepDiagnosticFn: () => null,
    getGitStatusFn: () => "",
  };

  const signals = await collectDiagnosticSignals(
    "/fake/base", "execute-task", "T01", makeRuntime(), 0, null, options,
  );

  assert.ok(signals.bgShellHealth);
  assert.equal(signals.bgShellHealth!.length, 2); // crashed + errored, not healthy
  const statuses = signals.bgShellHealth!.map((e) => e.status).sort();
  assert.deepEqual(statuses, ["crashed", "errored"]);
});

// ─── Classification Helpers ───────────────────────────────────────────────────

function makeSignals(overrides: Partial<DiagnosticSignals> = {}): DiagnosticSignals {
  return {
    traceSummary: null,
    bgShellHealth: null,
    gitStatus: null,
    msSinceLastProgress: null,
    progressCount: null,
    lastProgressKind: null,
    recoveryAttempts: null,
    inFlightToolCount: 0,
    oldestInFlightToolAgeMs: null,
    ...overrides,
  };
}

// ─── classifyStuckVsActive Tests ──────────────────────────────────────────────

test("classify: active — recent progress + trace present", () => {
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: 15_000, // 15s — well within 60s threshold
    traceSummary: "Tool calls completed: 12\nbash: npm test",
    gitStatus: " M src/foo.ts",
  }));

  assert.equal(result.classification, "active");
  assert.ok(result.confidence >= 0.7);
  assert.ok(result.findings.some((f) => f.category === "tool-activity"));
});

test("classify: active — recent progress + git changes, no trace", () => {
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: 30_000,
    gitStatus: " M src/bar.ts\n?? new-file.ts",
  }));

  assert.equal(result.classification, "active");
  assert.ok(result.confidence >= 0.7);
});

test("classify: stuck/crash — crashed bg-shell process with exit code", () => {
  const result = classifyStuckVsActive(makeSignals({
    bgShellHealth: [
      { id: "srv", name: "dev-server", status: "crashed", exitCode: 1, signal: null },
    ],
  }));

  assert.equal(result.classification, "stuck/crash");
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.findings.some((f) =>
    f.severity === "crash" && f.message.includes("exit code 1"),
  ));
});

test("classify: stuck/crash — process received fatal signal", () => {
  const result = classifyStuckVsActive(makeSignals({
    bgShellHealth: [
      { id: "srv", name: "build-server", status: "crashed", exitCode: null, signal: "SIGSEGV" },
    ],
  }));

  assert.equal(result.classification, "stuck/crash");
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.findings.some((f) =>
    f.severity === "crash" && f.message.includes("SIGSEGV"),
  ));
});

test("classify: stuck/read-loop — trace shows repeated reads", () => {
  const result = classifyStuckVsActive(makeSignals({
    traceSummary: "read ×5 src/auto-supervisor.ts\nedit ×0\nbash ×1",
    msSinceLastProgress: 120_000,
  }));

  assert.equal(result.classification, "stuck/read-loop");
  assert.ok(result.confidence >= 0.8);
  assert.ok(result.findings.some((f) => f.message.includes("reading the same file")));
});

test("classify: stuck/read-loop — low count (×2) is not enough", () => {
  const result = classifyStuckVsActive(makeSignals({
    traceSummary: "read ×2 src/foo.ts\nbash ×1 npm test",
    msSinceLastProgress: 120_000,
  }));

  // ×2 is below threshold of ×3, so should NOT be read-loop
  assert.notEqual(result.classification, "stuck/read-loop");
});

test("classify: stuck/error-loop — trace shows repeated failures", () => {
  const result = classifyStuckVsActive(makeSignals({
    traceSummary: "bash: npm test → exit code 1\nbash: npm test → exit code 1\nbash: npm test → exit code 1",
    msSinceLastProgress: 90_000,
  }));

  assert.equal(result.classification, "stuck/error-loop");
  assert.ok(result.confidence >= 0.8);
  assert.ok(result.findings.some((f) => f.message.includes("failed repeatedly")));
});

test("classify: stuck/error-loop — alternative pattern with ×N", () => {
  const result = classifyStuckVsActive(makeSignals({
    traceSummary: "failed ×4 similar commands",
    msSinceLastProgress: 90_000,
  }));

  assert.equal(result.classification, "stuck/error-loop");
  assert.ok(result.confidence >= 0.8);
});

test("classify: stuck/no-progress — stale progress, no trace, no git, no tools", () => {
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: 120_000,
    bgShellHealth: [],
    gitStatus: null,
    traceSummary: null,
    inFlightToolCount: 0,
  }));

  assert.equal(result.classification, "stuck/no-progress");
  assert.ok(result.confidence >= 0.9);
  assert.ok(result.findings.some((f) => f.message.includes("No tool activity")));
});

test("classify: stuck/no-progress — null msSinceLastProgress counts as stale", () => {
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: null,
    bgShellHealth: [],
    gitStatus: null,
    traceSummary: null,
    inFlightToolCount: 0,
  }));

  assert.equal(result.classification, "stuck/no-progress");
  assert.ok(result.confidence >= 0.9);
});

test("classify: ambiguous — all-null signals", () => {
  const result = classifyStuckVsActive(makeSignals());

  assert.equal(result.classification, "ambiguous");
  assert.ok(result.confidence <= 0.5);
  assert.ok(result.findings.some((f) => f.message.includes("Insufficient signals")));
});

test("classify: ambiguous — mixed signals, no clear pattern", () => {
  // Has some git changes but stale progress and no trace — not enough for "active"
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: 120_000, // stale
    gitStatus: " M src/foo.ts", // present, but stale progress means not "active"
    bgShellHealth: [],
  }));

  // Has git changes but stale progress — ambiguous (git changes alone don't mean active
  // when there's no recent progress)
  assert.equal(result.classification, "ambiguous");
  assert.ok(result.confidence <= 0.5);
});

test("classify: temporal weighting — stale progress with git changes is NOT active", () => {
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: 300_000, // 5 minutes — very stale
    gitStatus: " M src/foo.ts\n M src/bar.ts",
    traceSummary: "Some old trace data",
    bgShellHealth: [],
  }));

  // Despite having git changes AND trace, stale progress prevents "active"
  assert.notEqual(result.classification, "active");
});

test("classify: crash takes priority over error loop", () => {
  const result = classifyStuckVsActive(makeSignals({
    bgShellHealth: [
      { id: "srv", name: "dev-server", status: "crashed", exitCode: 1, signal: null },
    ],
    traceSummary: "bash: npm test → exit code 1\nbash: npm test → exit code 1",
    msSinceLastProgress: 90_000,
  }));

  // Both crash AND error-loop findings present, but classification is crash (highest priority)
  assert.equal(result.classification, "stuck/crash");
  assert.ok(result.findings.some((f) => f.severity === "crash"));
  assert.ok(result.findings.some((f) => f.message.includes("failed repeatedly")));
});

test("classify: in-flight tools prevent no-progress", () => {
  const result = classifyStuckVsActive(makeSignals({
    msSinceLastProgress: 120_000,
    bgShellHealth: [],
    gitStatus: null,
    traceSummary: null,
    inFlightToolCount: 2, // tools in flight
    oldestInFlightToolAgeMs: 5_000,
  }));

  // Has in-flight tools, so shouldn't be "no-progress"
  assert.notEqual(result.classification, "stuck/no-progress");
});

// ─── buildDiagnosticSteeringContent Tests ─────────────────────────────────────

test("steering: crash finding produces restart guidance", () => {
  const classification: StuckClassification = {
    classification: "stuck/crash",
    confidence: 0.95,
    findings: [
      { category: "bg-shell", message: "Process 'dev-server' crashed with exit code 1", severity: "crash" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T01");

  assert.ok(content.includes("dev-server"));
  assert.ok(content.includes("crashed"));
  assert.ok(content.includes("restart or fix"));
  assert.ok(content.length <= 500);
});

test("steering: read loop finding produces change guidance", () => {
  const classification: StuckClassification = {
    classification: "stuck/read-loop",
    confidence: 0.8,
    findings: [
      { category: "trace", message: "Agent appears to be reading the same file(s) repeatedly", severity: "warning" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T02");

  assert.ok(content.includes("reading the same files"));
  assert.ok(content.includes("Identify the specific change"));
  assert.ok(content.length <= 500);
});

test("steering: error loop finding produces different-approach guidance", () => {
  const classification: StuckClassification = {
    classification: "stuck/error-loop",
    confidence: 0.85,
    findings: [
      { category: "trace", message: "Last commands failed repeatedly with similar errors", severity: "error" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T03");

  assert.ok(content.includes("failing repeatedly"));
  assert.ok(content.includes("different approach"));
  assert.ok(content.length <= 500);
});

test("steering: no-progress finding produces blocker guidance", () => {
  const classification: StuckClassification = {
    classification: "stuck/no-progress",
    confidence: 0.9,
    findings: [
      { category: "temporal", message: "No tool activity or file changes detected", severity: "warning" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T04");

  assert.ok(content.includes("No tool activity detected"));
  assert.ok(content.includes("explain the blocker"));
  assert.ok(content.length <= 500);
});

test("steering: active classification produces no corrective text", () => {
  const classification: StuckClassification = {
    classification: "active",
    confidence: 0.8,
    findings: [
      { category: "tool-activity", message: "Agent is actively working (recent progress detected)", severity: "info" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T05");

  assert.ok(content.includes("active"));
  // No corrective guidance lines
  assert.ok(!content.includes("crashed"));
  assert.ok(!content.includes("failing repeatedly"));
  assert.ok(!content.includes("reading the same files"));
  assert.ok(content.length <= 500);
});

test("steering: ambiguous produces only the header", () => {
  const classification: StuckClassification = {
    classification: "ambiguous",
    confidence: 0.3,
    findings: [
      { category: "temporal", message: "Insufficient signals for definitive classification", severity: "info" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T06");

  assert.ok(content.includes("ambiguous"));
  assert.ok(content.length <= 500);
});

test("steering: content is capped at 500 chars", () => {
  // Create a classification with many findings to test truncation
  const classification: StuckClassification = {
    classification: "stuck/crash",
    confidence: 0.95,
    findings: [
      { category: "bg-shell", message: "Process 'server-one-with-a-very-long-name' crashed with exit code 1", severity: "crash" },
      { category: "bg-shell", message: "Process 'server-two-with-a-very-long-name' crashed with exit code 2", severity: "crash" },
      { category: "bg-shell", message: "Process 'server-three-with-a-very-long-name' crashed with exit code 3", severity: "crash" },
      { category: "trace", message: "Last commands failed repeatedly with similar errors", severity: "error" },
      { category: "trace", message: "Agent appears to be reading the same file(s) repeatedly", severity: "warning" },
      { category: "temporal", message: "No tool activity or file changes detected", severity: "warning" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T07");
  assert.ok(content.length <= 500, `Steering content too long: ${content.length} chars`);
});

// ─── formatDiagnosticReport Tests ─────────────────────────────────────────────

test("formatDiagnosticReport produces well-formed markdown with all sections", () => {
  const signals = makeSignals({
    traceSummary: "Tool calls completed: 12\nFiles written: `foo.ts`",
    bgShellHealth: [
      { id: "srv", name: "dev-server", status: "crashed", exitCode: 1, signal: null },
    ],
    gitStatus: " M src/foo.ts\n?? src/bar.ts",
    msSinceLastProgress: 90_000,
    progressCount: 15,
    lastProgressKind: "tool-call",
    recoveryAttempts: 2,
    inFlightToolCount: 1,
    oldestInFlightToolAgeMs: 5_000,
  });

  const classification: StuckClassification = {
    classification: "stuck/crash",
    confidence: 0.95,
    findings: [
      { category: "bg-shell", message: "Process 'dev-server' crashed with exit code 1", severity: "crash" },
      { category: "trace", message: "Last commands failed repeatedly with similar errors", severity: "error" },
    ],
  };

  const report = formatDiagnosticReport(signals, classification, "execute-task", "M001/S01/T01");

  // Header section
  assert.ok(report.includes("# Diagnostic Report: execute-task/M001/S01/T01"));
  assert.ok(report.includes("**Generated:**"));
  assert.ok(report.includes("**Unit:** execute-task M001/S01/T01"));

  // Classification section
  assert.ok(report.includes("## Classification"));
  assert.ok(report.includes("**Result:** stuck/crash"));
  assert.ok(report.includes("**Confidence:** 0.95"));

  // Findings table
  assert.ok(report.includes("## Findings"));
  assert.ok(report.includes("| Category | Severity | Message |"));
  assert.ok(report.includes("| bg-shell | crash | Process 'dev-server' crashed with exit code 1 |"));
  assert.ok(report.includes("| trace | error | Last commands failed repeatedly with similar errors |"));

  // Signal summary
  assert.ok(report.includes("## Signal Summary"));
  assert.ok(report.includes("**Trace available:** yes"));
  assert.ok(report.includes("**bg-shell processes:** 1 unhealthy"));
  assert.ok(report.includes("dev-server: crashed (exit=1)"));
  assert.ok(report.includes("**Git status:** changes detected"));
  assert.ok(report.includes("**In-flight tools:** 1 (oldest: 5s)"));
  assert.ok(report.includes("**Time since last progress:** 90s"));
  assert.ok(report.includes("**Progress count:** 15"));
  assert.ok(report.includes("**Last progress kind:** tool-call"));
  assert.ok(report.includes("**Recovery attempts:** 2"));
});

test("formatDiagnosticReport handles all-null signals gracefully", () => {
  const signals = makeSignals();

  const classification: StuckClassification = {
    classification: "ambiguous",
    confidence: 0.3,
    findings: [
      { category: "temporal", message: "Insufficient signals for definitive classification", severity: "info" },
    ],
  };

  const report = formatDiagnosticReport(signals, classification, "research-milestone", "M002");

  assert.ok(report.includes("# Diagnostic Report: research-milestone/M002"));
  assert.ok(report.includes("**Result:** ambiguous"));
  assert.ok(report.includes("**Trace available:** no"));
  assert.ok(report.includes("**bg-shell processes:** unavailable"));
  assert.ok(report.includes("**Git status:** no changes or unavailable"));
  assert.ok(report.includes("**In-flight tools:** 0"));
  assert.ok(report.includes("**Time since last progress:** unknown"));
  assert.ok(report.includes("**Progress count:** unknown"));
  assert.ok(report.includes("**Recovery attempts:** unknown"));
});

test("formatDiagnosticReport shows empty findings as _No findings._", () => {
  const signals = makeSignals({ msSinceLastProgress: 10_000, traceSummary: "some trace" });
  const classification: StuckClassification = {
    classification: "active",
    confidence: 0.8,
    findings: [],
  };

  const report = formatDiagnosticReport(signals, classification, "execute-task", "T01");
  assert.ok(report.includes("_No findings._"));
});

test("formatDiagnosticReport truncates long trace summaries", () => {
  const longTrace = "x".repeat(500);
  const signals = makeSignals({ traceSummary: longTrace });

  const classification: StuckClassification = {
    classification: "ambiguous",
    confidence: 0.3,
    findings: [],
  };

  const report = formatDiagnosticReport(signals, classification, "execute-task", "T01");
  assert.ok(report.includes("**Trace excerpt:**"));
  // Should be truncated to 200 chars + "..."
  assert.ok(report.includes("..."));
  // Full 500-char trace should NOT appear
  assert.ok(!report.includes(longTrace));
});

test("formatDiagnosticReport includes bg-shell process details with signal", () => {
  const signals = makeSignals({
    bgShellHealth: [
      { id: "srv", name: "build-server", status: "crashed", exitCode: null, signal: "SIGSEGV" },
    ],
  });

  const classification: StuckClassification = {
    classification: "stuck/crash",
    confidence: 0.95,
    findings: [
      { category: "bg-shell", message: "Process 'build-server' received signal SIGSEGV", severity: "crash" },
    ],
  };

  const report = formatDiagnosticReport(signals, classification, "execute-task", "T01");
  assert.ok(report.includes("build-server: crashed (signal=SIGSEGV)"));
});

// ─── Diagnostic steering differs from generic text ────────────────────────────

test("steering: stuck classification produces different text than ambiguous", () => {
  const stuckClassification: StuckClassification = {
    classification: "stuck/crash",
    confidence: 0.95,
    findings: [
      { category: "bg-shell", message: "Process 'dev-server' crashed with exit code 1", severity: "crash" },
    ],
  };

  const ambiguousClassification: StuckClassification = {
    classification: "ambiguous",
    confidence: 0.3,
    findings: [
      { category: "temporal", message: "Insufficient signals for definitive classification", severity: "info" },
    ],
  };

  const stuckContent = buildDiagnosticSteeringContent(stuckClassification, "execute-task", "T01");
  const ambiguousContent = buildDiagnosticSteeringContent(ambiguousClassification, "execute-task", "T01");

  // Stuck content should have corrective guidance
  assert.ok(stuckContent.includes("crashed"));
  assert.ok(stuckContent.includes("restart or fix"));

  // Ambiguous content should only have the header
  assert.ok(ambiguousContent.includes("ambiguous"));
  assert.ok(!ambiguousContent.includes("restart or fix"));
  assert.ok(!ambiguousContent.includes("reading the same files"));
  assert.ok(!ambiguousContent.includes("failing repeatedly"));

  // They should be meaningfully different
  assert.notEqual(stuckContent, ambiguousContent);
});

// ─── Backward compatibility: ambiguous falls through to generic behavior ──────

test("ambiguous classification produces no actionable steering beyond header", () => {
  const classification: StuckClassification = {
    classification: "ambiguous",
    confidence: 0.3,
    findings: [
      { category: "temporal", message: "Insufficient signals for definitive classification", severity: "info" },
    ],
  };

  const content = buildDiagnosticSteeringContent(classification, "execute-task", "T01");

  // Should only contain the classification header line
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  assert.equal(lines.length, 1, "Ambiguous should produce only the header line");
  assert.ok(lines[0]!.includes("ambiguous"));
});
