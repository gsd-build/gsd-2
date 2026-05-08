// Project/App: GSD-2
// File Purpose: Verifies Phase 1 RPC contracts remain compatible with Phase 0 golden fixtures.

import assert from "node:assert/strict";
import test from "node:test";
import {
	RPC_COMMAND_TYPES,
	RPC_CONTRACT_VERSION,
	RPC_THINKING_LEVELS,
	RPC_V2_EVENT_TYPES,
	type BashResult,
	type RpcCommand,
	type RpcResponse,
	type RpcV2Event,
} from "../../packages/contracts/src/index.ts";
import { rpcGoldenCommands, rpcGoldenEvents, rpcGoldenResponses } from "./fixtures/rpc-golden-fixtures.ts";

test("contracts package exports the baseline rpc contract version", () => {
	assert.equal(RPC_CONTRACT_VERSION, 1);
});

test("golden commands use command names exported by the contracts package", () => {
	const commands: readonly RpcCommand[] = rpcGoldenCommands;
	for (const command of commands) {
		assert.ok(RPC_COMMAND_TYPES.includes(command.type), `missing command constant: ${command.type}`);
	}
});

test("golden responses retain the canonical BashResult shape", () => {
	const responses: readonly RpcResponse[] = rpcGoldenResponses;
	const bashResponse = responses.find(
		(response): response is Extract<RpcResponse, { command: "bash"; success: true }> =>
			response.type === "response" && response.command === "bash" && response.success
	);
	assert.ok(bashResponse);
	const result: BashResult = bashResponse.data;
	assert.deepEqual(Object.keys(result).sort(), ["cancelled", "exitCode", "output", "truncated"]);
});

test("golden events use event names exported by the contracts package", () => {
	const events: readonly RpcV2Event[] = rpcGoldenEvents;
	for (const event of events) {
		assert.ok(RPC_V2_EVENT_TYPES.includes(event.type), `missing event constant: ${event.type}`);
	}
});

test("golden thinking levels use provider-agnostic contract values", () => {
	const commands: readonly RpcCommand[] = rpcGoldenCommands;
	const thinkingCommand = commands.find(
		(command): command is Extract<RpcCommand, { type: "set_thinking_level" }> => command.type === "set_thinking_level"
	);
	assert.ok(thinkingCommand);
	assert.ok(RPC_THINKING_LEVELS.includes(thinkingCommand.level));
});
