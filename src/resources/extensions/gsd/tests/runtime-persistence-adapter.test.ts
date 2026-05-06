import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createRuntimePersistenceAdapter } from "../auto/adapters/runtime-persistence.ts";
import { queryJournal } from "../journal.ts";

function makeBasePath(): string {
  return mkdtempSync(join(tmpdir(), "gsd-runtime-persistence-"));
}

test("runtime persistence adapter reports skipped dispatch claim without worker context", async () => {
  const basePath = makeBasePath();
  try {
    const adapter = createRuntimePersistenceAdapter({
      basePath,
      lockBasePath: basePath,
      flowId: "flow-1",
      nextSeq: (() => {
        let n = 0;
        return () => ++n;
      })(),
      getWorkerContext: () => ({
        workerId: null,
        milestoneLeaseToken: null,
        milestoneId: null,
      }),
    });

    const result = await adapter.claimAndJournalDispatch({
      unitType: "execute-task",
      unitId: "M001/S001/T001",
      reason: "ready",
      preconditions: [],
    });

    assert.equal(result.kind, "skipped");
    assert.match(result.reason ?? "", /missing worker\/lease context/i);
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("runtime persistence adapter journalTransition writes journal event", async () => {
  const basePath = makeBasePath();
  try {
    const adapter = createRuntimePersistenceAdapter({
      basePath,
      lockBasePath: basePath,
      flowId: "flow-journal",
      nextSeq: (() => {
        let n = 0;
        return () => ++n;
      })(),
      getWorkerContext: () => ({
        workerId: null,
        milestoneLeaseToken: null,
        milestoneId: null,
      }),
    });

    await adapter.journalTransition({ name: "advance-blocked", reason: "health gate blocked" });

    const rows = queryJournal(basePath, { flowId: "flow-journal", eventType: "guard-block" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.data?.name, "advance-blocked");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("runtime persistence adapter ensureLockOwnership throws when lock is not held", async () => {
  const basePath = makeBasePath();
  try {
    const adapter = createRuntimePersistenceAdapter({
      basePath,
      lockBasePath: basePath,
      flowId: "flow-lock",
      nextSeq: (() => {
        let n = 0;
        return () => ++n;
      })(),
      getWorkerContext: () => ({
        workerId: null,
        milestoneLeaseToken: null,
        milestoneId: null,
      }),
    });

    await assert.rejects(() => adapter.ensureLockOwnership(), /session lock held by another process/i);
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});
