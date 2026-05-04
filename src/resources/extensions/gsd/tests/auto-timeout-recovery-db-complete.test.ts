import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { recoverTimedOutUnit, type RecoveryContext } from "../auto-timeout-recovery.ts";
import { closeDatabase, openDatabase, insertMilestone, insertSlice, insertTask } from "../gsd-db.ts";

test("#4649: timeout recovery treats DB-complete execute-task as recovered", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-recovery-db-complete-"));
  try {
    mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
    writeFileSync(join(base, ".gsd", "STATE.md"), "## Next Action\nExecute T01 for S01: stale\n", "utf-8");
    writeFileSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"), "# S01\n\n## Tasks\n- [ ] **T01: Task**\n", "utf-8");

    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "M1", status: "active", depends_on: [] });
    insertSlice({ id: "S01", milestoneId: "M001", title: "S1", status: "active", risk: "low", depends: [], demo: "", sequence: 1 });
    insertTask({
      id: "T01",
      sliceId: "S01",
      milestoneId: "M001",
      title: "Task",
      status: "complete",
      planning: { description: "", estimate: "", files: [], verify: "", inputs: [], expectedOutput: [], observabilityImpact: "" },
      sequence: 1,
    });

    const notifications: string[] = [];
    const ctx = { ui: { notify: (msg: string) => notifications.push(msg) } } as any;
    const pi = { sendMessage: () => {} } as any;
    const unitRecoveryCount = new Map<string, number>();
    const rctx: RecoveryContext = {
      basePath: base,
      verbose: false,
      currentUnitStartedAt: Date.now(),
      unitRecoveryCount,
    };

    const outcome = await recoverTimedOutUnit(ctx, pi, "execute-task", "M001/S01/T01", "idle", rctx);
    assert.equal(outcome, "recovered");
    assert.equal(unitRecoveryCount.has("execute-task/M001/S01/T01"), false, "DB-complete fast path should clear retry counter");
    assert.equal(
      notifications.some(m => m.includes("already completed on disk") && !m.includes("steering")),
      true,
      "should finalize via completion path, not steering retry",
    );
  } finally {
    try { closeDatabase(); } catch {}
    rmSync(base, { recursive: true, force: true });
  }
});
