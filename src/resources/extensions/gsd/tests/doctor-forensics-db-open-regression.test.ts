import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { closeDatabase } from "../gsd-db.ts";
import { buildForensicReport } from "../forensics.ts";
import { handleDoctor } from "../commands-handlers.ts";
import { withCommandCwd } from "../commands/context.ts";

test("#5194 forensics opens DB before computing completion counts", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-forensics-db-open-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  mkdirSync(join(base, ".gsd"), { recursive: true });
  closeDatabase();

  const report = await buildForensicReport(base);
  assert.ok(report.dbCompletionCounts, "forensics should expose DB completion counts when .gsd exists");
  assert.equal(report.dbCompletionCounts?.milestonesTotal, 0);
  assert.equal(report.dbCompletionCounts?.slicesTotal, 0);
  assert.equal(report.dbCompletionCounts?.tasksTotal, 0);
});

test("#5194 doctor command does not emit false db_unavailable when gsd.db exists", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-doctor-db-open-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const gsdDir = join(base, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  writeFileSync(join(gsdDir, "gsd.db"), "");
  closeDatabase();

  const notifications: string[] = [];
  const ctx = { ui: { notify: (msg: string) => notifications.push(msg) } } as any;
  const pi = {} as any;

  await withCommandCwd(base, async () => {
    await handleDoctor("--json", ctx, pi);
  });

  const jsonReport = notifications.find((entry) => entry.trim().startsWith("{"));
  assert.ok(jsonReport, "doctor --json should emit a JSON report");
  assert.doesNotMatch(
    jsonReport!,
    /"code"\s*:\s*"db_unavailable"/,
    "doctor should not report db_unavailable when it can open project DB",
  );
});
