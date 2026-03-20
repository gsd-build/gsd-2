/**
 * agent-end-retry.test.ts — Regression checks for the post-#1419 agent_end model.
 *
 * The old recursive handleAgentEnd retry path is gone. The loop now keeps
 * pendingResolve + pendingAgentEndQueue on AutoSession, and handleAgentEnd is
 * only a thin compatibility wrapper around resolveAgentEnd().
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_TS_PATH = join(__dirname, "..", "auto.ts");
const SESSION_TS_PATH = join(__dirname, "..", "auto", "session.ts");

function getAutoTsSource(): string {
  return readFileSync(AUTO_TS_PATH, "utf-8");
}

function getSessionTsSource(): string {
  return readFileSync(SESSION_TS_PATH, "utf-8");
}

test("AutoSession declares pending agent_end queue state", () => {
  const source = getSessionTsSource();
  assert.ok(
    source.includes("pendingResolve"),
    "AutoSession must declare pendingResolve for the in-flight unit promise",
  );
  assert.ok(
    source.includes("pendingAgentEndQueue"),
    "AutoSession must declare pendingAgentEndQueue for between-iteration agent_end events",
  );
});

test("AutoSession reset clears pending agent_end queue state", () => {
  const source = getSessionTsSource();
  const resetIdx = source.indexOf("reset(): void");
  assert.ok(resetIdx > -1, "AutoSession must have a reset() method");
  const resetBlock = source.slice(resetIdx, resetIdx + 4000);
  assert.ok(
    resetBlock.includes("this.pendingResolve = null"),
    "reset() must clear pendingResolve",
  );
  assert.ok(
    resetBlock.includes("this.pendingAgentEndQueue = []"),
    "reset() must clear pendingAgentEndQueue",
  );
});

test("legacy pendingAgentEndRetry state is gone", () => {
  const source = getSessionTsSource();
  assert.ok(
    !source.includes("pendingAgentEndRetry"),
    "AutoSession should no longer use legacy pendingAgentEndRetry state",
  );
});

test("handleAgentEnd is a thin compatibility wrapper", () => {
  const source = getAutoTsSource();
  const fnIdx = source.indexOf("export async function handleAgentEnd");
  assert.ok(fnIdx > -1, "handleAgentEnd must exist in auto.ts");
  const fnBlock = source.slice(fnIdx, source.indexOf("\n// ─── ", fnIdx + 100));

  assert.ok(
    fnBlock.includes("resolveAgentEnd("),
    "handleAgentEnd must delegate to resolveAgentEnd",
  );
  assert.ok(
    !fnBlock.includes("pendingAgentEndRetry"),
    "handleAgentEnd must not use legacy retry state",
  );
  assert.ok(
    !fnBlock.includes("dispatchNextUnit"),
    "handleAgentEnd must not dispatch recursively",
  );
});
