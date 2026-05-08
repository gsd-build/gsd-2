// Project/App: GSD-2
// File Purpose: Unit tests for pure auto-mode workflow kernel decisions.

import assert from "node:assert/strict";
import test from "node:test";

import {
  decideCooldownRecovery,
  decideCustomEngineRecovery,
  decideCustomEngineVerifyRetry,
  decideDispatchNodeKind,
  decideDispatchClaim,
  decideEngineDispatch,
  decideEngineReconcile,
  decideFinalizeResult,
  decideInfrastructureError,
  decideIterationErrorRecovery,
  decideMemoryPressure,
  decideModelPolicyBlocked,
  decideMinRequestInterval,
  decideWorkflowLoop,
  formatDispatchExceptionSummary,
  formatUnhandledDispatchErrorSummary,
  resolveUnitRequestTimestamp,
  shouldUseCustomEnginePath,
} from "../auto/workflow-kernel.ts";

test("decideWorkflowLoop continues when dispatch preconditions are valid", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    { action: "continue" },
  );
});

test("decideWorkflowLoop stops inactive sessions before dispatch", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: false,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "inactive",
      message: "Auto-mode is not active.",
    },
  );
});

test("decideWorkflowLoop stops runaway loops with a stable reason", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 501,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "max-iterations",
      message: "Safety: loop exceeded 500 iterations.",
    },
  );
});

test("decideWorkflowLoop stops when dispatch cannot create a command session", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: false,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "missing-command-context",
      message: "Auto-mode has no command context for dispatch.",
    },
  );
});

test("decideWorkflowLoop preserves session lock loss detail", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: false,
      sessionLockReason: "pid mismatch",
    }),
    {
      action: "stop",
      reason: "session-lock-lost",
      message: "Session lock lost: pid mismatch.",
    },
  );
});

test("decideDispatchClaim runs with an opened dispatch id", () => {
  assert.deepEqual(
    decideDispatchClaim({ kind: "opened", dispatchId: 42 }),
    { action: "run", dispatchId: 42 },
  );
});

test("decideDispatchClaim runs degraded dispatches without a ledger id", () => {
  assert.deepEqual(
    decideDispatchClaim({ kind: "degraded" }),
    { action: "run", dispatchId: null },
  );
});

test("decideDispatchClaim skips claimed units with a stable reason", () => {
  assert.deepEqual(
    decideDispatchClaim({ kind: "skip", reason: "already-active" }),
    { action: "skip", reason: "already-active" },
  );
});

test("decideEngineDispatch preserves stop reasons and defaults missing ones", () => {
  assert.deepEqual(
    decideEngineDispatch({ action: "stop", reason: "done" }),
    { action: "stop", reason: "done" },
  );
  assert.deepEqual(
    decideEngineDispatch({ action: "stop" }),
    { action: "stop", reason: "Engine stopped" },
  );
});

test("decideEngineDispatch passes through skip and dispatch actions", () => {
  assert.deepEqual(decideEngineDispatch({ action: "skip" }), { action: "skip" });
  assert.deepEqual(decideEngineDispatch({ action: "dispatch" }), { action: "dispatch" });
});

test("decideFinalizeResult maps break results to stop decisions", () => {
  assert.deepEqual(
    decideFinalizeResult({ action: "break", reason: "git-closeout-failure" }),
    {
      action: "stop",
      failureClass: "git",
      ledgerErrorSummary: "finalize-break:git-closeout-failure",
      turnError: "finalize-break",
    },
  );
  assert.deepEqual(
    decideFinalizeResult({ action: "break" }),
    {
      action: "stop",
      failureClass: "closeout",
      ledgerErrorSummary: "finalize-break:unknown",
      turnError: "finalize-break",
    },
  );
});

test("decideFinalizeResult maps continue and next results", () => {
  assert.deepEqual(
    decideFinalizeResult({ action: "continue" }),
    { action: "retry", ledgerErrorSummary: "finalize-retry" },
  );
  assert.deepEqual(decideFinalizeResult({ action: "next" }), { action: "complete" });
});

