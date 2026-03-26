/**
 * terminated-transient.test.ts — Regression test for #2309.
 *
 * classifyProviderError should treat 'terminated' errors (process killed,
 * connection reset) as transient with auto-resume, not permanent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { classifyProviderError } from "../provider-error-pause.ts";

test("#2309: 'terminated' errors should be classified as transient", () => {
  const result = classifyProviderError("terminated");
  assert.equal(result.isTransient, true, "'terminated' should be transient");
  assert.equal(result.isRateLimit, false, "'terminated' is not a rate limit");
  assert.ok(result.suggestedDelayMs > 0, "'terminated' should have a retry delay");
});

test("#2309: 'connection reset' errors should be classified as transient", () => {
  const result = classifyProviderError("connection reset by peer");
  assert.equal(result.isTransient, true, "'connection reset' should be transient");
});

test("#2309: 'other side closed' errors should be classified as transient", () => {
  const result = classifyProviderError("other side closed the connection");
  assert.equal(result.isTransient, true, "'other side closed' should be transient");
});

test("#2309: 'fetch failed' errors should be classified as transient", () => {
  const result = classifyProviderError("fetch failed: network error");
  assert.equal(result.isTransient, true, "'fetch failed' should be transient");
});

test("#2309: 'connection refused' errors should be classified as transient", () => {
  const result = classifyProviderError("ECONNREFUSED: connection refused");
  assert.equal(result.isTransient, true, "'connection refused' should be transient");
});

test("#2309: permanent errors are still permanent", () => {
  const authResult = classifyProviderError("unauthorized: invalid API key");
  assert.equal(authResult.isTransient, false, "auth errors should stay permanent");
  assert.equal(authResult.suggestedDelayMs, 0, "permanent errors have no delay");
});

test("#2309: rate limits are still transient", () => {
  const rlResult = classifyProviderError("rate limit exceeded (429)");
  assert.equal(rlResult.isTransient, true, "rate limits are still transient");
  assert.equal(rlResult.isRateLimit, true, "rate limits are flagged as rate limits");
});
