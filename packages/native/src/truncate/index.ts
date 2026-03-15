/**
 * Line-boundary-aware output truncation (async with timeout enforcement).
 *
 * Truncates tool output at line boundaries, counting by UTF-8 bytes.
 * Three modes: head (keep end), tail (keep start), both (keep start+end).
 *
 * All functions are async wrappers with Promise.race() timeout enforcement
 * to prevent event loop blocking on native code hangs.
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
 * Timeout for truncate operations (default: 5 seconds).
 * Reduces CPU usage when native code hangs.
 */
const TRUNCATE_TIMEOUT_MS = 5000;

/**
 * Execute a native function with timeout enforcement via Promise.race().
 * Uses AbortSignal for proper cleanup.
 */
async function executeWithTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number = TRUNCATE_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`Truncate operation timed out after ${timeoutMs}ms`));
        });
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Keep the first `maxBytes` worth of complete lines.
 * Async wrapper with Promise.race() timeout enforcement.
 */
export async function truncateTail(
  text: string,
  maxBytes: number,
  timeoutMs: number = TRUNCATE_TIMEOUT_MS
): Promise<TruncateResult> {
  const fn = () =>
    (native as Record<string, Function>).truncateTail(text, maxBytes);

  return executeWithTimeout(fn, timeoutMs);
}

/**
 * Keep the last `maxBytes` worth of complete lines.
 * Async wrapper with Promise.race() timeout enforcement.
 */
export async function truncateHead(
  text: string,
  maxBytes: number,
  timeoutMs: number = TRUNCATE_TIMEOUT_MS
): Promise<TruncateResult> {
  const fn = () =>
    (native as Record<string, Function>).truncateHead(text, maxBytes);

  return executeWithTimeout(fn, timeoutMs);
}

/**
 * Main entry point: truncate tool output with head/tail/both modes.
 * Async wrapper with Promise.race() timeout enforcement.
 */
export async function truncateOutput(
  text: string,
  maxBytes: number,
  mode: string = "tail",
  timeoutMs: number = TRUNCATE_TIMEOUT_MS
): Promise<TruncateOutputResult> {
  const fn = () =>
    (native as Record<string, Function>).truncateOutput(text, maxBytes, mode);

  return executeWithTimeout(fn, timeoutMs);
}