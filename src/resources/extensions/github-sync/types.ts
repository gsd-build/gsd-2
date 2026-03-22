/**
 * Type definitions for the GitHub Sync extension.
 *
 * Config shape (stored in GSD preferences under `github` key) and
 * sync mapping records (stored in `.gsd/github-sync.json`).
 */

// ─── Configuration ──────────────────────────────────────────────────────────

export interface GitHubSyncConfig {
  enabled: boolean;
  /** "owner/repo" — auto-detected from git remote if omitted. */
  repo?: string;
  /** GitHub Projects v2 number (optional). */
  project?: number;
  /** Labels applied to all created issues. */
  labels?: string[];
  /** Append "Resolves #N" to task commits. Default: true. */
  auto_link_commits?: boolean;
  /** Create per-slice draft PRs. Default: true. */
  slice_prs?: boolean;
}

// ─── Sync Mapping ───────────────────────────────────────────────────────────

export interface SyncEntityRecord {
  issueNumber: number;
  lastSyncedAt: string;
  state: "open" | "closed";
}

export interface MilestoneSyncRecord extends SyncEntityRecord {
  ghMilestoneNumber: number;
}

export interface SliceSyncRecord extends SyncEntityRecord {
  prNumber: number;
  branch: string;
}

export interface SyncMapping {
  version: 1;
  repo: string;
  milestones: Record<string, MilestoneSyncRecord>;
  slices: Record<string, SliceSyncRecord>;
  tasks: Record<string, SyncEntityRecord>;
}
