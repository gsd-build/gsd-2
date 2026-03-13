/**
 * Line-boundary-aware output truncation (native Rust).
 *
 * Truncates tool output at line boundaries, counting by UTF-8 bytes.
 * Three modes: head (keep end), tail (keep start), both (keep start+end).
 */

import { native } from "../native.js";

export interface TruncateResult {
  text: string;
  truncated: boolean;
  originalLines: number;
  keptLines: number;
}

export interface TruncateOutputResult {
  text: string;
  truncated: boolean;
  message?: string;
}

/**
 * Keep the first `maxBytes` worth of complete lines.
 */
export function truncateTail(text: string, maxBytes: number): TruncateResult {
  return (native as Record<string, Function>).truncateTail(text, maxBytes) as TruncateResult;
}

/**
 * Keep the last `maxBytes` worth of complete lines.
 */
export function truncateHead(text: string, maxBytes: number): TruncateResult {
  return (native as Record<string, Function>).truncateHead(text, maxBytes) as TruncateResult;
}

/**
 * Main entry point: truncate tool output with head/tail/both modes.
 */
export function truncateOutput(
  text: string,
  maxBytes: number,
  mode?: string,
): TruncateOutputResult {
  return (native as Record<string, Function>).truncateOutput(
    text,
    maxBytes,
    mode,
  ) as TruncateOutputResult;
}
