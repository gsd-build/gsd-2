import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyOpenAICompatibleProviderOptions } from "./openai-completions.js";
import type { Model } from "../types.js";

function makeModel(overrides: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
	return {
		id: "alias-model",
		name: "Alias Model",
		api: "openai-completions",
		provider: "spark",
		baseUrl: "http://127.0.0.1:18000/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 262144,
		maxTokens: 32768,
		...overrides,
	};
}

describe("applyOpenAICompatibleProviderOptions", () => {
	it("maps alias ids to the actual served model and applies payload defaults", () => {
		const model = makeModel({
			providerOptions: {
				actualModelId: "RedHatAI/Qwen3.6-35B-A3B-NVFP4",
				payload: {
					temperature: 1,
					top_p: 0.95,
					top_k: 20,
					min_p: 0,
					presence_penalty: 1.5,
					repetition_penalty: 1,
					chat_template_kwargs: {
						enable_thinking: true,
						preserve_thinking: true,
					},
				},
			},
		});

		const params = applyOpenAICompatibleProviderOptions(model, {
			model: model.id,
			messages: [],
			stream: true,
		} as any);

		assert.equal(params.model, "RedHatAI/Qwen3.6-35B-A3B-NVFP4");
		assert.equal(params.temperature, 1);
		assert.equal((params as any).top_p, 0.95);
		assert.equal((params as any).top_k, 20);
		assert.equal((params as any).min_p, 0);
		assert.equal((params as any).presence_penalty, 1.5);
		assert.equal((params as any).repetition_penalty, 1);
		assert.deepEqual((params as any).chat_template_kwargs, {
			enable_thinking: true,
			preserve_thinking: true,
		});
	});

	it("does not overwrite an explicit request temperature", () => {
		const model = makeModel({
			providerOptions: {
				payload: {
					temperature: 1,
				},
			},
		});

		const params = applyOpenAICompatibleProviderOptions(model, {
			model: model.id,
			messages: [],
			stream: true,
			temperature: 0.2,
		} as any);

		assert.equal(params.temperature, 0.2);
	});
});
