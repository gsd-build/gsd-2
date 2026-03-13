import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { attachWatcherErrorHandler } from "../../packages/pi-coding-agent/src/utils/watcher-safety.ts";

class FakeWatcher extends EventEmitter {
	closed = false;

	close(): void {
		this.closed = true;
	}
}

test("attachWatcherErrorHandler closes the watcher and swallows error events", () => {
	const watcher = new FakeWatcher();
	let onErrorCalls = 0;

	attachWatcherErrorHandler(watcher as any, () => {
		onErrorCalls++;
	});

	assert.doesNotThrow(() => {
		watcher.emit("error", new Error("EMFILE"));
	});
	assert.equal(watcher.closed, true);
	assert.equal(onErrorCalls, 1);
});
