import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { verifyExpectedArtifact } from "../auto-recovery.ts";
import { openDatabase, closeDatabase, insertMilestone, insertSlice, insertGateRow } from "../gsd-db.ts";

const tmpDirs: string[] = [];

function makeTmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "auto-recovery-"));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  openDatabase(join(dir, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test Milestone", status: "active" });
  insertSlice({
    milestoneId: "M001",
    id: "S01",
    title: "Test Slice",
    status: "pending",
    risk: "low",
    depends: [],
  });
  insertGateRow({ milestoneId: "M001", sliceId: "S01", gateId: "Q3", scope: "slice" });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  closeDatabase();
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
  tmpDirs.length = 0;
});

test("verifyExpectedArtifact checks pending gate-evaluate artifacts without ESM require failures", () => {
  const base = makeTmpProject();

  const verified = verifyExpectedArtifact("gate-evaluate", "M001/S01/gates+Q3", base);

  assert.equal(verified, false, "pending gates should keep gate-evaluate unverified");
});
