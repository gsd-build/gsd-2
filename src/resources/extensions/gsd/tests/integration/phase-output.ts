/**
 * Phase Output Schema — structured JSON result for phase commands.
 *
 * Defines the `PhaseResult` interface emitted to stdout by both
 * discuss and plan phase commands. Provides a consistent, machine-parseable
 * output format for downstream agents and orchestration tools.
 *
 * Design: all diagnostic output (logs, progress) goes to stderr.
 * Only the final PhaseResult JSON goes to stdout.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PhaseArtifact {
  /** Absolute path to the artifact file */
  path: string;
  /** Path relative to the project directory */
  relativePath: string;
}

export interface PhaseResult {
  /** Phase name: "discuss" or "plan" */
  phase: string;
  /** Outcome status */
  status: "success" | "failure" | "timeout";
  /** Artifact files produced by this phase */
  artifacts: PhaseArtifact[];
  /** Event stream summary */
  events: {
    /** Total events observed */
    total: number;
    /** Count by event type */
    byType: Record<string, number>;
  };
  /** Error messages (empty on success) */
  errors: string[];
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Project directory where artifacts were written */
  projectDir?: string;
}

// ── Output ───────────────────────────────────────────────────────────────────

/**
 * Print a PhaseResult as a single JSON line to stdout.
 * All other output should go to stderr to keep stdout clean for parsing.
 */
export function printPhaseResult(result: PhaseResult): void {
  // Write to stdout as a single JSON object (pretty-printed for readability)
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
