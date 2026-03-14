/**
 * Native fuzzy file path discovery using N-API.
 *
 * High-performance fuzzy file search for autocomplete and @-mention resolution.
 * Backed by Rust's `ignore` crate for directory walking with subsequence scoring.
 */

import { native } from "../native.js";
import type {
  FuzzyFindMatch,
  FuzzyFindOptions,
  FuzzyFindResult,
} from "./types.js";

export type { FuzzyFindMatch, FuzzyFindOptions, FuzzyFindResult };

/**
 * Fuzzy file path search.
 *
 * Searches for files and directories whose paths match the query string.
 * Results are sorted by match quality (higher score = better match).
 * Reuses the shared native filesystem scan cache used by glob discovery.
 *
 * Scoring tiers (highest to lowest):
 * - 120: exact filename match
 * - 100: filename starts with query
 * - 80: filename contains query
 * - 60: full path contains query
 * - 50-90: fuzzy subsequence match on filename
 * - 30-70: fuzzy subsequence match on full path
 *
 * Directories receive a +10 score bonus.
 */
export function fuzzyFind(options: FuzzyFindOptions): FuzzyFindResult {
  return native.fuzzyFind(options) as FuzzyFindResult;
}
