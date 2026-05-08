// Project/App: GSD-2
// File Purpose: Verifies VS Code display helpers consume shared RPC contract payloads.

import test from "node:test";
import assert from "node:assert/strict";
import type { BashResult, SessionStats } from "@gsd-build/contracts";
import {
	formatSessionStatsLines,
	getBashExitCode,
	getBashOutput,
	getContextUsageDisplay,
	getSessionCost,
	getSessionTotalTokens,
} from "../src/rpc-display.ts";

test("session stats display helpers consume canonical token and cost fields", () => {
	const stats: SessionStats = {
		sessionFile: "/tmp/session.jsonl",
		sessionId: "session-1",
		userMessages: 2,
		assistantMessages: 3,
		toolCalls: 4,
		toolResults: 4,
		totalMessages: 9,
		tokens: {
			input: 100,
			output: 50,
			cacheRead: 25,
			cacheWrite: 10,
			total: 185,
		},
		cost: 0.1234,
	};

	assert.equal(getSessionTotalTokens(stats), 185);
	assert.equal(getSessionCost(stats), 0.1234);
	assert.deepEqual(getContextUsageDisplay(stats), {
		percent: null,
		text: "Context unknown",
	});
	assert.deepEqual(formatSessionStatsLines(stats), [
		"Input tokens: 100",
		"Output tokens: 50",
		"Cache read: 25",
		"Cache write: 10",
		"Cost: $0.1234",
		"Messages: 9",
		"Tool calls: 4",
	]);
});

test("bash display helpers consume canonical bash result fields", () => {
	const result: BashResult = {
		output: "hello\n",
		exitCode: 0,
		cancelled: false,
		truncated: false,
	};

	assert.equal(getBashOutput(result), "hello\n");
	assert.equal(getBashExitCode(result), 0);
});
