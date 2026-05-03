// GSD2 UOK Contract Types and Versioning

export const CURRENT_UOK_CONTRACT_VERSION = "1" as const;

export type UokContractVersion = "0" | typeof CURRENT_UOK_CONTRACT_VERSION;

export type FailureClass =
  | "none"
  | "policy"
  | "input"
  | "execution"
  | "artifact"
  | "verification"
  | "closeout"
  | "git"
  | "timeout"
  | "manual-attention"
  | "unknown";

export type GateOutcome = "pass" | "fail" | "retry" | "manual-attention";

export type DispatchReasonCode =
  | "policy"
  | "state"
  | "recovery"
  | "manual"
  | "dependency"
  | "conflict"
  | "retry";

export interface GateResult {
  gateId: string;
  gateType: string;
  outcome: GateOutcome;
  failureClass: FailureClass;
  rationale?: string;
  findings?: string;
  attempt: number;
  maxAttempts: number;
  retryable: boolean;
  evaluatedAt: string;
}

export type TurnPhase =
  | "pre-dispatch"
  | "dispatch"
  | "unit"
  | "finalize"
  | "guard"
  | "custom-engine";

export type TurnStatus =
  | "completed"
  | "failed"
  | "paused"
  | "stopped"
  | "skipped"
  | "retry";

