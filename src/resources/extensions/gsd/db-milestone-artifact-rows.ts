// Project/App: GSD-2
// File Purpose: Milestone and artifact row mappers for the GSD database facade.

export interface MilestoneRow {
  id: string;
  title: string;
  status: string;
  depends_on: string[];
  created_at: string;
  completed_at: string | null;
  vision: string;
  success_criteria: string[];
  key_risks: Array<{ risk: string; whyItMatters: string }>;
  proof_strategy: Array<{ riskOrUnknown: string; retireIn: string; whatWillBeProven: string }>;
  verification_contract: string;
  verification_integration: string;
  verification_operational: string;
  verification_uat: string;
  definition_of_done: string[];
  requirement_coverage: string;
  boundary_map_markdown: string;
  sequence: number;
}

export interface ArtifactRow {
  path: string;
  artifact_type: string;
  milestone_id: string | null;
  slice_id: string | null;
  task_id: string | null;
  full_content: string;
  imported_at: string;
}

type DbRow = Record<string, unknown>;

export function rowToMilestone(row: DbRow): MilestoneRow {
  return {
    id: row["id"] as string,
    title: row["title"] as string,
    status: row["status"] as string,
    depends_on: JSON.parse((row["depends_on"] as string) || "[]"),
    created_at: row["created_at"] as string,
    completed_at: (row["completed_at"] as string) ?? null,
    vision: (row["vision"] as string) ?? "",
    success_criteria: JSON.parse((row["success_criteria"] as string) || "[]"),
    key_risks: JSON.parse((row["key_risks"] as string) || "[]"),
    proof_strategy: JSON.parse((row["proof_strategy"] as string) || "[]"),
    verification_contract: (row["verification_contract"] as string) ?? "",
    verification_integration: (row["verification_integration"] as string) ?? "",
    verification_operational: (row["verification_operational"] as string) ?? "",
    verification_uat: (row["verification_uat"] as string) ?? "",
    definition_of_done: JSON.parse((row["definition_of_done"] as string) || "[]"),
    requirement_coverage: (row["requirement_coverage"] as string) ?? "",
    boundary_map_markdown: (row["boundary_map_markdown"] as string) ?? "",
    sequence: Number(row["sequence"] ?? 0),
  };
}

export function rowToArtifact(row: DbRow): ArtifactRow {
  return {
    path: row["path"] as string,
    artifact_type: row["artifact_type"] as string,
    milestone_id: (row["milestone_id"] as string) ?? null,
    slice_id: (row["slice_id"] as string) ?? null,
    task_id: (row["task_id"] as string) ?? null,
    full_content: row["full_content"] as string,
    imported_at: row["imported_at"] as string,
  };
}
