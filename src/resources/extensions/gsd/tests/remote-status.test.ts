import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPromptRecord, writePromptRecord } from "../../remote-questions/store.ts";
import { getLatestPromptSummary } from "../../remote-questions/status.ts";

test("getLatestPromptSummary returns latest stored prompt", async () => {
  const home = process.env.HOME!;
  const tempHome = join(tmpdir(), `gsd-remote-status-${Date.now()}`);
  mkdirSync(join(tempHome, ".gsd", "runtime", "remote-questions"), { recursive: true });
  process.env.HOME = tempHome;

  const recordA = createPromptRecord({
    id: "a-prompt",
    channel: "slack",
    createdAt: 1,
    timeoutAt: 10,
    pollIntervalMs: 5000,
    questions: [],
  });
  recordA.updatedAt = 1;
  writePromptRecord(recordA);

  const recordB = createPromptRecord({
    id: "z-prompt",
    channel: "discord",
    createdAt: 2,
    timeoutAt: 10,
    pollIntervalMs: 5000,
    questions: [],
  });
  recordB.updatedAt = 2;
  recordB.status = "answered";
  writePromptRecord(recordB);

  const latest = getLatestPromptSummary();
  assert.equal(latest?.id, "z-prompt");
  assert.equal(latest?.status, "answered");

  process.env.HOME = home;
  rmSync(tempHome, { recursive: true, force: true });
});
