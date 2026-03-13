/**
 * Milestone ID generation and matching.
 *
 * New milestones use the format `M-<8 random alphanumeric chars>` (e.g. `M-a8f3x9k2`).
 * Legacy milestones using the `M001` format are recognized by all regex patterns
 * for backward compatibility.
 */

import { randomBytes } from "node:crypto";

/** Matches both legacy `M001` and new `M-a8f3x9k2` milestone ID formats. */
export const MILESTONE_ID_RE = /^(M\d+|M-[a-zA-Z0-9]+)/;

/**
 * Generate a new milestone ID with 8 random alphanumeric characters.
 * Uses crypto.randomBytes for randomness.
 */
export function generateMilestoneId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(8);
  let id = "M-";
  for (let i = 0; i < 8; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

/**
 * Test whether a string looks like a milestone ID (legacy or new format).
 */
export function isMilestoneId(s: string): boolean {
  return MILESTONE_ID_RE.test(s);
}
