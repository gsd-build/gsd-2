import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Api, Model } from "@gsd/pi-ai";
import type { AuthStorage } from "./auth-storage.js";
import { ModelRegistry } from "./model-registry.js";

function createRegistry(hasAuthFn?: (provider: string) => boolean): ModelRegistry {
	const authStorage = {
		setFallbackResolver: () => {},
		onCredentialChange: () => {},
		getOAuthProviders: () => [],
		get: () => undefined,
		hasAuth: hasAuthFn ?? (() => false),
		getApiKey: async () => undefined,
	} as unknown as AuthStorage;

	return new ModelRegistry(authStorage, undefined);
}

function createProviderModel(id: string): NonNullable<Parameters<ModelRegistry["registerProvider"]>[1]["models"]>[number] {
	return {
		id,
		name: id,
		api: "openai-completions",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	};
}

function findModel(registry: ModelRegistry, provider: string, id: string): Model<Api> | undefined {
	return registry.getAvailable().find((m) => m.provider === provider && m.id === id);
}

// ─── Registration ─────────────────────────────────────────────────────────────

describe("ModelRegistry authMode — registration", () => {
	it("registers externalCli provider without apiKey/oauth", () => {
		const registry = createRegistry();
		assert.doesNotThrow(() => {
			registry.registerProvider("cli-provider", {
				authMode: "externalCli",
				baseUrl: "https://cli.local",
				api: "openai-completions",
				models: [createProviderModel("cli-model")],
			});
		});
	});

	it("registers none provider without apiKey/oauth", () => {
		const registry = createRegistry();
		assert.doesNotThrow(() => {
			registry.registerProvider("none-provider", {
				authMode: "none",
				baseUrl: "http://localhost:11434",
				api: "openai-completions",
				models: [createProviderModel("local-model")],
			});
		});
	});

	it("rejects apiKey provider without apiKey or oauth", () => {
		const registry = createRegistry();
		assert.throws(() => {
			registry.registerProvider("apikey-provider", {
				authMode: "apiKey",
				baseUrl: "https://api.local",
				api: "openai-completions",
				models: [createProviderModel("model")],
			});
		});
	});

	it("rejects provider with no authMode and no apiKey/oauth (defaults to apiKey)", () => {
		const registry = createRegistry();
		assert.throws(() => {
			registry.registerProvider("bare-provider", {
				baseUrl: "https://api.local",
				api: "openai-completions",
				models: [createProviderModel("model")],
			});
		});
	});
});

// ─── getProviderAuthMode ──────────────────────────────────────────────────────

describe("ModelRegistry authMode — getProviderAuthMode", () => {
	it("returns apiKey for unregistered (built-in) providers", () => {
		const registry = createRegistry();
		assert.equal(registry.getProviderAuthMode("anthropic"), "apiKey");
	});

	it("returns explicit authMode when set", () => {
		const registry = createRegistry();
		registry.registerProvider("cli", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		assert.equal(registry.getProviderAuthMode("cli"), "externalCli");
	});

	it("returns none when authMode is none", () => {
		const registry = createRegistry();
		registry.registerProvider("local", {
			authMode: "none",
			baseUrl: "http://localhost:11434",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		assert.equal(registry.getProviderAuthMode("local"), "none");
	});
});

// ─── isProviderRequestReady ───────────────────────────────────────────────────

describe("ModelRegistry authMode — isProviderRequestReady", () => {
	it("returns true for externalCli without stored auth", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("cli", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		assert.equal(registry.isProviderRequestReady("cli"), true);
	});

	it("returns true for none without stored auth", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("local", {
			authMode: "none",
			baseUrl: "http://localhost:11434",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		assert.equal(registry.isProviderRequestReady("local"), true);
	});

	it("returns false for apiKey provider without stored auth", () => {
		const registry = createRegistry(() => false);
		assert.equal(registry.isProviderRequestReady("anthropic"), false);
	});

	it("returns true for apiKey provider with stored auth", () => {
		const registry = createRegistry(() => true);
		assert.equal(registry.isProviderRequestReady("anthropic"), true);
	});
});

// ─── isReady callback ─────────────────────────────────────────────────────────

describe("ModelRegistry authMode — isReady callback", () => {
	it("calls isReady and returns its result for externalCli provider", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("cli-down", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			isReady: () => false,
			models: [createProviderModel("m")],
		});
		assert.equal(registry.isProviderRequestReady("cli-down"), false);
	});

	it("calls isReady for apiKey provider (overrides hasAuth)", () => {
		const registry = createRegistry(() => true);
		registry.registerProvider("strict-provider", {
			apiKey: "MY_KEY",
			baseUrl: "https://api.local",
			api: "openai-completions",
			isReady: () => false,
			models: [createProviderModel("m")],
		});
		assert.equal(registry.isProviderRequestReady("strict-provider"), false);
	});

	it("isReady returning true makes provider available", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("healthy-cli", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			isReady: () => true,
			models: [createProviderModel("m")],
		});
		assert.equal(registry.isProviderRequestReady("healthy-cli"), true);
	});

	it("falls through to default behavior when isReady not provided", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("no-callback", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		// externalCli without isReady → true (default)
		assert.equal(registry.isProviderRequestReady("no-callback"), true);
	});
});

// ─── getAvailable ─────────────────────────────────────────────────────────────

describe("ModelRegistry authMode — getAvailable", () => {
	it("includes externalCli models without stored auth", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("cli", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			models: [createProviderModel("cli-model")],
		});
		assert.ok(findModel(registry, "cli", "cli-model"));
	});

	it("includes none models without stored auth", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("local", {
			authMode: "none",
			baseUrl: "http://localhost:11434",
			api: "openai-completions",
			models: [createProviderModel("local-model")],
		});
		assert.ok(findModel(registry, "local", "local-model"));
	});

	it("excludes externalCli models when isReady returns false", () => {
		const registry = createRegistry(() => false);
		registry.registerProvider("cli-down", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			isReady: () => false,
			models: [createProviderModel("m")],
		});
		assert.equal(findModel(registry, "cli-down", "m"), undefined);
	});

	it("excludes apiKey models without stored auth", () => {
		const registry = createRegistry(() => false);
		// Built-in providers have no registeredProviders entry, so authMode defaults to apiKey
		// getAvailable filters by isProviderRequestReady → hasAuth → false
		const available = registry.getAvailable();
		// No models should be available since hasAuth returns false for everything
		assert.equal(available.length, 0);
	});
});

// ─── getApiKey ────────────────────────────────────────────────────────────────

describe("ModelRegistry authMode — getApiKey", () => {
	it("returns undefined for externalCli provider", async () => {
		const registry = createRegistry();
		registry.registerProvider("cli", {
			authMode: "externalCli",
			baseUrl: "https://cli.local",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		const model = registry.getAll().find((m) => m.provider === "cli")!;
		assert.equal(await registry.getApiKey(model), undefined);
	});

	it("returns undefined for none provider", async () => {
		const registry = createRegistry();
		registry.registerProvider("local", {
			authMode: "none",
			baseUrl: "http://localhost:11434",
			api: "openai-completions",
			models: [createProviderModel("m")],
		});
		const model = registry.getAll().find((m) => m.provider === "local")!;
		assert.equal(await registry.getApiKey(model), undefined);
	});

	it("delegates to authStorage for apiKey provider", async () => {
		const registry = createRegistry();
		// authStorage.getApiKey returns undefined (no key configured)
		// For apiKey providers this is an expected "no key" response, not early exit
		const key = await registry.getApiKeyForProvider("anthropic");
		assert.equal(key, undefined);
	});
});
