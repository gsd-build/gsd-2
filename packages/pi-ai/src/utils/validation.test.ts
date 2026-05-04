import test from "node:test";
import assert from "node:assert/strict";
import { Type } from "@sinclair/typebox";

import { validateToolArguments } from "./validation.js";
import type { Tool, ToolCall } from "../types.js";

test("validation error summarizes large received arguments", () => {
	const tool: Tool = {
		name: "demo_tool",
		description: "demo",
		parameters: Type.Object({
			requiredField: Type.String(),
		}),
	};

	const big = "x".repeat(5000);
	const toolCall: ToolCall = {
		type: "toolCall",
		id: "tc_1",
		name: "demo_tool",
		arguments: {
			optionalBlob: big,
		},
	};

	assert.throws(() => validateToolArguments(tool, toolCall), (err: unknown) => {
		assert.ok(err instanceof Error);
		assert.match(err.message, /Received arguments \(summarized\):/);
		assert.match(err.message, /truncated, \d+ chars omitted/);
		assert.ok(err.message.length < 2500, "error message should be capped and not echo full payload");
		return true;
	});
});
