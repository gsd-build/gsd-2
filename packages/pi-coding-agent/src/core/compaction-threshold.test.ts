// pi-coding-agent / Regression tests for compaction threshold percent (#5475)

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldCompact, type CompactionSettings } from "./compaction/compaction.js";
import { SettingsManager } from "./settings-manager.js";

const REGISTRY_DEFAULTS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16_384,
	keepRecentTokens: 20_000,
};

describe("shouldCompact — thresholdPercent (#5475)", () => {
	it("uses absolute reserveTokens when thresholdPercent is unset (legacy behavior)", () => {
		// 200K window, 16384 reserve → fires at 183_617 tokens
		assert.equal(shouldCompact(183_616, 200_000, REGISTRY_DEFAULTS), false);
		assert.equal(shouldCompact(183_617, 200_000, REGISTRY_DEFAULTS), true);
	});

	it("uses thresholdPercent when set, ignoring reserveTokens", () => {
		const settings: CompactionSettings = { ...REGISTRY_DEFAULTS, thresholdPercent: 0.7 };
		// 200K * 0.7 = 140_000 → fires above that
		assert.equal(shouldCompact(140_000, 200_000, settings), false);
		assert.equal(shouldCompact(140_001, 200_000, settings), true);
		// reserveTokens-based math would have said false at 183_616 — the percent override changes that
		assert.equal(shouldCompact(150_000, 200_000, settings), true);
	});

	it("falls back to reserveTokens when thresholdPercent is out of range", () => {
		// Defense in depth: reject 0, 1, negative, NaN, Infinity
		for (const bad of [0, 1, -0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			const settings: CompactionSettings = { ...REGISTRY_DEFAULTS, thresholdPercent: bad };
			assert.equal(
				shouldCompact(183_616, 200_000, settings),
				false,
				`bad=${bad} should fall back to reserveTokens math`,
			);
			assert.equal(shouldCompact(183_617, 200_000, settings), true, `bad=${bad}`);
		}
	});

	it("respects enabled=false regardless of thresholdPercent", () => {
		const settings: CompactionSettings = {
			...REGISTRY_DEFAULTS,
			enabled: false,
			thresholdPercent: 0.5,
		};
		assert.equal(shouldCompact(199_999, 200_000, settings), false);
	});

	it("scales with contextWindow — same percent, different windows", () => {
		const settings: CompactionSettings = { ...REGISTRY_DEFAULTS, thresholdPercent: 0.8 };
		// 100K window: fires above 80_000
		assert.equal(shouldCompact(80_000, 100_000, settings), false);
		assert.equal(shouldCompact(80_001, 100_000, settings), true);
		// 1M window: fires above 800_000
		assert.equal(shouldCompact(800_000, 1_000_000, settings), false);
		assert.equal(shouldCompact(800_001, 1_000_000, settings), true);
	});
});

describe("SettingsManager — compaction threshold override (#5475)", () => {
	it("getCompactionThresholdPercent returns undefined by default", () => {
		const sm = SettingsManager.inMemory({});
		assert.equal(sm.getCompactionThresholdPercent(), undefined);
		assert.equal(sm.getCompactionSettings().thresholdPercent, undefined);
	});

	it("setCompactionThresholdOverride applies in-memory and is exposed via getCompactionSettings", () => {
		const sm = SettingsManager.inMemory({});
		sm.setCompactionThresholdOverride(0.7);
		assert.equal(sm.getCompactionThresholdPercent(), 0.7);
		assert.equal(sm.getCompactionSettings().thresholdPercent, 0.7);
	});

	it("setCompactionThresholdOverride(undefined) clears a prior override", () => {
		const sm = SettingsManager.inMemory({});
		sm.setCompactionThresholdOverride(0.7);
		sm.setCompactionThresholdOverride(undefined);
		assert.equal(sm.getCompactionThresholdPercent(), undefined);
		assert.equal(sm.getCompactionSettings().thresholdPercent, undefined);
	});

	it("setCompactionThresholdOverride preserves other compaction fields (enabled, reserveTokens)", () => {
		const sm = SettingsManager.inMemory({
			compaction: { enabled: true, reserveTokens: 30_000, keepRecentTokens: 25_000 },
		});
		sm.setCompactionThresholdOverride(0.6);
		const settings = sm.getCompactionSettings();
		assert.equal(settings.enabled, true);
		assert.equal(settings.reserveTokens, 30_000);
		assert.equal(settings.keepRecentTokens, 25_000);
		assert.equal(settings.thresholdPercent, 0.6);
	});

	it("setCompactionThresholdOverride works when no compaction config exists yet", () => {
		const sm = SettingsManager.inMemory({});
		sm.setCompactionThresholdOverride(0.85);
		assert.equal(sm.getCompactionThresholdPercent(), 0.85);
		// Other compaction fields fall back to their defaults
		const settings = sm.getCompactionSettings();
		assert.equal(settings.enabled, true);
		assert.equal(typeof settings.reserveTokens, "number");
		assert.equal(typeof settings.keepRecentTokens, "number");
	});
});

describe("end-to-end — getCompactionSettings + shouldCompact (#5475)", () => {
	it("70% threshold on a 200K window fires at the documented bug-report value (140_001 not 183_617)", () => {
		const sm = SettingsManager.inMemory({});
		sm.setCompactionThresholdOverride(0.7);
		const settings = sm.getCompactionSettings();

		assert.equal(shouldCompact(140_000, 200_000, settings), false);
		assert.equal(shouldCompact(140_001, 200_000, settings), true);
		// Pre-fix behavior would have required 183_617 — verify we no longer wait that long
		assert.equal(shouldCompact(150_000, 200_000, settings), true);
	});
});
