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
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..");

const postUnitSrc = readFileSync(join(dir, "auto-post-unit.ts"), "utf-8");
const phasesSrc = readFileSync(join(dir, "auto", "phases.ts"), "utf-8");
const sessionSrc = readFileSync(join(dir, "auto", "session.ts"), "utf-8");
const autoSrc = readFileSync(join(dir, "auto.ts"), "utf-8");

// ─── Bug 1: artifact retry must be bounded ───────────────────────────────────

test("#2007 bug 1: MAX_ARTIFACT_VERIFICATION_RETRIES constant is defined", () => {
  assert.ok(
    postUnitSrc.includes("MAX_ARTIFACT_VERIFICATION_RETRIES"),
    "auto-post-unit.ts must define MAX_ARTIFACT_VERIFICATION_RETRIES",
  );
});

test("#2007 bug 1: attempt is compared against MAX_ARTIFACT_VERIFICATION_RETRIES before returning retry", () => {
  // Find the artifact retry block
  const retryIdx = postUnitSrc.indexOf("return \"retry\"");
  assert.ok(retryIdx !== -1, "return \"retry\" must exist in postUnitPreVerification");

  // The MAX check must appear before the return "retry"
  const maxIdx = postUnitSrc.indexOf("MAX_ARTIFACT_VERIFICATION_RETRIES");
  assert.ok(maxIdx !== -1, "MAX_ARTIFACT_VERIFICATION_RETRIES must be referenced");
  assert.ok(
    maxIdx < retryIdx,
    "MAX_ARTIFACT_VERIFICATION_RETRIES check must appear before return \"retry\"",
  );
});

test("#2007 bug 1: exhaustion path pauses auto-mode instead of silently continuing", () => {
  // When retries are exhausted, the code must call pauseAuto (not just fall through)
  const exhaustionIdx = postUnitSrc.indexOf("MAX_ARTIFACT_VERIFICATION_RETRIES");
  const pauseIdx = postUnitSrc.indexOf("pauseAuto", exhaustionIdx);
  const retryIdx = postUnitSrc.indexOf("return \"retry\"");

  assert.ok(
    pauseIdx !== -1 && pauseIdx < retryIdx,
    "pauseAuto must be called in the exhaustion branch before return \"retry\"",
  );
});

test("#2007 bug 1: failure context message includes attempt count and max", () => {
  // The user-facing message should show progress, e.g. "(attempt 1/3)"
  assert.ok(
    postUnitSrc.includes("MAX_ARTIFACT_VERIFICATION_RETRIES}"),
    "retry notification message should include the max retry count",
  );
});

// ─── Bug 2: stuck detection must see all dispatches ──────────────────────────

test("#2007 bug 2: recentUnits.push is unconditional — not gated on pendingVerificationRetry", () => {
  // Find the push call
  const pushIdx = phasesSrc.indexOf("recentUnits.push");
  assert.ok(pushIdx !== -1, "recentUnits.push must exist in phases.ts");

  // Find the pendingVerificationRetry check
  const pendingCheckIdx = phasesSrc.indexOf("!s.pendingVerificationRetry");
  assert.ok(pendingCheckIdx !== -1, "pendingVerificationRetry guard must exist");

  // The push must come BEFORE the pendingVerificationRetry guard
  assert.ok(
    pushIdx < pendingCheckIdx,
    "recentUnits.push must be unconditional — it must appear before the !pendingVerificationRetry check",
  );
});

test("#2007 bug 2: detectStuck is still inside the pendingVerificationRetry guard", () => {
  // detectStuck should only run when NOT in a retry — to avoid false positives
  // during legitimate retries, but now the window is always populated.
  const pendingCheckIdx = phasesSrc.indexOf("!s.pendingVerificationRetry");
  const detectStuckIdx = phasesSrc.indexOf("detectStuck(", pendingCheckIdx);

  assert.ok(
    detectStuckIdx !== -1 && detectStuckIdx > pendingCheckIdx,
    "detectStuck call must remain inside the !pendingVerificationRetry block",
  );
});

// ─── Bug 3: dead dispatch-limit constants removed ────────────────────────────

test("#2007 bug 3: MAX_UNIT_DISPATCHES is removed from session.ts", () => {
  assert.ok(
    !sessionSrc.includes("MAX_UNIT_DISPATCHES"),
    "MAX_UNIT_DISPATCHES was never enforced and must be removed to prevent false confidence",
  );
});

test("#2007 bug 3: MAX_LIFETIME_DISPATCHES is removed from session.ts", () => {
  assert.ok(
    !sessionSrc.includes("MAX_LIFETIME_DISPATCHES"),
    "MAX_LIFETIME_DISPATCHES was never enforced and must be removed to prevent false confidence",
  );
});

test("#2007 bug 3: dead constants are not re-exported from auto.ts", () => {
  assert.ok(
    !autoSrc.includes("MAX_UNIT_DISPATCHES"),
    "MAX_UNIT_DISPATCHES must not be re-exported from auto.ts",
  );
  assert.ok(
    !autoSrc.includes("MAX_LIFETIME_DISPATCHES"),
    "MAX_LIFETIME_DISPATCHES must not be re-exported from auto.ts",
  );
});
