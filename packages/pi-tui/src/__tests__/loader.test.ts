import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Loader } from "../components/loader.js";
import type { TUI } from "../tui.js";

const stubUI = { requestRender() {} } as unknown as TUI;
const identity = (s: string) => s;

describe("Loader — process exit safety", () => {
	it("does not keep the Node event loop alive (animation interval is unref'd)", () => {
		// The loader animation is purely cosmetic. If its 80ms interval is ref'd,
		// every process that creates a Loader hangs on exit until stop() runs.
		// That regression made `node --test` never terminate and silently burned
		// CI's entire build-job timeout budget.
		const loader = new Loader(stubUI, identity, identity);
		try {
			const interval = (loader as unknown as { intervalId: NodeJS.Timeout | null })
				.intervalId;
			assert.ok(interval, "loader should start its animation interval on construction");
			assert.equal(
				interval.hasRef(),
				false,
				"loader interval must be unref'd so it never blocks process exit",
			);
		} finally {
			loader.dispose();
		}
	});
});
