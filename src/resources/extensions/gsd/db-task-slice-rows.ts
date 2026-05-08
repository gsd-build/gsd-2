// Project/App: GSD-2
// File Purpose: Task and slice row mappers for the GSD database facade.

export interface SliceRow {
  milestone_id: string;
  id: string;
  title: string;
  status: string;
  risk: string;
  depends: string[];
  demo: string;
  created_at: string;
  completed_at: string | null;
  full_summary_md: string;
  full_uat_md: string;
  goal: string;
  success_criteria: string;
  proof_level: string;
  integration_closure: string;
  observability_impact: string;
  sequence: number;
  replan_triggered_at: string | null;
  is_sketch: number;
  sketch_scope: string;
}

export interface TaskRow {
  milestone_id: string;
  slice_id: string;
  id: string;
  title: string;
  status: string;
  one_liner: string;
  narrative: string;
  verification_result: string;
  duration: string;
  completed_at: string | null;
  blocker_discovered: boolean;
  deviations: string;
  known_issues: string;
  key_files: string[];
  key_decisions: string[];
  full_summary_md: string;
  description: string;
  estimate: string;
  files: string[];
  verify: string;
  inputs: string[];
  expected_output: string[];
  observability_impact: string;
  full_plan_md: string;
  sequence: number;
  blocker_source: string;
  escalation_pending: number;
  escalation_awaiting_review: number;
  escalation_artifact_path: string | null;
  escalation_override_applied_at: string | null;
}

type DbRow = Record<string, unknown>;

export function parseTaskArrayColumn(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
    if (typeof parsed === "string" && parsed.trim()) {
      return [parsed.trim()];
    }
    if (parsed === null || parsed === undefined || parsed === "") {
      return [];
    }
    return [String(parsed)];
  } catch {
    return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
}

export function rowToSlice(row: DbRow): SliceRow {
  return {
    milestone_id: row["milestone_id"] as string,
    id: row["id"] as string,
    title: row["title"] as string,
    status: row["status"] as string,
    risk: row["risk"] as string,
    depends: JSON.parse((row["depends"] as string) || "[]"),
    demo: (row["demo"] as string) ?? "",
    created_at: row["created_at"] as string,
    completed_at: (row["completed_at"] as string) ?? null,
    full_summary_md: (row["full_summary_md"] as string) ?? "",
    full_uat_md: (row["full_uat_md"] as string) ?? "",
    goal: (row["goal"] as string) ?? "",
    success_criteria: (row["success_criteria"] as string) ?? "",
    proof_level: (row["proof_level"] as string) ?? "",
    integration_closure: (row["integration_closure"] as string) ?? "",
    observability_impact: (row["observability_impact"] as string) ?? "",
    sequence: (row["sequence"] as number) ?? 0,
    replan_triggered_at: (row["replan_triggered_at"] as string) ?? null,
    is_sketch: (row["is_sketch"] as number) ?? 0,
    sketch_scope: (row["sketch_scope"] as string) ?? "",
  };
}

export function rowToTask(row: DbRow): TaskRow {
  return {
    milestone_id: row["milestone_id"] as string,
    slice_id: row["slice_id"] as string,
    id: row["id"] as string,
    title: row["title"] as string,
    status: row["status"] as string,
    one_liner: row["one_liner"] as string,
    narrative: row["narrative"] as string,
    verification_result: row["verification_result"] as string,
    duration: row["duration"] as string,
    completed_at: (row["completed_at"] as string) ?? null,
    blocker_discovered: (row["blocker_discovered"] as number) === 1,
    deviations: row["deviations"] as string,
    known_issues: row["known_issues"] as string,
    key_files: parseTaskArrayColumn(row["key_files"]),
    key_decisions: parseTaskArrayColumn(row["key_decisions"]),
    full_summary_md: row["full_summary_md"] as string,
    description: (row["description"] as string) ?? "",
    estimate: (row["estimate"] as string) ?? "",
    files: parseTaskArrayColumn(row["files"]),
    verify: (row["verify"] as string) ?? "",
    inputs: parseTaskArrayColumn(row["inputs"]),
    expected_output: parseTaskArrayColumn(row["expected_output"]),
    observability_impact: (row["observability_impact"] as string) ?? "",
    full_plan_md: (row["full_plan_md"] as string) ?? "",
    sequence: (row["sequence"] as number) ?? 0,
    blocker_source: (row["blocker_source"] as string) ?? "",
    escalation_pending: (row["escalation_pending"] as number) ?? 0,
    escalation_awaiting_review: (row["escalation_awaiting_review"] as number) ?? 0,
    escalation_artifact_path: (row["escalation_artifact_path"] as string) ?? null,
    escalation_override_applied_at: (row["escalation_override_applied_at"] as string) ?? null,
  };
}
