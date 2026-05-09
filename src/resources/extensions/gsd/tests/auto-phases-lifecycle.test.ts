// Project/App: GSD-2
// File Purpose: Auto-loop phase lifecycle regression tests.
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

async function runFinalizeWithDeps(s: AutoSession, depsOverrides: Record<string, unknown>) {
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
    ...depsOverrides,
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

test("runFinalize merges a verified complete-milestone immediately and only once", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-finalize-merge-"));
  t.after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const s = new AutoSession();
  const startedAt = Date.now();
  let mergeCalls = 0;
  s.basePath = base;
  s.originalBasePath = base;
  s.currentMilestoneId = "M001";
  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt,
  };

  const result = await runFinalizeWithDeps(s, {
    preflightCleanRoot: () => ({ stashPushed: false }),
    postflightPopStash: () => ({ needsManualRecovery: false }),
    resolver: {
      mergeAndExit() {
        mergeCalls++;
      },
    },
    lifecycle: {
      exitMilestone(_mid: string, opts: { merge: boolean }) {
        if (opts.merge) mergeCalls++;
        return { ok: true, merged: opts.merge, codeFilesChanged: false };
      },
    },
  });

  assert.equal(result.action, "next");
  assert.equal(mergeCalls, 1);
  assert.equal(s.milestoneMergedInPhases, true);

  s.currentUnit = {
    type: "complete-milestone",
    id: "M001",
    startedAt: startedAt + 1,
  };
  const second = await runFinalizeWithDeps(s, {
    preflightCleanRoot: () => ({ stashPushed: false }),
    postflightPopStash: () => ({ needsManualRecovery: false }),
    resolver: {
      mergeAndExit() {
        mergeCalls++;
      },
    },
    lifecycle: {
      exitMilestone(_mid: string, opts: { merge: boolean }) {
        if (opts.merge) mergeCalls++;
        return { ok: true, merged: opts.merge, codeFilesChanged: false };
      },
    },
  });

  assert.equal(second.action, "next");
  assert.equal(mergeCalls, 1);
});