test("decideEngineReconcile maps terminal outcomes", () => {
  assert.deepEqual(
    decideEngineReconcile({ outcome: "milestone-complete" }),
    { action: "complete-workflow", stopReason: "Workflow complete" },
  );
  assert.deepEqual(decideEngineReconcile({ outcome: "pause" }), { action: "pause" });
  assert.deepEqual(
    decideEngineReconcile({ outcome: "stop", reason: "blocked" }),
    { action: "stop", reason: "blocked" },
  );
  assert.deepEqual(
    decideEngineReconcile({ outcome: "stop" }),
    { action: "stop", reason: "Engine stopped" },
  );
});

test("decideEngineReconcile passes through continue outcomes", () => {
  assert.deepEqual(decideEngineReconcile({ outcome: "continue" }), { action: "continue" });
});

test("decideMemoryPressure continues when heap pressure is below threshold", () => {
  assert.deepEqual(
    decideMemoryPressure({
      pressured: false,
      heapMB: 512,
      limitMB: 4096,
      pct: 0.125,
      iteration: 5,
    }),
    { action: "continue" },
  );
});

test("decideMemoryPressure returns stable stop messages when pressured", () => {
  assert.deepEqual(
    decideMemoryPressure({
      pressured: true,
      heapMB: 3800,
      limitMB: 4096,
      pct: 0.927,
      iteration: 10,
    }),
    {
      action: "stop",
      warningMessage:
        "Memory pressure: 3800MB / 4096MB (93%) — stopping auto-mode to prevent OOM kill",
      stopMessage:
        "Memory pressure: heap at 3800MB / 4096MB (93%). " +
        "Stopping gracefully to prevent OOM kill after 10 iterations. " +
        "Resume with /gsd auto to continue from where you left off.",
      turnError: "memory-pressure",
    },
  );
});

test("decideMinRequestInterval continues when throttling is disabled or unused", () => {
  assert.deepEqual(
    decideMinRequestInterval({
      minIntervalMs: 0,
      lastRequestTimestamp: 1000,
      nowMs: 1001,
    }),
    { action: "continue" },
  );
  assert.deepEqual(
    decideMinRequestInterval({
      minIntervalMs: 5000,
      lastRequestTimestamp: 0,
      nowMs: 1001,
    }),
    { action: "continue" },
  );
});

test("decideMinRequestInterval returns remaining wait budget", () => {
  assert.deepEqual(
    decideMinRequestInterval({
      minIntervalMs: 5000,
      lastRequestTimestamp: 10_000,
      nowMs: 12_500,
    }),
    { action: "wait", waitMs: 2500 },
  );
  assert.deepEqual(
    decideMinRequestInterval({
      minIntervalMs: 5000,
      lastRequestTimestamp: 10_000,
      nowMs: 15_000,
    }),
    { action: "continue" },
  );
});

test("decideCooldownRecovery uses bounded retry-after hints with a small buffer", () => {
  assert.deepEqual(
    decideCooldownRecovery({
      consecutiveCooldowns: 2,
      maxCooldownRetries: 5,
      retryAfterMs: 30_000,
      fallbackWaitMs: 15_000,
    }),
    {
      action: "wait",
      waitMs: 30_500,
      notifyMessage: "Credentials in cooldown (2/5) — waiting 31s before retrying.",
    },
  );
});

test("decideCooldownRecovery uses fallback wait when retry-after is missing or out of range", () => {
  assert.deepEqual(
    decideCooldownRecovery({
      consecutiveCooldowns: 1,
      maxCooldownRetries: 5,
      fallbackWaitMs: 15_000,
    }),
    {
      action: "wait",
      waitMs: 15_000,
      notifyMessage: "Credentials in cooldown (1/5) — waiting 15s before retrying.",
    },
  );
  assert.deepEqual(
    decideCooldownRecovery({
      consecutiveCooldowns: 1,
      maxCooldownRetries: 5,
      retryAfterMs: 90_000,
      fallbackWaitMs: 15_000,
    }),
    {
      action: "wait",
      waitMs: 15_000,
      notifyMessage: "Credentials in cooldown (1/5) — waiting 15s before retrying.",
    },
  );
});

test("decideCooldownRecovery stops after retry budget is exceeded", () => {
  assert.deepEqual(
    decideCooldownRecovery({
      consecutiveCooldowns: 6,
      maxCooldownRetries: 5,
      retryAfterMs: 30_000,
      fallbackWaitMs: 15_000,
    }),
    {
      action: "stop",
      notifyMessage:
        "Auto-mode stopped: 6 consecutive credential cooldowns — " +
        "rate limit or quota may be persistently exhausted.",
      stopMessage: "6 consecutive credential cooldowns exceeded retry budget",
    },
  );
});

