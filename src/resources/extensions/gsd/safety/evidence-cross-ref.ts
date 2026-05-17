
/**
 * Evidence cross-reference for auto-mode safety harness.
 * Compares the LLM's claimed verification evidence (command + exitCode)
 * against actual bash tool calls recorded by the evidence collector.
 *
 * Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
 */

import type { BashEvidence, EvidenceEntry } from "./evidence-collector.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ClaimedEvidence {
  command: string;
  exitCode: number;
  verdict: string;
  createdAt?: string;
}

export interface EvidenceMismatch {
  severity: "warning" | "error";
  claimed: ClaimedEvidence;
  actual: BashEvidence | null;
  reason: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Cross-reference claimed verification evidence against actual bash tool calls.
 *
 * Returns an array of mismatches. Empty array = all claims verified.
 * Skips entries that were coerced from strings (already flagged by db-tools.ts).
 */
export function crossReferenceEvidence(
  claimedEvidence: readonly ClaimedEvidence[],
  actualEvidence: readonly EvidenceEntry[],
): EvidenceMismatch[] {
  const bashCalls = actualEvidence.filter(
    (e): e is BashEvidence => e.kind === "bash",
  );
  const mismatches: EvidenceMismatch[] = [];

  for (const claimed of latestClaimBatch(claimedEvidence)) {
    // Skip coerced entries — they're already flagged with exitCode: -1
    // and verdict: "unknown (coerced from string)" by db-tools.ts
    if (claimed.verdict?.includes("coerced from string")) continue;
    if (claimed.exitCode === -1) continue;

    // Skip entries with empty or generic commands
    if (!claimed.command || claimed.command.length < 3) continue;

    // Find matching bash calls by command similarity. A command may be retried
    // after a failed first run; the newest matching execution is the one that
    // supports or rejects a claimed pass.
    const matches = findMatches(claimed.command, bashCalls);

    if (matches.length === 0) {
      mismatches.push({
        severity: "warning",
        claimed,
        actual: null,
        reason: `No bash tool call found matching "${claimed.command.slice(0, 80)}"`,
      });
      continue;
    }

    // Exit code mismatch: LLM claims success but actual command failed
    const match = latestMatch(matches);
    if (claimed.exitCode === 0 && match.exitCode !== 0) {
      mismatches.push({
        severity: "error",
        claimed,
        actual: match,
        reason: `Claimed exitCode=0 but actual exitCode=${match.exitCode}`,
      });
    }
  }

  return mismatches;
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Verification evidence rows are append-only across retries, but a task
 * completion inserts one batch at a single created_at timestamp. When that
 * timestamp is present, safety should judge the newest completion claim only.
 */
function latestClaimBatch(
  claimedEvidence: readonly ClaimedEvidence[],
): readonly ClaimedEvidence[] {
  const dated = claimedEvidence
    .map((claim) => ({
      claim,
      time: typeof claim.createdAt === "string" ? Date.parse(claim.createdAt) : Number.NaN,
    }))
    .filter((entry) => Number.isFinite(entry.time));

  if (dated.length === 0) return claimedEvidence;

  const latestTime = Math.max(...dated.map((entry) => entry.time));
  return claimedEvidence.filter((claim) => (
    typeof claim.createdAt === "string" && Date.parse(claim.createdAt) === latestTime
  ));
}

/**
 * Find bash evidence entries matching a claimed command.
 * Uses substring matching — the claimed command may be a shortened version
 * of the actual command, or vice versa.
 */
function findMatches(
  claimedCommand: string,
  bashCalls: readonly BashEvidence[],
): BashEvidence[] {
  const normalized = claimedCommand.trim();

  // Exact matches first
  const exact = bashCalls.filter(b => b.command.trim() === normalized);
  if (exact.length > 0) return exact;

  // Substring match: claimed is contained in actual or actual in claimed
  const substring = bashCalls.filter(
    b => b.command.includes(normalized) || normalized.includes(b.command),
  );
  if (substring.length > 0) return substring;

  // Token match: split on whitespace and check significant overlap
  const claimedTokens = normalized.split(/\s+/).filter(t => t.length > 2);
  if (claimedTokens.length === 0) return [];

  const scoredMatches: Array<{ call: BashEvidence; score: number }> = [];

  for (const call of bashCalls) {
    const callTokens = new Set(call.command.split(/\s+/));
    const matchCount = claimedTokens.filter(t => callTokens.has(t)).length;
    const score = matchCount / claimedTokens.length;
    if (score >= 0.5) {
      scoredMatches.push({ call, score });
    }
  }

  const bestScore = Math.max(0, ...scoredMatches.map((match) => match.score));
  return scoredMatches
    .filter((match) => match.score === bestScore)
    .map((match) => match.call);
}

function latestMatch(matches: readonly BashEvidence[]): BashEvidence {
  return matches.reduce((latest, match) => (
    match.timestamp > latest.timestamp ? match : latest
  ));
}
