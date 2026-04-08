// GSD-2 — Shared string manipulation utilities
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/**
 * Convert text to a URL/filesystem-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens,
 * strips leading/trailing hyphens, and truncates to maxLen.
 */
export function slugify(text: string, maxLen: number = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen)
    .replace(/-$/, "");
}

/**
 * Normalize whitespace: collapse runs of whitespace into single spaces and trim.
 */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
