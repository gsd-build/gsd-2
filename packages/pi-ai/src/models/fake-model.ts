/**
 * GSD-2 fake model — paired with the fake LLM provider for e2e tests.
 *
 * Only registered when `GSD_FAKE_LLM_TRANSCRIPT` env var is set, via the
 * conditional branch in models/index.ts. The model is invisible to normal
 * users; it shows up in `--list-models` only inside e2e test subprocesses.
 */

import type { Model } from "../types.js";

export const FAKE_PROVIDER = "gsd-fake" as const;
export const FAKE_MODEL_ID = "gsd-fake-model" as const;

export const FAKE_MODEL: Model<"fake"> = {
	id: FAKE_MODEL_ID,
	name: "GSD Fake (e2e replay)",
	api: "fake",
	provider: FAKE_PROVIDER,
	baseUrl: "https://fake.gsd.local/v1",
	reasoning: false,
	input: ["text"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	},
	contextWindow: 200_000,
	maxTokens: 8_192,
};
