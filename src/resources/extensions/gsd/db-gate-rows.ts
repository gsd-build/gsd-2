// Project/App: GSD-2
// File Purpose: Quality gate row mapper for the GSD database facade.

import type { GateId, GateRow, GateScope, GateStatus, GateVerdict } from "./types.js";

export function rowToGate(row: Record<string, unknown>): GateRow {
  return {
    milestone_id: row["milestone_id"] as string,
    slice_id: row["slice_id"] as string,
    gate_id: row["gate_id"] as GateId,
    scope: row["scope"] as GateScope,
    task_id: (row["task_id"] as string) ?? "",
    status: row["status"] as GateStatus,
    verdict: row["status"] === "pending" ? null : (row["verdict"] as GateVerdict),
    rationale: (row["rationale"] as string) || "",
    findings: (row["findings"] as string) || "",
    evaluated_at: (row["evaluated_at"] as string) ?? null,
  };
}
