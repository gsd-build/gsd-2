// Project/App: GSD-2
// File Purpose: Decision and requirement row mappers for the GSD database facade.

import type { Decision, DecisionMadeBy, Requirement, RequirementCounts } from "./types.js";

type DbRow = Record<string, unknown>;

export function rowToDecision(row: DbRow): Decision {
  return {
    seq: row["seq"] as number,
    id: row["id"] as string,
    when_context: row["when_context"] as string,
    scope: row["scope"] as string,
    decision: row["decision"] as string,
    choice: row["choice"] as string,
    rationale: row["rationale"] as string,
    revisable: row["revisable"] as string,
    made_by: (row["made_by"] as DecisionMadeBy) ?? "agent",
    source: (row["source"] as string) ?? "discussion",
    superseded_by: (row["superseded_by"] as string) ?? null,
  };
}

export function rowToActiveDecision(row: DbRow): Decision {
  return {
    ...rowToDecision(row),
    superseded_by: null,
  };
}

export function rowToRequirement(row: DbRow): Requirement {
  return {
    id: row["id"] as string,
    class: row["class"] as string,
    status: row["status"] as string,
    description: row["description"] as string,
    why: row["why"] as string,
    source: row["source"] as string,
    primary_owner: row["primary_owner"] as string,
    supporting_slices: row["supporting_slices"] as string,
    validation: row["validation"] as string,
    notes: row["notes"] as string,
    full_content: row["full_content"] as string,
    superseded_by: (row["superseded_by"] as string) ?? null,
  };
}

export function rowToActiveRequirement(row: DbRow): Requirement {
  return {
    ...rowToRequirement(row),
    superseded_by: null,
  };
}

export function rowsToRequirementCounts(rows: DbRow[]): RequirementCounts {
  const counts: RequirementCounts = {
    active: 0,
    validated: 0,
    deferred: 0,
    outOfScope: 0,
    blocked: 0,
    total: 0,
  };

  for (const row of rows) {
    const status = String(row["status"] ?? "");
    const count = Number(row["count"] ?? 0);
    counts.total += count;
    if (status === "active") counts.active += count;
    else if (status === "validated") counts.validated += count;
    else if (status === "deferred") counts.deferred += count;
    else if (status === "out-of-scope" || status === "out_of_scope") counts.outOfScope += count;
    else if (status === "blocked") counts.blocked += count;
  }

  return counts;
}
