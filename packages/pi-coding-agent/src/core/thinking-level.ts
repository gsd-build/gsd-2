/**
 * Thinking level validation — shared between cli/args.ts and core/model-resolver.ts.
 */

import type { ThinkingLevel } from "@gsd/pi-agent-core";

export const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
	return VALID_THINKING_LEVELS.includes(level as ThinkingLevel);
}
