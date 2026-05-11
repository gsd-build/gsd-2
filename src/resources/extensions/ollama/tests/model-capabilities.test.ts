// GSD2 — Tests for Ollama model capability detection
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	getModelCapabilities,
	estimateContextFromParams,
	humanizeModelName,
	formatModelSize,
} from "../model-capabilities.js";

// ─── getModelCapabilities ────────────────────────────────────────────────────

describe("getModelCapabilities", () => {
	it("returns reasoning for deepseek-r1 models", () => {
		const caps = getModelCapabilities("deepseek-r1:8b");
		assert.equal(caps.reasoning, true);
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns reasoning for qwq models", () => {
		const caps = getModelCapabilities("qwq:32b");
		assert.equal(caps.reasoning, true);
	});

	it("returns vision for llava models", () => {
		const caps = getModelCapabilities("llava:7b");
		assert.deepEqual(caps.input, ["text", "image"]);
	});

	it("returns vision for llama3.2-vision models", () => {
		const caps = getModelCapabilities("llama3.2-vision:11b");
		assert.deepEqual(caps.input, ["text", "image"]);
	});

	it("returns correct context for llama3.1", () => {
		const caps = getModelCapabilities("llama3.1:8b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns correct context for llama3 (no .1)", () => {
		const caps = getModelCapabilities("llama3:8b");
		assert.equal(caps.contextWindow, 8192);
	});

	it("returns correct context for llama2", () => {
		const caps = getModelCapabilities("llama2:7b");
		assert.equal(caps.contextWindow, 4096);
	});

	it("returns correct context for qwen2.5-coder", () => {
		const caps = getModelCapabilities("qwen2.5-coder:7b");
		assert.equal(caps.contextWindow, 131072);
		assert.equal(caps.maxTokens, 32768);
	});

	it("returns correct context for codestral", () => {
		const caps = getModelCapabilities("codestral:22b");
		assert.equal(caps.contextWindow, 262144);
	});

	it("returns correct context for mistral-nemo", () => {
		const caps = getModelCapabilities("mistral-nemo:12b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns correct context for gemma3", () => {
		const caps = getModelCapabilities("gemma3:9b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("returns empty object for unknown models", () => {
		const caps = getModelCapabilities("totally-unknown-model:3b");
		assert.deepEqual(caps, {});
	});

	it("strips tag before matching", () => {
		const caps = getModelCapabilities("llama3.1:70b-instruct-q4_0");
		assert.equal(caps.contextWindow, 131072);
	});

	it("matches case-insensitively", () => {
		const caps = getModelCapabilities("Llama3.1:8B");
		assert.equal(caps.contextWindow, 131072);
	});

	// ─── New reasoning-model fallback entries (cloud + local) ──────────────────
	// These exist as a fallback for ollama versions whose /api/show response
	// does not include the `capabilities` array. When capabilities are present,
	// detection happens dynamically in ollama-discovery.ts.

	it("flags gpt-oss as reasoning (covers :20b, :120b, :*-cloud)", () => {
		assert.equal(getModelCapabilities("gpt-oss:20b").reasoning, true);
		assert.equal(getModelCapabilities("gpt-oss:120b-cloud").reasoning, true);
	});

	it("flags deepseek-v3.1/v4 family as reasoning", () => {
		assert.equal(getModelCapabilities("deepseek-v3.1:671b-cloud").reasoning, true);
		assert.equal(getModelCapabilities("deepseek-v4-flash:cloud").reasoning, true);
	});

	it("flags glm-4.x/5.x family as reasoning", () => {
		assert.equal(getModelCapabilities("glm-4.6:cloud").reasoning, true);
		assert.equal(getModelCapabilities("glm-5.1:cloud").reasoning, true);
	});

	it("flags kimi-k2 family as reasoning", () => {
		assert.equal(getModelCapabilities("kimi-k2:1t-cloud").reasoning, true);
		assert.equal(getModelCapabilities("kimi-k2.6:cloud").reasoning, true);
	});

	it("flags qwen3 as reasoning (hybrid thinking model)", () => {
		assert.equal(getModelCapabilities("qwen3:8b").reasoning, true);
		assert.equal(getModelCapabilities("qwen3-next:cloud").reasoning, true);
	});

	it("flags minimax-m2 family as reasoning", () => {
		assert.equal(getModelCapabilities("minimax-m2.7:cloud").reasoning, true);
	});

	it("flags gemma4 (with thinking) as reasoning", () => {
		assert.equal(getModelCapabilities("gemma4:31b-cloud").reasoning, true);
	});

	it("flags gemini-3-flash-preview as reasoning", () => {
		assert.equal(getModelCapabilities("gemini-3-flash-preview:cloud").reasoning, true);
	});
});

// ─── Ordering / prefix-shadowing regression (#4991) ──────────────────────────
//
// The lookup is a linear scan over KNOWN_MODELS using `baseName.startsWith(pattern)`.
// Cloud and long-variant model names share prefixes with their base families,
// so the longer entries MUST appear earlier in the table — otherwise a base
// like `qwen3` shadows `qwen3-coder`/`qwen3-next`/`qwen3.5` and the picker
// reports the wrong context window. These tests pin the ordering.

describe("getModelCapabilities — long-variant overrides aren't shadowed (#4991)", () => {
	it("qwen3-coder reports 256K, not the qwen3 131K", () => {
		const caps = getModelCapabilities("qwen3-coder:480b");
		assert.equal(caps.contextWindow, 262144);
		assert.equal(caps.ollamaOptions?.num_ctx, 262144);
	});

	it("qwen3-coder-next still resolves via the qwen3-coder entry", () => {
		const caps = getModelCapabilities("qwen3-coder-next");
		assert.equal(caps.contextWindow, 262144);
	});

	it("qwen3-next:80b reports 1M, not the qwen3 131K", () => {
		const caps = getModelCapabilities("qwen3-next:80b");
		assert.equal(caps.contextWindow, 1048576);
	});

	it("qwen3.5 / qwen3.6 cloud variants report 1M", () => {
		assert.equal(getModelCapabilities("qwen3.5:397b").contextWindow, 1048576);
		assert.equal(getModelCapabilities("qwen3.6:cloud").contextWindow, 1048576);
	});

	it("base qwen3 still resolves to its 131K entry", () => {
		const caps = getModelCapabilities("qwen3:8b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("glm-5.1:cloud reports 200K", () => {
		const caps = getModelCapabilities("glm-5.1:cloud");
		assert.equal(caps.contextWindow, 204800);
	});

	it("glm-4.6:cloud reports 200K", () => {
		const caps = getModelCapabilities("glm-4.6:cloud");
		assert.equal(caps.contextWindow, 204800);
	});

	it("glm-4 base still resolves to its 131K entry", () => {
		const caps = getModelCapabilities("glm-4:9b");
		assert.equal(caps.contextWindow, 131072);
	});

	it("kimi-k2-thinking reports 256K (not shadowed by kimi-k2)", () => {
		const caps = getModelCapabilities("kimi-k2-thinking");
		assert.equal(caps.contextWindow, 262144);
	});

	it("kimi-k2.5:cloud and kimi-k2.6:cloud both report 256K", () => {
		assert.equal(getModelCapabilities("kimi-k2.5:cloud").contextWindow, 262144);
		assert.equal(getModelCapabilities("kimi-k2.6:cloud").contextWindow, 262144);
	});

	it("kimi-k2 base resolves to 256K", () => {
		const caps = getModelCapabilities("kimi-k2:cloud");
		assert.equal(caps.contextWindow, 262144);
	});

	it("minimax-m2.5:cloud at 1M (base default); minimax-m2.7:cloud at real 192K", () => {
		// minimax-m2 family base was announced at 1M; m2.5 retained that.
		// m2.7 ships at 196608 per ollama /api/show — confirmed empirically
		// against gsd-build/gsd-2#4984 follow-up. Long-variant beats base.
		assert.equal(getModelCapabilities("minimax-m2.5:cloud").contextWindow, 1048576);
		assert.equal(getModelCapabilities("minimax-m2.7:cloud").contextWindow, 196608);
	});

	it("minimax-m2 base resolves to 1M", () => {
		const caps = getModelCapabilities("minimax-m2:cloud");
		assert.equal(caps.contextWindow, 1048576);
	});

	it("ollamaOptions.num_ctx mirrors contextWindow for all new entries", () => {
		// Inference time: num_ctx is what gets sent to Ollama on each chat.
		// If contextWindow is right but num_ctx is stale, the model still
		// gets truncated. Pin both sides.
		for (const name of [
			"qwen3-next:80b",
			"qwen3-coder:480b",
			"glm-5.1:cloud",
			"kimi-k2-thinking",
			"minimax-m2.7:cloud",
		]) {
			const caps = getModelCapabilities(name);
			assert.equal(
				caps.ollamaOptions?.num_ctx,
				caps.contextWindow,
				`${name}: num_ctx (${caps.ollamaOptions?.num_ctx}) must equal contextWindow (${caps.contextWindow})`,
			);
		}
	});
});

// ─── estimateContextFromParams ───────────────────────────────────────────────

describe("estimateContextFromParams", () => {
	it("estimates 8192 for small models", () => {
		assert.equal(estimateContextFromParams("1.5B"), 8192);
	});

	it("estimates 16384 for 7B models", () => {
		assert.equal(estimateContextFromParams("7B"), 16384);
	});

	it("estimates 32768 for 13B models", () => {
		assert.equal(estimateContextFromParams("13B"), 32768);
	});

	it("estimates 65536 for 34B models", () => {
		assert.equal(estimateContextFromParams("34B"), 65536);
	});

	it("estimates 131072 for 70B+ models", () => {
		assert.equal(estimateContextFromParams("70B"), 131072);
	});

	it("handles decimal sizes", () => {
		assert.equal(estimateContextFromParams("7.5B"), 16384);
	});

	it("handles M (millions)", () => {
		assert.equal(estimateContextFromParams("500M"), 8192);
	});

	it("returns 8192 for unparseable input", () => {
		assert.equal(estimateContextFromParams("unknown"), 8192);
	});

	it("returns 8192 for empty string", () => {
		assert.equal(estimateContextFromParams(""), 8192);
	});
});

// ─── humanizeModelName ───────────────────────────────────────────────────────

describe("humanizeModelName", () => {
	it("capitalizes and adds tag", () => {
		assert.equal(humanizeModelName("llama3.1:8b"), "Llama 3.1 8B");
	});

	it("handles latest tag", () => {
		assert.equal(humanizeModelName("llama3.1:latest"), "Llama 3.1");
	});

	it("handles no tag", () => {
		assert.equal(humanizeModelName("llama3.1"), "Llama 3.1");
	});

	it("handles hyphenated names", () => {
		const result = humanizeModelName("deepseek-r1:8b");
		assert.ok(result.includes("8B"));
	});
});

// ─── formatModelSize ─────────────────────────────────────────────────────────

describe("formatModelSize", () => {
	it("formats GB", () => {
		assert.equal(formatModelSize(4_700_000_000), "4.7 GB");
	});

	it("formats MB", () => {
		assert.equal(formatModelSize(500_000_000), "500.0 MB");
	});

	it("formats KB", () => {
		assert.equal(formatModelSize(500_000), "500 KB");
	});
});