export interface TurnContract {
  traceId: string;
  turnId: string;
  iteration: number;
  basePath: string;
  unitType?: string;
  unitId?: string;
  sidecarKind?: string;
  startedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TurnCloseoutRecord {
  traceId: string;
  turnId: string;
  unitType?: string;
  unitId?: string;
  status: TurnStatus;
  failureClass: FailureClass;
  gitAction: "commit" | "snapshot" | "status-only";
  gitPushed: boolean;
  activityFile?: string;
  finishedAt: string;
}

export interface TurnResult {
  version?: UokContractVersion;
  traceId: string;
  turnId: string;
  iteration: number;
  unitType?: string;
  unitId?: string;
  status: TurnStatus;
  failureClass: FailureClass;
  phaseResults: Array<{
    phase: TurnPhase;
    action: string;
    ts: string;
    data?: Record<string, unknown>;
  }>;
  gateResults?: GateResult[];
  closeout?: TurnCloseoutRecord;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface DispatchExplanation {
  reasonCode: DispatchReasonCode;
  summary: string;
  evidence?: Record<string, unknown>;
  blockedBy?: Array<{
    kind: "gate" | "state" | "dependency" | "conflict" | "policy" | "manual";
    id: string;
    detail?: string;
  }>;
}

export interface UokDispatchEnvelope {
  version?: UokContractVersion;
  action: "dispatch" | "stop" | "skip";
  nodeKind?: UokNodeKind;
  unitType?: string;
  unitId?: string;
  prompt?: string;
  reason: DispatchExplanation;
  gateVerdict?: GateResult;
  constraints?: {
    reads?: string[];
    writes?: string[];
    dependsOn?: string[];
    maxWorkers?: number;
  };
  trace?: {
    traceId?: string;
    turnId?: string;
    causedBy?: string;
  };
}

export interface AuditEventEnvelope {
  version?: UokContractVersion;
  eventId: string;
  traceId: string;
  turnId?: string;
  causedBy?: string;
  category:
    | "orchestration"
    | "gate"
    | "model-policy"
    | "gitops"
    | "verification"
    | "metrics"
    | "plan"
    | "execution";
  type: string;
  ts: string;
  payload: Record<string, unknown>;
}

export type UokNodeKind =
  | "unit"
  | "hook"
  | "subagent"
  | "team-worker"
  | "verification"
  | "reprocess"
  | "refine";

export interface UokGraphNode {
  id: string;
  kind: UokNodeKind;
  dependsOn: string[];
  writes?: string[];
  reads?: string[];
  metadata?: Record<string, unknown>;
}

export interface WriterToken {
  tokenId: string;
  traceId: string;
  turnId: string;
  acquiredAt: string;
  owner: "uok" | "legacy-compat" | "manual";
}

export interface WriteSequence {
  traceId: string;
  turnId: string;
  sequence: number;
}

export interface WriteRecord {
  writerToken: WriterToken;
  sequence: WriteSequence;
  category: "state" | "audit" | "gitops" | "gate" | "artifact" | "other";
  path?: string;
  operation: "append" | "replace" | "insert" | "update" | "delete" | "noop";
  ts: string;
  metadata?: Record<string, unknown>;
}

export interface UokTurnObserver {
  onTurnStart(contract: TurnContract): void;
  onPhaseResult(
    phase: TurnPhase,
    action: string,
    data?: Record<string, unknown>,
  ): void;
  onTurnResult(result: TurnResult): void;
}

export interface ContractValidationIssue {
  path: string;
  message: string;
}

export interface ContractValidationResult<T> {
  ok: boolean;
  value: T;
  issues: ContractValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeVersion(value: unknown): UokContractVersion {
  return value === CURRENT_UOK_CONTRACT_VERSION ? CURRENT_UOK_CONTRACT_VERSION : "0";
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  issues: ContractValidationIssue[],
): void {
  if (typeof value[key] !== "string" || value[key] === "") {
    issues.push({ path: key, message: `${key} must be a non-empty string` });
  }
}

function requireRecord(
  value: Record<string, unknown>,
  key: string,
  issues: ContractValidationIssue[],
): void {
  if (!isRecord(value[key])) {
    issues.push({ path: key, message: `${key} must be an object` });
  }
}

export function normalizeTurnResult(value: TurnResult): TurnResult {
  return { ...value, version: normalizeVersion(value.version) };
}

export function normalizeDispatchEnvelope(value: UokDispatchEnvelope): UokDispatchEnvelope {
  return { ...value, version: normalizeVersion(value.version) };
}

export function normalizeAuditEvent(value: AuditEventEnvelope): AuditEventEnvelope {
  return { ...value, version: normalizeVersion(value.version) };
}

export function validateTurnResult(value: TurnResult): ContractValidationResult<TurnResult> {
  const normalized = normalizeTurnResult(value);
  const record = normalized as unknown as Record<string, unknown>;
  const issues: ContractValidationIssue[] = [];
  requireString(record, "traceId", issues);
  requireString(record, "turnId", issues);
  if (!Number.isInteger(record.iteration)) {
    issues.push({ path: "iteration", message: "iteration must be an integer" });
  }
  requireString(record, "status", issues);
  requireString(record, "failureClass", issues);
  if (!Array.isArray(record.phaseResults)) {
    issues.push({ path: "phaseResults", message: "phaseResults must be an array" });
  }
  requireString(record, "startedAt", issues);
  requireString(record, "finishedAt", issues);
  return { ok: issues.length === 0, value: normalized, issues };
}

export function validateDispatchEnvelope(value: UokDispatchEnvelope): ContractValidationResult<UokDispatchEnvelope> {
  const normalized = normalizeDispatchEnvelope(value);
  const record = normalized as unknown as Record<string, unknown>;
  const issues: ContractValidationIssue[] = [];
  requireString(record, "action", issues);
  requireRecord(record, "reason", issues);
  if (isRecord(record.reason)) {
    requireString(record.reason, "reasonCode", issues);
    requireString(record.reason, "summary", issues);
  }
  return { ok: issues.length === 0, value: normalized, issues };
}

export function validateAuditEvent(value: AuditEventEnvelope): ContractValidationResult<AuditEventEnvelope> {
  const normalized = normalizeAuditEvent(value);
  const record = normalized as unknown as Record<string, unknown>;
  const issues: ContractValidationIssue[] = [];
  requireString(record, "eventId", issues);
  requireString(record, "traceId", issues);
  requireString(record, "category", issues);
  requireString(record, "type", issues);
  requireString(record, "ts", issues);
  requireRecord(record, "payload", issues);
  return { ok: issues.length === 0, value: normalized, issues };
}
