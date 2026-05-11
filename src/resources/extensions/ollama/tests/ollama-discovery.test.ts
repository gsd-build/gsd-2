// GSD2 — Tests for Ollama model discovery and enrichment
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverModels } from "../ollama-discovery.js";
import type { OllamaTagsResponse, OllamaShowResponse } from "../types.js";

const EMPTY_DETAILS = { parent_model: "", format: "", family: "", families: null, parameter_size: "", quantization_level: "" };

function modelStub(name: string, parameterSize = "") {
	return { name, model: name, modified_at: "", size: 0, digest: "", details: { ...EMPTY_DETAILS, parameter_size: parameterSize } };
}

function tagsStub(name: string, parameterSize = ""): OllamaTagsResponse {
	return { models: [modelStub(name, parameterSize)] };
}

function showStub(modelInfo: Record<string, unknown>, capabilities?: string[]): OllamaShowResponse {
	return { modelfile: "", parameters: "", template: "", details: EMPTY_DETAILS, model_info: modelInfo, capabilities };
}

describe("discoverModels — context window resolution", () => {
	it("prefers /api/show context_length over known table value", async () => {
		// /api/show is the authoritative source for context window (ollama
		// metadata derived from the model file). The static table is a
		// fallback for old ollama versions and network failures. Earlier
		// versions of this code preferred the table, but the table fell
		// behind reality on several model families (deepseek-v4-* underreported
		// at 131072 vs real 1048576; minimax-m2.7 overreported at 1048576 vs
		// real 196608). Trusting /api/show keeps gsd correct without
		// chasing a perpetually-stale table.
		const models = await discoverModels({
			listModels: async () => tagsStub("llama3.2:latest", "3B"),
			showModel: async () => showStub({ "llama.context_length": 4096 }),
		});
		assert.equal(models[0].contextWindow, 4096);
	});

	it("falls back to known table when /api/show omits context_length", async () => {
		// Even though the model matches a known table entry (llama3.2 at
		// 131072), if /api/show response carries no context_length key the
		// table still serves as the fallback. This preserves correctness on
		// older ollama versions that don't emit per-architecture context.
		const models = await discoverModels({
			listModels: async () => tagsStub("llama3.2:latest", "3B"),
			showModel: async () => showStub({}),
		});
		assert.equal(models[0].contextWindow, 131072);
	});

	it("uses context_length from /api/show model_info for unknown model", async () => {
		const models = await discoverModels({
			listModels: async () => tagsStub("gemini-3-flash-preview:latest"),
			showModel: async () => showStub({ "gemini.context_length": 1048576 }),
		});
		assert.equal(models[0].contextWindow, 1048576);
	});

	it("falls back to 8192 when /api/show model_info has no context_length key", async () => {
		const models = await discoverModels({
			listModels: async () => tagsStub("unknown-model:latest"),
			showModel: async () => showStub({}),
		});
		assert.equal(models[0].contextWindow, 8192);
	});

	it("falls back to 8192 when /api/show throws", async () => {
		const models = await discoverModels({
			listModels: async () => tagsStub("unknown-model:latest"),
			showModel: async () => { throw new Error("network error"); },
		});
		assert.equal(models[0].contextWindow, 8192);
	});
});

describe("discoverModels — reasoning detection from /api/show capabilities", () => {
	it("flags reasoning=true when capabilities include 'thinking' (cloud model)", async () => {
		// Real-world: glm-5.1:cloud → /api/show returns capabilities: ['thinking', 'completion', 'tools']
		const models = await discoverModels({
			listModels: async () => tagsStub("glm-5.1:cloud"),
			showModel: async () => showStub({ "glm5.1.context_length": 131072 }, ["thinking", "completion", "tools"]),
		});
		assert.equal(models[0].reasoning, true);
	});

	it("flags reasoning=false when capabilities array is present but excludes 'thinking'", async () => {
		// A genuinely non-thinking model with capabilities returned should respect the API
		const models = await discoverModels({
			listModels: async () => tagsStub("totally-unknown-model:7b", "7B"),
			showModel: async () => showStub({}, ["completion", "tools"]),
		});
		assert.equal(models[0].reasoning, false);
	});

	it("falls back to KNOWN_MODELS table when /api/show omits capabilities", async () => {
		// Older ollama versions don't return capabilities field
		const models = await discoverModels({
			listModels: async () => tagsStub("deepseek-r1:8b"),
			showModel: async () => showStub({}),
		});
		assert.equal(models[0].reasoning, true);
	});

	it("falls back to KNOWN_MODELS table when /api/show throws", async () => {
		const models = await discoverModels({
			listModels: async () => tagsStub("qwq:32b"),
			showModel: async () => { throw new Error("network error"); },
		});
		assert.equal(models[0].reasoning, true);
	});

	it("defaults reasoning=false for unknown model with no capabilities and no /api/show", async () => {
		const models = await discoverModels({
			listModels: async () => tagsStub("brand-new-model:7b", "7B"),
			showModel: async () => { throw new Error("network error"); },
		});
		assert.equal(models[0].reasoning, false);
	});

	it("calls /api/show even when context window is known in table (to pick up capabilities)", async () => {
		// Behavior change: previously skipped /api/show when table had context window.
		// Now must always call to learn about thinking capability.
		let showCalled = false;
		await discoverModels({
			listModels: async () => tagsStub("llama3.2:latest", "3B"),
			showModel: async () => { showCalled = true; return showStub({}, ["completion"]); },
		});
		assert.equal(showCalled, true);
	});
});