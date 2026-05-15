import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	DISCOVERY_TTLS,
	getDefaultTTL,
	getDiscoverableProviders,
	getDiscoveryAdapter,
	supportsDiscoveryForApi,
} from "./model-discovery.js";

// ─── getDiscoveryAdapter ─────────────────────────────────────────────────────

describe("getDiscoveryAdapter", () => {
	it("returns an adapter for openai", () => {
		const adapter = getDiscoveryAdapter("openai");
		assert.equal(adapter.provider, "openai");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for ollama", () => {
		const adapter = getDiscoveryAdapter("ollama");
		assert.equal(adapter.provider, "ollama");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for openrouter", () => {
		const adapter = getDiscoveryAdapter("openrouter");
		assert.equal(adapter.provider, "openrouter");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for google", () => {
		const adapter = getDiscoveryAdapter("google");
		assert.equal(adapter.provider, "google");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns a static adapter for anthropic", () => {
		const adapter = getDiscoveryAdapter("anthropic");
		assert.equal(adapter.provider, "anthropic");
		assert.equal(adapter.supportsDiscovery, false);
	});

	it("returns a static adapter for bedrock", () => {
		const adapter = getDiscoveryAdapter("bedrock");
		assert.equal(adapter.provider, "bedrock");
		assert.equal(adapter.supportsDiscovery, false);
	});

	it("returns a static adapter for unknown providers", () => {
		const adapter = getDiscoveryAdapter("unknown-provider");
		assert.equal(adapter.provider, "unknown-provider");
		assert.equal(adapter.supportsDiscovery, false);
	});

	it("returns OpenAI-style adapter for unknown provider with OpenAI-compatible API", () => {
		const adapter = getDiscoveryAdapter("my-proxy", ["openai-completions"]);
		assert.equal(adapter.provider, "my-proxy");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("static adapter fetchModels returns empty array", async () => {
		const adapter = getDiscoveryAdapter("anthropic");
		const models = await adapter.fetchModels("key");
		assert.deepEqual(models, []);
	});
});

// ─── getDiscoverableProviders ────────────────────────────────────────────────

describe("getDiscoverableProviders", () => {
	it("returns only providers that support discovery", () => {
		const providers = getDiscoverableProviders();
		assert.ok(providers.includes("openai"));
		assert.ok(providers.includes("ollama"));
		assert.ok(providers.includes("openrouter"));
		assert.ok(providers.includes("google"));
		assert.ok(!providers.includes("anthropic"));
		assert.ok(!providers.includes("bedrock"));
	});

	it("returns an array of strings", () => {
		const providers = getDiscoverableProviders();
		assert.ok(Array.isArray(providers));
		for (const p of providers) {
			assert.equal(typeof p, "string");
		}
	});
});

// ─── getDefaultTTL ───────────────────────────────────────────────────────────

describe("getDefaultTTL", () => {
	it("returns 5 minutes for ollama", () => {
		assert.equal(getDefaultTTL("ollama"), 5 * 60 * 1000);
	});

	it("returns 1 hour for openai", () => {
		assert.equal(getDefaultTTL("openai"), 60 * 60 * 1000);
	});

	it("returns 1 hour for google", () => {
		assert.equal(getDefaultTTL("google"), 60 * 60 * 1000);
	});

	it("returns 1 hour for openrouter", () => {
		assert.equal(getDefaultTTL("openrouter"), 60 * 60 * 1000);
	});

	it("returns 24 hours for unknown providers", () => {
		assert.equal(getDefaultTTL("some-custom"), 24 * 60 * 60 * 1000);
	});
});

// ─── DISCOVERY_TTLS ──────────────────────────────────────────────────────────

describe("DISCOVERY_TTLS", () => {
	it("has expected keys", () => {
		assert.ok("ollama" in DISCOVERY_TTLS);
		assert.ok("openai" in DISCOVERY_TTLS);
		assert.ok("google" in DISCOVERY_TTLS);
		assert.ok("openrouter" in DISCOVERY_TTLS);
		assert.ok("default" in DISCOVERY_TTLS);
	});

	it("all values are positive numbers", () => {
		for (const [, value] of Object.entries(DISCOVERY_TTLS)) {
			assert.equal(typeof value, "number");
			assert.ok(value > 0);
		}
	});
});

describe("supportsDiscoveryForApi", () => {
	it("returns true for OpenAI-compatible APIs", () => {
		assert.equal(supportsDiscoveryForApi("openai-completions"), true);
		assert.equal(supportsDiscoveryForApi("openai-responses"), true);
	});

	it("returns false for non-discoverable APIs", () => {
		assert.equal(supportsDiscoveryForApi("anthropic-messages"), false);
		assert.equal(supportsDiscoveryForApi(undefined), false);
	});
});

// ─── discovery list URL resolution (regression: no doubled /v1 or /api/v1) ─────

describe("discovery fetchModels — list URL resolution", () => {
	let prevFetch: typeof fetch;

	beforeEach(() => {
		prevFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = prevFetch;
	});

	it("OpenRouter: registry-style base does not double /api/v1", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openrouter");
		await adapter.fetchModels("sk-test", "https://openrouter.ai/api/v1");
		assert.equal(requestedUrl, "https://openrouter.ai/api/v1/models");
	});

	it("OpenRouter: host-only base gets /api/v1/models", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openrouter");
		await adapter.fetchModels("sk-test", "https://openrouter.example");
		assert.equal(requestedUrl, "https://openrouter.example/api/v1/models");
	});

	it("OpenRouter: default base when baseUrl omitted", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openrouter");
		await adapter.fetchModels("sk-test", undefined);
		assert.equal(requestedUrl, "https://openrouter.ai/api/v1/models");
	});

	it("OpenAI adapter: registry-style base does not double /v1", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openai");
		await adapter.fetchModels("sk-test", "https://api.openai.com/v1");
		assert.equal(requestedUrl, "https://api.openai.com/v1/models");
	});

	it("OpenAI adapter: proxy path preserves single /v1 segment", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openai");
		await adapter.fetchModels("sk-test", "https://proxy.example.com/route/v1");
		assert.equal(requestedUrl, "https://proxy.example.com/route/v1/models");
	});

	it("OpenAI adapter: host-only base gets /v1/models", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openai");
		await adapter.fetchModels("sk-test", "https://api.minimax.example");
		assert.equal(requestedUrl, "https://api.minimax.example/v1/models");
	});

	it("OpenAI adapter: default base when baseUrl omitted", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openai");
		await adapter.fetchModels("sk-test", undefined);
		assert.equal(requestedUrl, "https://api.openai.com/v1/models");
	});

	it("Google: registry-style base does not double /v1beta", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ models: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("google");
		await adapter.fetchModels("google-key", "https://generativelanguage.googleapis.com/v1beta");
		const parsed = new URL(requestedUrl);
		assert.equal(parsed.pathname, "/v1beta/models");
		assert.equal(parsed.searchParams.get("key"), "google-key");
	});

	it("Google: default base when baseUrl omitted", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ models: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("google");
		await adapter.fetchModels("gk", undefined);
		const parsed = new URL(requestedUrl);
		assert.equal(parsed.origin, "https://generativelanguage.googleapis.com");
		assert.equal(parsed.pathname, "/v1beta/models");
		assert.equal(parsed.searchParams.get("key"), "gk");
	});

	it("Ollama: default base when baseUrl omitted", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ models: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("ollama");
		await adapter.fetchModels("", undefined);
		assert.equal(requestedUrl, "http://localhost:11434/api/tags");
	});

	it("OpenAI-compat custom provider: host-only base gets /v1/models", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("my-proxy", ["openai-completions"]);
		await adapter.fetchModels("k", "https://api.custom.example");
		assert.equal(requestedUrl, "https://api.custom.example/v1/models");
	});

	it("OpenAI adapter: rejects discovery base URL with query string", async () => {
		globalThis.fetch = (async () => {
			throw new Error("fetch should not run");
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openai");
		await assert.rejects(adapter.fetchModels("sk-test", "https://api.openai.com/v1?x=1"), /query string or hash fragment/i);
	});

	it("Google: rejects discovery base URL with hash fragment", async () => {
		globalThis.fetch = (async () => {
			throw new Error("fetch should not run");
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("google");
		await assert.rejects(
			adapter.fetchModels("google-key", "https://generativelanguage.googleapis.com/v1beta#bad"),
			/query string or hash fragment/i,
		);
	});

	it("OpenAI adapter: non-array payload.data yields empty DiscoveredModel list", async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify({ data: { not: "an-array" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openai");
		const models = await adapter.fetchModels("sk-test");
		assert.deepEqual(models, []);
	});

	it("OpenRouter: invalid pricing strings omit cost (no NaN)", async () => {
		globalThis.fetch = (async () => {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: "m1",
							name: "M1",
							pricing: { prompt: "not-a-number", completion: "0.000001" },
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const adapter = getDiscoveryAdapter("openrouter");
		const models = await adapter.fetchModels("sk-test");
		assert.equal(models.length, 1);
		assert.equal(models[0].id, "m1");
		assert.equal(models[0].cost, undefined);
	});
});
