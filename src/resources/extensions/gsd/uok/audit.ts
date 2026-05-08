// GSD2 UOK Audit Events and DB-First Projection Writes

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { isStaleWrite } from "../auto/turn-epoch.js";
import { withFileLockSync } from "../file-lock.js";
import { gsdRoot } from "../paths.js";
import { isDbAvailable, insertAuditEvent } from "../gsd-db.js";
import { CURRENT_UOK_CONTRACT_VERSION, validateAuditEvent, type AuditEventEnvelope } from "./contracts.js";

function auditLogPath(basePath: string): string {
  return join(gsdRoot(basePath), "audit", "events.jsonl");
}

function ensureAuditDir(basePath: string): void {
  mkdirSync(join(gsdRoot(basePath), "audit"), { recursive: true });
}

export function buildAuditEnvelope(args: {
  traceId: string;
  turnId?: string;
  causedBy?: string;
  category: AuditEventEnvelope["category"];
  type: string;
  payload?: Record<string, unknown>;
}): AuditEventEnvelope {
  return {
    version: CURRENT_UOK_CONTRACT_VERSION,
    eventId: randomUUID(),
    traceId: args.traceId,
    turnId: args.turnId,
    causedBy: args.causedBy,
    category: args.category,
    type: args.type,
    ts: new Date().toISOString(),
    payload: args.payload ?? {},
  };
}

export function emitUokAuditEvent(basePath: string, event: AuditEventEnvelope): void {
  // Drop writes from a turn superseded by timeout recovery / cancellation.
  if (isStaleWrite("uok-audit")) return;
  const validation = validateAuditEvent(event);
  if (!validation.ok) {
    throw new Error(`Invalid UOK audit event: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  const canonical = validation.value;

  if (isDbAvailable()) {
    try {
      insertAuditEvent({
        ...canonical,
        payload: {
          ...canonical.payload,
          contractVersion: canonical.version ?? CURRENT_UOK_CONTRACT_VERSION,
        },
      });
    } catch (err) {
      throw new Error(`DB authoritative audit write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    ensureAuditDir(basePath);
    const path = auditLogPath(basePath);
    // proper-lockfile requires the target file to exist before locking.
    // Touch it via open(O_APPEND|O_CREAT) so the first writer wins the race
    // atomically at the kernel level.
    if (!existsSync(path)) closeSync(openSync(path, "a"));
    // onLocked: "skip" — audit writes are best-effort; under heavy contention
    // POSIX O_APPEND atomicity still protects small line writes, so skipping
    // the lock rather than stalling orchestration is the correct tradeoff.
    withFileLockSync(
      path,
      () => {
        appendFileSync(path, `${JSON.stringify(canonical)}\n`, "utf-8");
      },
      { onLocked: "skip" },
    );
  } catch {
    // Best-effort: audit writes must never break orchestration.
  }
}
