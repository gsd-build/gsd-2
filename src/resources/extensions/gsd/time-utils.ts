// GSD-2 — Shared time/duration formatting utilities
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Generate a filesystem-safe timestamp string from a Date.
 * Replaces colons and dots with hyphens so the result is safe as a
 * directory or file name on all platforms (Windows forbids colons).
 *
 * Output format: `2026-04-08T12-30-45` (19 chars, no fractional seconds).
 */
export function makeSafeTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Format a duration in milliseconds to a compact human-readable string.
 * Examples: "12s", "5m", "2h 15m", "expired" (for <= 0).
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
}

/**
 * Format a timestamp as a relative "N ago" string.
 * Examples: "just now", "5m ago", "2h ago", "3d ago".
 */
export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Return the current time as an ISO-8601 string.
 * Convenience for the repeated `ts: new Date().toISOString()` event pattern.
 */
export function nowIso(): string {
  return new Date().toISOString();
}
