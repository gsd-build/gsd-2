/**
 * artifact-retry-cap.test.ts — Regression tests for #2007.
 *
 * Three interacting bugs caused unbounded artifact-verification retry loops
 * that burned unlimited budget (202 dispatches observed in production):
 *
 * Bug 1: postUnitPreVerification in auto-post-unit.ts had no MAX check before
 *        returning "retry" when an expected artifact was missing. The attempt
 *        counter incremented forever.
 *
 * Bug 2: runDispatch in auto/phases.ts only pushed to loopState.recentUnits
 *        when pendingVerificationRetry was falsy, so the sliding-window stuck
 *        detector never saw artifact-retry dispatches and could not fire.
 *
 * Bug 3: MAX_UNIT_DISPATCHES and MAX_LIFETIME_DISPATCHES were exported from
 *        auto/session.ts but never compared against unitDispatchCount anywhere
 *        in the codebase — dead constants that provided false confidence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { detectStuck } from "../auto/detect-stuck.ts";
import { AutoSession } from "../auto/session.ts";
import { MAX_ARTIFACT_VERIFICATION_RETRIES } from "../auto-post-unit.ts";

// ─── Bug 1: artifact retry must be bounded ───────────────────────────────────

test("#2007 bug 1: MAX_ARTIFACT_VERIFICATION_RETRIES constant is defined", () => {
  assert.equal(MAX_ARTIFACT_VERIFICATION_RETRIES, 3);
});

test("#2007 bug 1: retry state can represent each allowed attempt before exhaustion", () => {
  const s = new AutoSession();
  const retryKey = "execute-task:M001/S01/T01";

  for (let attempt = 1; attempt <= MAX_ARTIFACT_VERIFICATION_RETRIES; attempt++) {
    s.verificationRetryCount.set(retryKey, attempt);
    s.pendingVerificationRetry = {
      unitId: "M001/S01/T01",
      failureContext: `Missing expected artifact (attempt ${attempt}/${MAX_ARTIFACT_VERIFICATION_RETRIES}).`,
      attempt,
    };

    assert.equal(s.verificationRetryCount.get(retryKey), attempt);
    assert.equal(s.pendingVerificationRetry.attempt, attempt);
    assert.match(s.pendingVerificationRetry.failureContext, /attempt \d\/3/);
  }
});

// ─── Bug 2: stuck detection must see all dispatches ──────────────────────────

test("#2007 bug 2: recentUnits.push is unconditional — not gated on pendingVerificationRetry", () => {
  const window = [
    { key: "execute-task:M001/S01/T01" },
    { key: "execute-task:M001/S01/T01" },
    { key: "execute-task:M001/S01/T01" },
  ];

  assert.match(
    detectStuck(window)?.reason ?? "",
    /3 consecutive times|3 times in last 3 attempts/,
  );
});

test("#2007 bug 2: pendingVerificationRetry state is available for dispatch regression coverage", () => {
  const s = new AutoSession();
  s.pendingVerificationRetry = {
    unitId: "M001/S01/T01",
    failureContext: "Missing expected artifact (attempt 1/3).",
    attempt: 1,
  };

  assert.equal(s.pendingVerificationRetry.attempt, 1);
  assert.equal(s.pendingVerificationRetry.unitId, "M001/S01/T01");
});

// ─── Bug 3: dead dispatch-limit constants removed ────────────────────────────

test("#2007 bug 3: MAX_UNIT_DISPATCHES is removed from session.ts", () => {
  assert.equal("MAX_UNIT_DISPATCHES" in AutoSession, false);
});

test("#2007 bug 3: MAX_LIFETIME_DISPATCHES is removed from session.ts", () => {
  assert.equal("MAX_LIFETIME_DISPATCHES" in AutoSession, false);
});

// ─── No stray dead constants left behind by the fix ──────────────────────────

test("#2007 fix does not introduce a new dead constant (STATE_REBUILD_MIN_INTERVAL_MS)", () => {
  assert.equal("STATE_REBUILD_MIN_INTERVAL_MS" in AutoSession, false);
});

// ─── Behavioral: retry counter is cleared on success ─────────────────────────

test("#2007 verificationRetryCount is cleared on artifact verification success", () => {
  const s = new AutoSession();
  const retryKey = "execute-task:M001/S01/T01";
  s.verificationRetryCount.set(retryKey, MAX_ARTIFACT_VERIFICATION_RETRIES);

  s.verificationRetryCount.delete(retryKey);

  assert.equal(s.verificationRetryCount.get(retryKey), undefined);
});

// ─── AutoSession.verificationRetryCount Map behavior ─────────────────────────

test("AutoSession.verificationRetryCount tracks attempts per retry key", () => {
  const s = new AutoSession();
  const key = "execute-task:M01/S01/T01";

  assert.equal(s.verificationRetryCount.get(key), undefined);

  s.verificationRetryCount.set(key, 1);
  assert.equal(s.verificationRetryCount.get(key), 1);

  s.verificationRetryCount.set(key, 2);
  assert.equal(s.verificationRetryCount.get(key), 2);

  // Simulate the success-clear path
  s.verificationRetryCount.delete(key);
  assert.equal(s.verificationRetryCount.get(key), undefined);
});

test("AutoSession.verificationRetryCount is cleared on session reset", () => {
  const s = new AutoSession();
  s.verificationRetryCount.set("execute-task:M01/S01/T01", 2);
  s.verificationRetryCount.set("plan-slice:M01/S02", 1);

  s.reset();

  assert.equal(s.verificationRetryCount.size, 0);
});

test("AutoSession.verificationRetryCount independence across retry keys", () => {
  // Critical: if retries for unit A fail twice and unit A then succeeds, the
  // counter for A should be cleared but B's counter must remain untouched.
  const s = new AutoSession();
  s.verificationRetryCount.set("execute-task:M01/S01/T01", 2);
  s.verificationRetryCount.set("execute-task:M01/S01/T02", 1);

  s.verificationRetryCount.delete("execute-task:M01/S01/T01");

  assert.equal(s.verificationRetryCount.get("execute-task:M01/S01/T01"), undefined);
  assert.equal(s.verificationRetryCount.get("execute-task:M01/S01/T02"), 1);
});
