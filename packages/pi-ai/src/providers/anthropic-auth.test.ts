import test from "node:test";
import assert from "node:assert/strict";
import type { Model } from "../types.js";

import { buildAnthropicClientOptions, usesAnthropicBearerAuth, resolveAnthropicBaseUrl } from "./anthropic.js";

function anthropicModel(overrides: Partial<Model<"anthropic-messages">> = {}): Model<"anthropic-messages"> {
	return {
		id: "claude-sonnet-4",
		name: "Claude Sonnet 4",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
		...overrides,
	};
}

test("usesAnthropicBearerAuth covers Bearer-only Anthropic-compatible providers (#3783)", () => {
	assert.equal(usesAnthropicBearerAuth("alibaba-coding-plan"), true);
	assert.equal(usesAnthropicBearerAuth("minimax"), true);
	assert.equal(usesAnthropicBearerAuth("minimax-cn"), true);
	assert.equal(usesAnthropicBearerAuth("anthropic"), false);
});

test("createClient routes Bearer-auth providers through authToken (#3783)", () => {
	const options = buildAnthropicClientOptions(anthropicModel({ provider: "minimax" }), "bearer-token", false);

	assert.equal(options.apiKey, null, "Bearer-auth providers should skip x-api-key auth");
	assert.equal(options.authToken, "bearer-token", "Bearer-auth providers should send authToken instead");
});

// Minimal model stub — only the field resolveAnthropicBaseUrl cares about.
const stubModel = { baseUrl: "https://api.anthropic.com" } as Parameters<typeof resolveAnthropicBaseUrl>[0];

test("resolveAnthropicBaseUrl returns model.baseUrl when ANTHROPIC_BASE_URL is unset (#4140)", (t) => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	});

	delete process.env.ANTHROPIC_BASE_URL;
	assert.equal(resolveAnthropicBaseUrl(stubModel), "https://api.anthropic.com");
});

test("resolveAnthropicBaseUrl prefers ANTHROPIC_BASE_URL over model.baseUrl (#4140)", (t) => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	});

	process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com";
	assert.equal(resolveAnthropicBaseUrl(stubModel), "https://proxy.example.com");
});

test("resolveAnthropicBaseUrl ignores whitespace-only ANTHROPIC_BASE_URL (#4140)", (t) => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	t.after(() => {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	});

	process.env.ANTHROPIC_BASE_URL = "   ";
	assert.equal(resolveAnthropicBaseUrl(stubModel), "https://api.anthropic.com");
});

test("createClient uses resolveAnthropicBaseUrl for all auth paths (#4140)", () => {
	const saved = process.env.ANTHROPIC_BASE_URL;
	try {
		process.env.ANTHROPIC_BASE_URL = "https://proxy.example.com";
		const apiKeyOptions = buildAnthropicClientOptions(anthropicModel(), "api-key", false);
		const bearerOptions = buildAnthropicClientOptions(anthropicModel({ provider: "minimax" }), "bearer-token", false);
		const copilotOptions = buildAnthropicClientOptions(
			anthropicModel({ provider: "github-copilot", baseUrl: "https://api.githubcopilot.com" }),
			"copilot-token",
			false,
		);

		assert.equal(apiKeyOptions.baseURL, "https://proxy.example.com");
		assert.equal(bearerOptions.baseURL, "https://proxy.example.com");
		assert.equal(copilotOptions.baseURL, "https://proxy.example.com");
	} finally {
		if (saved === undefined) delete process.env.ANTHROPIC_BASE_URL;
		else process.env.ANTHROPIC_BASE_URL = saved;
	}
});

test("createClient applies provider-specific header override for kimi-coding UA (#4640)", () => {
	const source = readFileSync(join(__dirname, "..", "..", "src", "providers", "anthropic.ts"), "utf-8");
	assert.ok(
		source.includes('if (provider === "kimi-coding")'),
		"anthropic provider adapter should special-case kimi-coding",
	);
	assert.ok(
		source.includes('{ "User-Agent": "gsd-pi" }'),
		"kimi-coding should default to a neutral User-Agent",
	);
	assert.ok(
		source.includes("defaultProviderHeaders(model.provider)"),
		"provider-specific headers should be merged into defaultHeaders",
	);
});
