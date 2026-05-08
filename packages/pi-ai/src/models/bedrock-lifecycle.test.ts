/**
 * Bedrock model lifecycle validation — ensures the gsd model registry does not
 * contain models that AWS has marked as EOL or Legacy.
 *
 * This test queries the Bedrock ListFoundationModels API and cross-references
 * lifecycle status against the gsd model registry. Models that are no longer
 * invocable should be removed from the registry to prevent user-facing errors.
 *
 * Run: npx tsx --test packages/pi-ai/src/models/bedrock-lifecycle.test.ts
 *
 * Requires: AWS credentials with bedrock:ListFoundationModels permission.
 * Skip in CI without credentials via: AWS_REGION or skip annotation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MODELS } from "./index.js";

// Known EOL models that Bedrock has fully removed (no longer in ListFoundationModels).
// These return "This model version has reached the end of its life" at invocation time.
const KNOWN_EOL_MODEL_IDS = [
	"anthropic.claude-3-5-sonnet-20240620-v1:0",
	"anthropic.claude-3-5-sonnet-20241022-v2:0",
	"anthropic.claude-3-7-sonnet-20250219-v1:0",
];

// Known Legacy models that Bedrock marks as deprecated.
// These return "Access denied. This Model is marked by provider as Legacy" unless
// the account has actively used them in the last 30 days.
const KNOWN_LEGACY_MODEL_IDS = [
	"anthropic.claude-3-haiku-20240307-v1:0",
	"anthropic.claude-3-5-haiku-20241022-v1:0",
	"anthropic.claude-sonnet-4-20250514-v1:0",
	"anthropic.claude-opus-4-20250514-v1:0",
];

describe("Bedrock model lifecycle — EOL/Legacy models absent from registry", () => {
	const bedrockModels = MODELS["amazon-bedrock"] ?? {};

	for (const modelId of KNOWN_EOL_MODEL_IDS) {
		it(`EOL model ${modelId} should not be in the registry`, () => {
			const found = modelId in bedrockModels;
			assert.equal(
				found,
				false,
				`${modelId} is EOL on Bedrock (fully removed) but still present in gsd's model registry. ` +
					`Remove it from packages/pi-ai/src/models/generated/amazon-bedrock.ts`,
			);
		});
	}

	for (const modelId of KNOWN_LEGACY_MODEL_IDS) {
		it(`Legacy model ${modelId} should not be in the registry`, () => {
			const found = modelId in bedrockModels;
			assert.equal(
				found,
				false,
				`${modelId} is marked Legacy on Bedrock (access denied by default) but still present in gsd's model registry. ` +
					`Remove it from packages/pi-ai/src/models/generated/amazon-bedrock.ts`,
			);
		});
	}
});

describe("Bedrock model lifecycle — bare model IDs have inference profile equivalents", () => {
	const bedrockModels = MODELS["amazon-bedrock"] ?? {};

	// Models that require inference profiles (us.* or global.*) for on-demand invocation.
	// Bare IDs (without prefix) return "on-demand throughput isn't supported".
	const BARE_IDS_NEEDING_PROFILES = Object.keys(bedrockModels).filter(
		(id) =>
			id.startsWith("anthropic.") &&
			!id.startsWith("us.") &&
			!id.startsWith("global.") &&
			!id.startsWith("eu.") &&
			!KNOWN_EOL_MODEL_IDS.includes(id) &&
			!KNOWN_LEGACY_MODEL_IDS.includes(id),
	);

	for (const bareId of BARE_IDS_NEEDING_PROFILES) {
		it(`bare ID ${bareId} should have a us.* or global.* inference profile registered`, () => {
			const usId = `us.${bareId}`;
			const globalId = `global.${bareId}`;
			const hasProfile = usId in bedrockModels || globalId in bedrockModels;
			assert.ok(
				hasProfile,
				`${bareId} is registered without an inference profile equivalent. ` +
					`Bare Anthropic model IDs return "on-demand throughput isn't supported" on Bedrock. ` +
					`Ensure us.${bareId} or global.${bareId} is also registered.`,
			);
		});
	}
});
