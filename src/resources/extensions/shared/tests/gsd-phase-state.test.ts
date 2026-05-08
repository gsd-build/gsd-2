// GSD2 Shared Phase State Coordination Tests

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	activateGSD,
	configureGSDPhaseAudit,
	deactivateGSD,
	setCurrentPhase,
	clearCurrentPhase,
	isGSDActive,
	getCurrentPhase,
} from "../gsd-phase-state.js";

describe("gsd-phase-state", () => {
	beforeEach(() => {
		deactivateGSD();
	});

	it("tracks active/inactive state", () => {
		assert.equal(isGSDActive(), false);
		activateGSD();
		assert.equal(isGSDActive(), true);
		deactivateGSD();
		assert.equal(isGSDActive(), false);
	});

	it("tracks the current phase when active", () => {
		activateGSD();
		assert.equal(getCurrentPhase(), null);
		assert.equal(setCurrentPhase("plan-milestone"), true);
		assert.equal(getCurrentPhase(), "plan-milestone");
		clearCurrentPhase();
		assert.equal(getCurrentPhase(), null);
	});

	it("rejects phase changes while inactive", () => {
		assert.equal(setCurrentPhase("plan-milestone"), false);
		activateGSD();
		assert.equal(getCurrentPhase(), null);
	});

	it("returns null phase when inactive even if phase was set", () => {
		activateGSD();
		setCurrentPhase("plan-milestone");
		deactivateGSD();
		assert.equal(getCurrentPhase(), null);
	});

	it("deactivation clears the current phase", () => {
		activateGSD();
		setCurrentPhase("execute-task");
		deactivateGSD();
		activateGSD();
		assert.equal(getCurrentPhase(), null);
	});

	it("deactivation clears the audit context so later events do not carry stale trace data", () => {
		const basePath = mkdtempSync(join(tmpdir(), "gsd-phase-state-audit-"));
		try {
			activateGSD({ basePath, traceId: "stale-trace", causedBy: "test" });
			setCurrentPhase("plan-milestone");
			deactivateGSD();

			// Re-activate WITHOUT a context. If deactivate did not clear the
			// stored context, this setCurrentPhase would emit an audit event
			// using "stale-trace".
			activateGSD();
			setCurrentPhase("execute-task");

			const eventsPath = join(basePath, ".gsd", "audit", "events.jsonl");
			if (existsSync(eventsPath)) {
				const contents = readFileSync(eventsPath, "utf-8");
				assert.equal(
					contents.includes("stale-trace") &&
						contents.split("\n").filter((line) => line.includes("stale-trace") && line.includes("execute-task")).length > 0,
					false,
					"execute-task phase change must not be emitted under the deactivated trace",
				);
			}
		} finally {
			configureGSDPhaseAudit(null);
			deactivateGSD();
			rmSync(basePath, { recursive: true, force: true });
		}
	});
});
