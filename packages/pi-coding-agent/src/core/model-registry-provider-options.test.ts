import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { AuthStorage } from "./auth-storage.js";
import { ModelRegistry } from "./model-registry.js";

describe("ModelRegistry custom models providerOptions", () => {
	it("preserves providerOptions from models.json custom models", () => {
		const dir = mkdtempSync(join(tmpdir(), "gsd-provider-options-"));
		const modelsPath = join(dir, "models.json");
		writeFileSync(
			modelsPath,
			JSON.stringify({
				providers: {
					spark: {
						apiKey: "dummy-key",
						baseUrl: "http://127.0.0.1:18000/v1",
						api: "openai-completions",
						models: [
							{
								id: "qwen3.6-thinking",
								name: "Qwen 3.6 Thinking",
								reasoning: true,
								contextWindow: 262144,
								maxTokens: 32768,
								providerOptions: {
									actualModelId: "RedHatAI/Qwen3.6-35B-A3B-NVFP4",
									payload: {
										chat_template_kwargs: { enable_thinking: true },
									},
								},
							},
						],
					},
				},
			}),
		);

		const registry = new ModelRegistry(AuthStorage.inMemory({}), modelsPath);
		const model = registry.find("spark", "qwen3.6-thinking");

		assert.ok(model);
		assert.deepEqual(model.providerOptions, {
			actualModelId: "RedHatAI/Qwen3.6-35B-A3B-NVFP4",
			payload: {
				chat_template_kwargs: { enable_thinking: true },
			},
		});
	});
});
