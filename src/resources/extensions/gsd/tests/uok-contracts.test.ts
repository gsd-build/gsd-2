// GSD2 UOK Contract Versioning and DB Authority Tests

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AuditEventEnvelope,
  UokDispatchEnvelope,
  GateResult,
  TurnContract,
  TurnResult,
  UokNodeKind,
  WriteRecord,
  WriterToken,
} from "../uok/contracts.ts";
import {
  CURRENT_UOK_CONTRACT_VERSION,
  normalizeAuditEvent,
  validateAuditEvent,
  validateDispatchEnvelope,
  validateTurnResult,
} from "../uok/contracts.ts";
import { buildAuditEnvelope, emitUokAuditEvent } from "../uok/audit.ts";
import { buildDispatchEnvelope, explainDispatch } from "../uok/dispatch-envelope.ts";
import { buildTurnTimeline } from "../uok/timeline.ts";
import { _getAdapter, closeDatabase, openDatabase } from "../gsd-db.ts";

test("uok contracts serialize/deserialize turn envelopes", () => {
  const contract: TurnContract = {
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 1,
    basePath: "/tmp/project",
    unitType: "execute-task",
    unitId: "M001.S01.T01",
    startedAt: new Date().toISOString(),
  };

  const gate: GateResult = {
    gateId: "Q3",
    gateType: "policy",
    outcome: "pass",
    failureClass: "none",
    attempt: 1,
    maxAttempts: 1,
    retryable: false,
    evaluatedAt: new Date().toISOString(),
  };

  const result: TurnResult = {
    version: CURRENT_UOK_CONTRACT_VERSION,
    traceId: contract.traceId,
    turnId: contract.turnId,
    iteration: contract.iteration,
    unitType: contract.unitType,
    unitId: contract.unitId,
    status: "completed",
    failureClass: "none",
    phaseResults: [
      { phase: "dispatch", action: "next", ts: new Date().toISOString() },
      { phase: "unit", action: "continue", ts: new Date().toISOString() },
      { phase: "finalize", action: "next", ts: new Date().toISOString() },
    ],
    gateResults: [gate],
    startedAt: contract.startedAt,
    finishedAt: new Date().toISOString(),
  };

  const roundTrip = JSON.parse(JSON.stringify(result)) as TurnResult;
  assert.equal(roundTrip.turnId, "turn-1");
  assert.equal(roundTrip.version, CURRENT_UOK_CONTRACT_VERSION);
  assert.equal(roundTrip.gateResults?.[0]?.gateId, "Q3");
  assert.equal(roundTrip.phaseResults.length, 3);
  assert.equal(validateTurnResult(roundTrip).ok, true);
});

test("uok contracts include required DAG node kinds", () => {
  const required: UokNodeKind[] = [
    "unit",
    "hook",
    "subagent",
    "team-worker",
    "verification",
    "reprocess",
    "refine",
  ];
  assert.deepEqual(required.length, 7);
});

test("uok audit envelope includes trace/turn/causality fields", () => {
  const event: AuditEventEnvelope = buildAuditEnvelope({
    traceId: "trace-xyz",
    turnId: "turn-xyz",
    causedBy: "turn-start",
    category: "orchestration",
    type: "turn-result",
    payload: { status: "completed" },
  });

  assert.equal(event.traceId, "trace-xyz");
  assert.equal(event.version, CURRENT_UOK_CONTRACT_VERSION);
  assert.equal(event.turnId, "turn-xyz");
  assert.equal(event.causedBy, "turn-start");
  assert.equal(event.payload.status, "completed");
  assert.equal(validateAuditEvent(event).ok, true);
});

test("uok dispatch envelope carries scheduler reason and constraints", () => {
  const envelope: UokDispatchEnvelope = buildDispatchEnvelope({
    action: "dispatch",
    node: {
      kind: "unit",
      dependsOn: ["plan-gate"],
      reads: ["M001-ROADMAP.md"],
      writes: ["M001/S01/T01-SUMMARY.md"],
    },
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    prompt: "do work",
    reasonCode: "dependency",
    summary: "all dependencies are closed and output path is available",
    evidence: { readyTaskCount: 1 },
  });

  assert.equal(envelope.nodeKind, "unit");
  assert.equal(envelope.version, CURRENT_UOK_CONTRACT_VERSION);
  assert.equal(envelope.reason.reasonCode, "dependency");
  assert.deepEqual(envelope.constraints?.dependsOn, ["plan-gate"]);
  assert.ok(explainDispatch(envelope).includes("execute-task M001/S01/T01"));
  assert.equal(validateDispatchEnvelope(envelope).ok, true);
});