test("decideIterationErrorRecovery retries first iteration error", () => {
  assert.deepEqual(
    decideIterationErrorRecovery({
      consecutiveErrors: 1,
      recentErrorMessages: ["temporary failure"],
      currentErrorMessage: "temporary failure",
    }),
    {
      action: "retry",
      notifyMessage: "Iteration error: temporary failure. Retrying.",
      turnStatus: "retry",
    },
  );
});

test("decideIterationErrorRecovery invalidates caches on second consecutive error", () => {
  assert.deepEqual(
    decideIterationErrorRecovery({
      consecutiveErrors: 2,
      recentErrorMessages: ["temporary failure", "still failing"],
      currentErrorMessage: "still failing",
    }),
    {
      action: "invalidate-and-retry",
      notifyMessage:
        "Iteration error (attempt 2): still failing. Invalidating caches and retrying.",
      turnStatus: "retry",
    },
  );
});

test("decideIterationErrorRecovery stops on third consecutive error with history", () => {
  assert.deepEqual(
    decideIterationErrorRecovery({
      consecutiveErrors: 3,
      recentErrorMessages: ["first", "second", "third"],
      currentErrorMessage: "third",
    }),
    {
      action: "stop",
      notifyMessage:
        "Auto-mode stopped: 3 consecutive iteration failures:\n" +
        "  1. first\n" +
        "  2. second\n" +
        "  3. third",
      stopMessage: "3 consecutive iteration failures",
      turnStatus: "failed",
    },
  );
});

test("decideCustomEngineVerifyRetry retries until the retry budget is exceeded", () => {
  assert.deepEqual(
    decideCustomEngineVerifyRetry({ attempts: 3, maxRetries: 3 }),
    { action: "retry" },
  );
  assert.deepEqual(
    decideCustomEngineVerifyRetry({ attempts: 4, maxRetries: 3 }),
    { action: "recover" },
  );
});

test("shouldUseCustomEnginePath enables only non-dev engines without sidecar or bypass", () => {
  assert.equal(
    shouldUseCustomEnginePath({
      activeEngineId: "custom",
      hasSidecarItem: false,
      engineBypass: false,
    }),
    true,
  );
  assert.equal(
    shouldUseCustomEnginePath({
      activeEngineId: "dev",
      hasSidecarItem: false,
      engineBypass: false,
    }),
    false,
  );
  assert.equal(
    shouldUseCustomEnginePath({
      activeEngineId: null,
      hasSidecarItem: false,
      engineBypass: false,
    }),
    false,
  );
  assert.equal(
    shouldUseCustomEnginePath({
      activeEngineId: "custom",
      hasSidecarItem: true,
      engineBypass: false,
    }),
    false,
  );
  assert.equal(
    shouldUseCustomEnginePath({
      activeEngineId: "custom",
      hasSidecarItem: false,
      engineBypass: true,
    }),
    false,
  );
});

test("resolveUnitRequestTimestamp prefers dispatch time and ignores missing timestamps", () => {
  assert.equal(
    resolveUnitRequestTimestamp({
      requestDispatchedAt: 200,
      unitStartedAt: 100,
    }),
    200,
  );
  assert.equal(
    resolveUnitRequestTimestamp({
      unitStartedAt: 100,
    }),
    100,
  );
  assert.equal(
    resolveUnitRequestTimestamp({}),
    undefined,
  );
});

test("decideCustomEngineRecovery maps pause recovery to manual attention", () => {
  assert.deepEqual(
    decideCustomEngineRecovery({
      outcome: "pause",
      reason: "needs review",
      unitId: "step-1",
      attempts: 4,
    }),
    {
      action: "pause",
      turnError: "needs review",
    },
  );
  assert.deepEqual(
    decideCustomEngineRecovery({
      outcome: "pause",
      unitId: "step-1",
      attempts: 4,
    }),
    {
      action: "pause",
      turnError: "custom-engine-verify-retry-exhausted",
    },
  );
});

