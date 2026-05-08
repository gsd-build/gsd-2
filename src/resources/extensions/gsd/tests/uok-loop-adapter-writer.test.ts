import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createTurnObserver } from "../uok/loop-adapter.ts";
import { hasActiveWriterToken, resetWriterTokensForTests } from "../uok/writer.ts";

function readAuditPayloads(basePath: string): Array<Record<string, unknown>> {
  const path = join(basePath, ".gsd", "audit", "events.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { payload?: Record<string, unknown> })
    .map((event) => event.payload ?? {});
}

test("uok turn observer adds writer sequence metadata to audit events", (t) => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-uok-loop-writer-"));
  resetWriterTokensForTests();
  t.after(() => {
    resetWriterTokensForTests();
    rmSync(basePath, { recursive: true, force: true });
  });

  const observer = createTurnObserver({
    basePath,
    gitAction: "status-only",
    gitPush: false,
    enableAudit: true,
    enableGitops: false,
  });

  observer.onTurnStart({
    basePath,
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 1,
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    startedAt: new Date().toISOString(),
  });
  assert.equal(hasActiveWriterToken(basePath, "turn-1"), true);

  observer.onTurnResult({
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 1,
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    status: "completed",
    failureClass: "none",
    phaseResults: [],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });

  assert.equal(hasActiveWriterToken(basePath, "turn-1"), false);
  const payloads = readAuditPayloads(basePath);
  assert.equal(payloads[0]?.writeSequence, 1);
  assert.equal(payloads[1]?.writeSequence, 2);
  assert.equal(typeof payloads[0]?.writerTokenId, "string");
});

test("uok turn observer releases writer token when validation throws", (t) => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-uok-loop-writer-throw-"));
  resetWriterTokensForTests();
  t.after(() => {
    resetWriterTokensForTests();
    rmSync(basePath, { recursive: true, force: true });
  });

  const observer = createTurnObserver({
    basePath,
    gitAction: "status-only",
    gitPush: false,
    enableAudit: false,
    enableGitops: false,
  });

  observer.onTurnStart({
    basePath,
    traceId: "trace-throw",
    turnId: "turn-throw",
    iteration: 1,
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    startedAt: new Date().toISOString(),
  });
  assert.equal(hasActiveWriterToken(basePath, "turn-throw"), true);

  // Invalid payload (missing required fields like status/finishedAt) should
  // trigger validateTurnResult to fail and throw.
  assert.throws(() => {
    observer.onTurnResult({
      traceId: "trace-throw",
      turnId: "turn-throw",
      // @ts-expect-error intentionally invalid for test
      iteration: "not-a-number",
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      status: "completed",
      failureClass: "none",
      phaseResults: [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
  }, /Invalid UOK turn result/);

  // Cleanup must run in finally — token released, no leaked state.
  assert.equal(hasActiveWriterToken(basePath, "turn-throw"), false);
});

test("uok turn observer falls back to cached phaseResults when result.phaseResults is missing", (t) => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-uok-loop-writer-missing-"));
  resetWriterTokensForTests();
  t.after(() => {
    resetWriterTokensForTests();
    rmSync(basePath, { recursive: true, force: true });
  });

  const observer = createTurnObserver({
    basePath,
    gitAction: "status-only",
    gitPush: false,
    enableAudit: false,
    enableGitops: false,
  });

  observer.onTurnStart({
    basePath,
    traceId: "trace-missing",
    turnId: "turn-missing",
    iteration: 1,
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    startedAt: new Date().toISOString(),
  });

  // Without the Array.isArray guard, accessing result.phaseResults.length on a
  // payload where phaseResults is undefined would throw TypeError before
  // validateTurnResult could surface a structured error. The guard must defer
  // to the cached phaseResults fallback so the turn completes cleanly.
  assert.doesNotThrow(() => {
    observer.onTurnResult({
      traceId: "trace-missing",
      turnId: "turn-missing",
      iteration: 1,
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      status: "completed",
      failureClass: "none",
      // @ts-expect-error intentionally missing for test
      phaseResults: undefined,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
  });

  assert.equal(hasActiveWriterToken(basePath, "turn-missing"), false);
});
