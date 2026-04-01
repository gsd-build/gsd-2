// GSD2 — Tests for Ollama model discovery and enrichment
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getOllamaOpenAIBaseUrl } from "../ollama-discovery.js";

// ─── getOllamaOpenAIBaseUrl ─────────────────────────────────────────────────

describe("getOllamaOpenAIBaseUrl", () => {
	const originalHost = process.env.OLLAMA_HOST;

	afterEach(() => {
		if (originalHost === undefined) {
			delete process.env.OLLAMA_HOST;
		} else {
			process.env.OLLAMA_HOST = originalHost;
		}
	});

	it("returns default OpenAI-compat URL", () => {
		delete process.env.OLLAMA_HOST;
		assert.equal(getOllamaOpenAIBaseUrl(), "http://localhost:11434/v1");
	});

	it("appends /v1 to custom OLLAMA_HOST", () => {
		process.env.OLLAMA_HOST = "http://remote:9999";
		assert.equal(getOllamaOpenAIBaseUrl(), "http://remote:9999/v1");
	});
});
