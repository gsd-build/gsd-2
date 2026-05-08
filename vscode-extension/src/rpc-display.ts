// Project/App: GSD-2
// File Purpose: Display helpers for shared RPC contract payloads in the VS Code extension.

import type { BashResult, SessionStats } from "@gsd-build/contracts" with { "resolution-mode": "import" };

export interface ContextUsageDisplay {
	percent: number | null;
	text: string;
}

export function getSessionInputTokens(stats: SessionStats | null | undefined): number {
	return stats?.tokens.input ?? 0;
}

export function getSessionOutputTokens(stats: SessionStats | null | undefined): number {
	return stats?.tokens.output ?? 0;
}

export function getSessionCacheReadTokens(stats: SessionStats | null | undefined): number {
	return stats?.tokens.cacheRead ?? 0;
}

export function getSessionCacheWriteTokens(stats: SessionStats | null | undefined): number {
	return stats?.tokens.cacheWrite ?? 0;
}

export function getSessionTotalTokens(stats: SessionStats | null | undefined): number {
	return stats?.tokens.total ?? (getSessionInputTokens(stats) + getSessionOutputTokens(stats));
}

export function getSessionCost(stats: SessionStats | null | undefined): number {
	return stats?.cost ?? 0;
}

export function hasSessionTokenStats(stats: SessionStats | null | undefined): boolean {
	return getSessionInputTokens(stats) > 0 || getSessionOutputTokens(stats) > 0;
}

export function getContextUsageDisplay(_stats: SessionStats | null | undefined): ContextUsageDisplay {
	return {
		percent: null,
		text: "Context unknown",
	};
}

export function formatSessionStatsLines(stats: SessionStats): string[] {
	const lines = [
		`Input tokens: ${getSessionInputTokens(stats).toLocaleString()}`,
		`Output tokens: ${getSessionOutputTokens(stats).toLocaleString()}`,
	];
	if (getSessionCacheReadTokens(stats) > 0) {
		lines.push(`Cache read: ${getSessionCacheReadTokens(stats).toLocaleString()}`);
	}
	if (getSessionCacheWriteTokens(stats) > 0) {
		lines.push(`Cache write: ${getSessionCacheWriteTokens(stats).toLocaleString()}`);
	}
	lines.push(`Cost: $${getSessionCost(stats).toFixed(4)}`);
	lines.push(`Messages: ${stats.totalMessages.toLocaleString()}`);
	if (stats.toolCalls > 0) {
		lines.push(`Tool calls: ${stats.toolCalls.toLocaleString()}`);
	}
	return lines;
}

export function getBashOutput(result: BashResult): string {
	return result.output;
}

export function getBashExitCode(result: BashResult): number | undefined {
	return result.exitCode;
}
