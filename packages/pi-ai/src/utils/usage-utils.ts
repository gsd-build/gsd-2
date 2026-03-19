import type { Usage } from "../types.js";

/**
 * A zero-value Usage object. Use as a default or for resetting usage.
 * Do NOT mutate this constant — use `createZeroUsage()` if you need a mutable copy.
 */
export const ZERO_USAGE: Readonly<Usage> = Object.freeze({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }),
});

/**
 * Create a fresh mutable Usage object initialized to zeros.
 */
export function createZeroUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

/**
 * Normalize a tool call ID to contain only safe characters and fit within a max length.
 *
 * Multiple providers (Anthropic, Bedrock, Google) independently sanitize tool call IDs
 * with the same regex and length limit. This utility consolidates that logic.
 *
 * @param id - The raw tool call ID
 * @param maxLength - Maximum character length (default: 64, Anthropic/Bedrock limit)
 * @returns Sanitized ID with only alphanumeric, underscore, and hyphen characters
 */
export function normalizeToolCallId(id: string, maxLength = 64): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, maxLength);
}