test("uok contracts normalize legacy records without losing payload fields", () => {
  const legacy = {
    eventId: "event-legacy",
    traceId: "trace-legacy",
    category: "orchestration",
    type: "turn-result",
    ts: new Date().toISOString(),
    payload: { status: "completed", extra: "preserved" },
  } as AuditEventEnvelope;

  const normalized = normalizeAuditEvent(legacy);
  assert.equal(normalized.version, "0");
  assert.equal(normalized.payload.extra, "preserved");
  assert.equal(validateAuditEvent(legacy).ok, true);
});

test("uok audit emission writes DB as authoritative before jsonl projection", (t) => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-uok-db-audit-"));
  mkdirSync(join(basePath, ".gsd"), { recursive: true });
  t.after(() => {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  });

  assert.equal(openDatabase(join(basePath, ".gsd", "gsd.db")), true);
  emitUokAuditEvent(
    basePath,
    buildAuditEnvelope({
      traceId: "trace-db",
      turnId: "turn-db",
      category: "orchestration",
      type: "turn-start",
      payload: { unitType: "execute-task" },
    }),
  );

  const row = _getAdapter()!.prepare(
    "SELECT payload_json FROM audit_events WHERE trace_id = 'trace-db' AND turn_id = 'turn-db'",
  ).get() as { payload_json: string } | undefined;
  assert.ok(row, "DB audit row should be written");
  assert.equal(JSON.parse(row.payload_json).contractVersion, CURRENT_UOK_CONTRACT_VERSION);

  const projection = readFileSync(join(basePath, ".gsd", "audit", "events.jsonl"), "utf-8");
  assert.ok(projection.includes("trace-db"), "jsonl projection should still be written");
});

test("uok timeline prefers DB records over jsonl projection when DB is available", (t) => {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-uok-timeline-"));
  const auditDir = join(basePath, ".gsd", "audit");
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(
    join(auditDir, "events.jsonl"),
    `${JSON.stringify({
      version: CURRENT_UOK_CONTRACT_VERSION,
      eventId: "jsonl-only",
      traceId: "trace-timeline",
      turnId: "turn-timeline",
      category: "orchestration",
      type: "jsonl-projection",
      ts: "2026-01-01T00:00:00.000Z",
      payload: {},
    })}\n`,
  );
  t.after(() => {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  });

  assert.equal(openDatabase(join(basePath, ".gsd", "gsd.db")), true);
  emitUokAuditEvent(
    basePath,
    buildAuditEnvelope({
      traceId: "trace-timeline",
      turnId: "turn-timeline",
      category: "orchestration",
      type: "db-authoritative",
      payload: {},
    }),
  );

  const timeline = buildTurnTimeline(basePath, { traceId: "trace-timeline", turnId: "turn-timeline" });
  assert.equal(timeline.authoritative, "db");
  assert.equal(timeline.degraded, false);
  assert.ok(timeline.entries.some((entry) => entry.type === "db-authoritative"));
  assert.equal(timeline.entries.some((entry) => entry.type === "jsonl-projection"), false);
});

test("uok writer records serialize sequence metadata", () => {
  const token: WriterToken = {
    tokenId: "token-1",
    traceId: "trace-1",
    turnId: "turn-1",
    acquiredAt: new Date().toISOString(),
    owner: "uok",
  };

  const record: WriteRecord = {
    writerToken: token,
    sequence: { traceId: token.traceId, turnId: token.turnId, sequence: 7 },
    category: "audit",
    operation: "append",
    path: ".gsd/audit/events.jsonl",
    ts: new Date().toISOString(),
  };

  const roundTrip = JSON.parse(JSON.stringify(record)) as WriteRecord;
  assert.equal(roundTrip.writerToken.tokenId, "token-1");
  assert.equal(roundTrip.sequence.sequence, 7);
  assert.equal(roundTrip.category, "audit");
});
