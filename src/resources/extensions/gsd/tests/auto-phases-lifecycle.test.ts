import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runFinalize } from "../auto/phases.ts";
import { AutoSession } from "../auto/session.ts";
import { readUnitRuntimeRecord, writeUnitRuntimeRecord } from "../unit-runtime.ts";

async function runSuccessfulFinalize(s: AutoSession) {
  const unit = s.currentUnit;
  assert.ok(unit, "test setup must provide currentUnit");

  writeUnitRuntimeRecord(s.basePath, unit.type, unit.id, unit.startedAt, {
    phase: "dispatched",
  });

  const deps = {
    clearUnitTimeout() {},
    buildSnapshotOpts() {
      return {};
    },
    stopAuto: async () => {},
    pauseAuto: async () => {},
    updateProgressWidget() {},
    postUnitPreVerification: async () => "continue",
    runPostUnitVerification: async () => "continue",
    postUnitPostVerification: async () => "continue",
  };

  return runFinalize(
    {
      ctx: { ui: { notify() {} } },
      pi: {},
      s,
      deps,
      prefs: undefined,
      iteration: 1,
      flowId: "flow-1",
      nextSeq: () => 1,
    } as any,
    {
      unitType: unit.type,
      unitId: unit.id,
      prompt: "",
      finalPrompt: "",
      pauseAfterUatDispatch: false,
      state: {} as any,
      mid: "M001",
      midTitle: "Milestone",
      isRetry: false,
      previousTier: undefined,
    },
    {
      recentUnits: [],
      stuckRecoveryAttempts: 0,
      consecutiveFinalizeTimeouts: 0,
    },
  );
}

test("runFinalize clears currentUnit after successful finalize", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-current-unit-"));
  const s = new AutoSession();
  s.basePath = base;
  s.currentUnit = {
    type: "execute-task",
    id: "M001/S01/T01",
    startedAt: Date.now(),
  };

  try {
    const result = await runSuccessfulFinalize(s);

    assert.equal(result.action, "next");
    assert.equal(s.currentUnit, null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("runFinalize marks unit runtime finalized after successful finalize", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-runtime-"));
  const s = new AutoSession();
  const startedAt = Date.now();
  s.basePath = base;
  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt,
  };

  try {
    const result = await runSuccessfulFinalize(s);
    const runtime = readUnitRuntimeRecord(base, "complete-milestone", "M001");

    assert.equal(result.action, "next");
    assert.equal(runtime?.phase, "finalized");
    assert.equal(runtime?.lastProgressKind, "finalize-success");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
