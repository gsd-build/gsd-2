// Project/App: GSD-2
// File Purpose: Tests final provider request-time tool compatibility filtering.

import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@gsd/pi-agent-core";
import { filterToolsForProviderRequest, getAdjustToolSetRequestCustomMessages } from "./sdk.js";
import { registerToolCompatibility, resetToolCompatibilityRegistry } from "./tools/tool-compatibility-registry.js";

function tool(name: string): AgentTool {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		execute: async () => ({ content: [], details: undefined }),
	};
}

test("filterToolsForProviderRequest removes provider-incompatible tools", () => {
	resetToolCompatibilityRegistry();
	try {
		registerToolCompatibility("image_result_tool", { producesImages: true });
		registerToolCompatibility("complex_schema_tool", { schemaFeatures: ["patternProperties"] });

		const result = filterToolsForProviderRequest(
			[tool("bash"), tool("image_result_tool"), tool("complex_schema_tool")],
			{ api: "google-generative-ai", provider: "google" },
		);

		assert.deepEqual(result.compatible.map((entry) => entry.name), ["bash", "image_result_tool"]);
		assert.deepEqual(result.filtered.map((entry) => entry.name), ["complex_schema_tool"]);
	} finally {
		resetToolCompatibilityRegistry();
	}
});

test("filterToolsForProviderRequest enforces provider-specific hard caps at send time", () => {
	const result = filterToolsForProviderRequest(
		Array.from({ length: 130 }, (_, index) => tool(`tool_${index}`)),
		{ api: "openai-completions", provider: "groq" },
	);

	assert.equal(result.compatible.length, 128);
	assert.deepEqual(result.filtered.map((entry) => entry.name), ["tool_128", "tool_129"]);
});

test("getAdjustToolSetRequestCustomMessages only reports custom messages in the current request tail", () => {
	const messages = [
		{ role: "custom", customType: "gsd-run", content: "old workflow", display: false, timestamp: 1 },
		{ role: "assistant", content: [{ type: "text", text: "done" }], timestamp: 2 },
		{ role: "user", content: [{ type: "text", text: "normal prompt" }], timestamp: 3 },
		{ role: "custom", customType: "gsd-doctor-heal", content: "current workflow", display: false, timestamp: 4 },
	] as any[];

	assert.deepEqual(getAdjustToolSetRequestCustomMessages(messages), [
		{ index: 3, customType: "gsd-doctor-heal" },
	]);
});
