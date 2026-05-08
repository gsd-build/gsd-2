// Project/App: GSD-2
// File Purpose: Verification evidence SQLite schema helpers for the GSD database facade.

import type { DbAdapter } from "./db-adapter.js";
import { indexExists } from "./db-schema-metadata.js";

export function dedupeVerificationEvidenceRows(db: DbAdapter): void {
  db.exec(`
    DELETE FROM verification_evidence
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM verification_evidence
      GROUP BY task_id, slice_id, milestone_id, command, verdict
    )
  `);
}

export function ensureVerificationEvidenceDedupIndex(db: DbAdapter): void {
  if (indexExists(db, "idx_verification_evidence_dedup")) return;
  dedupeVerificationEvidenceRows(db);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_evidence_dedup ON verification_evidence(task_id, slice_id, milestone_id, command, verdict)");
}
