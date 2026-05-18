import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { installAbortSignalTimeoutReasonListener } from "./abort-signal-timeout.js";

const originalTimeout = AbortSignal.timeout;
type AbortListener = Parameters<AbortSignal["addEventListener"]>[1];
type AbortListenerOptions = Parameters<AbortSignal["addEventListener"]>[2];

afterEach(() => {
	AbortSignal.timeout = originalTimeout;
});

test("AbortSignal.timeout installs a one-shot abort listener that reads the timeout reason", () => {
	let requestedDelay: number | undefined;
	let reasonWasRead = false;
	let registered:
		| {
				type: string;
				listener: AbortListener;
				options?: AbortListenerOptions;
		  }
		| undefined;

	const fakeSignal = {
		get reason() {
			reasonWasRead = true;
			return new DOMException("operation aborted due to timeout", "TimeoutError");
		},
		addEventListener(
			type: string,
			listener: AbortListener,
			options?: AbortListenerOptions,
		) {
			registered = { type, listener, options };
		},
	} as unknown as AbortSignal;

	AbortSignal.timeout = ((delay: number) => {
		requestedDelay = delay;
		return fakeSignal;
	}) as typeof AbortSignal.timeout;

	installAbortSignalTimeoutReasonListener();

	const signal = AbortSignal.timeout(25);

	assert.equal(signal, fakeSignal);
	assert.equal(requestedDelay, 25);
	assert.equal(registered?.type, "abort");
	assert.equal(typeof registered?.options === "object" ? registered.options.once : false, true);
	assert.equal(reasonWasRead, false);

	assert.ok(registered, "timeout signal should register an abort listener");
	if (typeof registered.listener === "function") {
		registered.listener.call(fakeSignal, new Event("abort"));
	} else {
		registered.listener.handleEvent(new Event("abort"));
	}

	assert.equal(reasonWasRead, true);
});

test("installAbortSignalTimeoutReasonListener is idempotent — second call does not re-wrap", () => {
	installAbortSignalTimeoutReasonListener();
	const afterFirstInstall = AbortSignal.timeout;
	installAbortSignalTimeoutReasonListener();
	assert.equal(
		AbortSignal.timeout,
		afterFirstInstall,
		"AbortSignal.timeout should not be re-wrapped",
	);
});