test("decideCustomEngineRecovery maps skip recovery to a stop message", () => {
  assert.deepEqual(
    decideCustomEngineRecovery({
      outcome: "skip",
      unitId: "step-1",
      attempts: 4,
    }),
    {
      action: "stop",
      stopMessage:
        "Custom workflow verification for step-1 requested skip after retry exhaustion, but the custom engine cannot reconcile skipped steps.",
      turnError: "custom-engine-verify-retry-exhausted",
    },
  );
});

test("decideCustomEngineRecovery maps stop and retry outcomes to exhausted stops", () => {
  assert.deepEqual(
    decideCustomEngineRecovery({
      outcome: "stop",
      reason: "blocked by policy",
      unitId: "step-1",
      attempts: 4,
    }),
    {
      action: "stop",
      stopMessage: "blocked by policy",
      turnError: "custom-engine-verify-retry-exhausted",
    },
  );
  assert.deepEqual(
    decideCustomEngineRecovery({
      outcome: "retry",
      unitId: "step-1",
      attempts: 4,
    }),
    {
      action: "stop",
      stopMessage: "Custom workflow verification for step-1 requested retry 4 times without passing.",
      turnError: "custom-engine-verify-retry-exhausted",
    },
  );
});

test("decideInfrastructureError returns stable stop and notification messages", () => {
  assert.deepEqual(
    decideInfrastructureError({
      code: "ENOSPC",
      errorMessage: "disk full",
    }),
    {
      notifyMessage: "Auto-mode stopped: infrastructure error ENOSPC — disk full",
      stopMessage: "Infrastructure error (ENOSPC): not recoverable by retry",
      turnStatus: "failed",
      failureClass: "execution",
    },
  );
});

test("decideModelPolicyBlocked returns pause notification and journal payload", () => {
  const reasons = [
    { provider: "provider-a", modelId: "model-a", reason: "tools denied" },
  ];
  assert.deepEqual(
    decideModelPolicyBlocked({
      unitType: "execute-task",
      unitId: "M001/S001/T001",
      errorMessage: "policy blocked",
      reasons,
    }),
    {
      notifyMessage:
        "Auto-mode paused: model-policy denied dispatch for execute-task/M001/S001/T001. policy blocked",
      journalData: {
        unitType: "execute-task",
        unitId: "M001/S001/T001",
        status: "blocked",
        reason: "model-policy-dispatch-blocked",
        reasons,
      },
      turnStatus: "paused",
      failureClass: "manual-attention",
    },
  );
});

test("decideDispatchNodeKind maps sidecar kinds before unit types", () => {
  assert.equal(decideDispatchNodeKind("execute-task", "hook"), "hook");
  assert.equal(decideDispatchNodeKind("execute-task", "triage"), "verification");
  assert.equal(decideDispatchNodeKind("execute-task", "quick-task"), "team-worker");
});

test("decideDispatchNodeKind maps workflow unit types to scheduler node kinds", () => {
  assert.equal(decideDispatchNodeKind("hook/pre-dispatch"), "hook");
  assert.equal(decideDispatchNodeKind("reactive-execute"), "subagent");
  assert.equal(decideDispatchNodeKind("gate-evaluate"), "verification");
  assert.equal(decideDispatchNodeKind("validate-milestone"), "verification");
  assert.equal(decideDispatchNodeKind("run-uat"), "verification");
  assert.equal(decideDispatchNodeKind("complete-slice"), "verification");
  assert.equal(decideDispatchNodeKind("replan-slice"), "reprocess");
  assert.equal(decideDispatchNodeKind("reassess-roadmap"), "reprocess");
  assert.equal(decideDispatchNodeKind("execute-task"), "unit");
});

test("formatDispatchExceptionSummary preserves error and non-error messages", () => {
  assert.equal(
    formatDispatchExceptionSummary({ error: new Error("unit failed") }),
    "exception:unit failed",
  );
  assert.equal(
    formatDispatchExceptionSummary({ error: "string failure" }),
    "exception:string failure",
  );
});

test("formatUnhandledDispatchErrorSummary truncates long messages", () => {
  assert.equal(
    formatUnhandledDispatchErrorSummary({ error: new Error("unexpected") }),
    "unhandled-error:unexpected",
  );
  const longMessage = "x".repeat(250);
  assert.equal(
    formatUnhandledDispatchErrorSummary({ error: longMessage }),
    `unhandled-error:${"x".repeat(200)}`,
  );
});
