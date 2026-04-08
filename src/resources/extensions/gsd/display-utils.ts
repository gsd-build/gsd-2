// GSD-2 — Shared display/formatting utilities
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Strip common provider prefixes from a model identifier for compact display.
 * "claude-3-5-sonnet-20241022" → "3-5-sonnet-20241022"
 * "anthropic/claude-3-5-sonnet" → "claude-3-5-sonnet"
 */
export function shortModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/^anthropic\//, "");
}
