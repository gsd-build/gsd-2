import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
	setActiveGSDPhase,
	setGSDAutoActive,
	getActiveGSDPhase,
	isGSDAutoActive,
} from "../gsd-phase-state.js";

describe("gsd-phase-state", () => {
	beforeEach(() => {
		setGSDAutoActive(false);
		setActiveGSDPhase(null);
	});

	it("defaults to inactive with no phase", () => {
		assert.equal(isGSDAutoActive(), false);
		assert.equal(getActiveGSDPhase(), null);
	});

	it("tracks auto-mode active state", () => {
		setGSDAutoActive(true);
		assert.equal(isGSDAutoActive(), true);

		setGSDAutoActive(false);
		assert.equal(isGSDAutoActive(), false);
	});

	it("tracks active phase", () => {
		setActiveGSDPhase("plan-milestone");
		assert.equal(getActiveGSDPhase(), "plan-milestone");

		setActiveGSDPhase("execute-task");
		assert.equal(getActiveGSDPhase(), "execute-task");

		setActiveGSDPhase(null);
		assert.equal(getActiveGSDPhase(), null);
	});

	it("clears phase when auto-mode is deactivated", () => {
		setGSDAutoActive(true);
		setActiveGSDPhase("plan-slice");
		assert.equal(getActiveGSDPhase(), "plan-slice");

		setGSDAutoActive(false);
		assert.equal(getActiveGSDPhase(), null);
	});
});
